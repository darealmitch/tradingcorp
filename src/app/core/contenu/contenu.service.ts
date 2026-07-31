import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import {
  LeconEtape,
  LeconJouable,
  LeconResume,
  Module,
  ModuleParcours,
  Parcours,
  ProgressionResume,
  Ressource,
} from './apprentissage.model';

/**
 * Le programme et le parcours d'un apprenant : catalogue des modules, contenu
 * jouable d'une leçon, progression personnelle.
 *
 * Les agrégats d'administration (suivi des apprenants, compteurs, inscriptions
 * récentes) vivent dans `PilotageService` : ils répondent à d'autres questions,
 * pour d'autres écrans, et n'ont pas à peser sur l'API vue par le parcours.
 *
 * La RLS reste l'autorité d'accès — ce service ne filtre rien lui-même. Ce qui
 * ne dispense pas de distinguer « rien à afficher » de « la lecture a
 * échoué » : c'est le rôle d'`AccesDonnees`, par où passent tous les appels.
 */
@Injectable({ providedIn: 'root' })
export class ContenuService {
  private readonly acces = inject(AccesDonnees);

  /**
   * Parcours de l'utilisateur : sa formation (inscription active, sinon la
   * 1re formation publiée en teaser) + les états des modules calculés côté
   * serveur (RPC etats_modules). Le front ne fait qu'afficher ces états.
   */
  async chargerParcours(): Promise<Parcours | null> {
    const inscription = await this.acces.lire<{
      id_formation?: string;
      formations?: { titre: string } | null;
    } | null>(
      'lecture de l’inscription active',
      this.acces
        .table('inscriptions')
        .select('id_formation, formations(titre)')
        .eq('statut', 'active')
        .limit(1)
        .maybeSingle(),
      null,
    );

    let idFormation = inscription?.id_formation ?? null;
    let titre = inscription?.formations?.titre ?? null;
    const inscrit = idFormation !== null;

    if (!idFormation) {
      const formation = await this.acces.lire<{ id_formation?: string; titre?: string } | null>(
        'lecture de la formation en vitrine',
        this.acces
          .table('formations')
          .select('id_formation, titre')
          .eq('est_publiee', true)
          .order('prix_centimes')
          .limit(1)
          .maybeSingle(),
        null,
      );
      idFormation = formation?.id_formation ?? null;
      titre = formation?.titre ?? null;
    }
    if (!idFormation) {
      return null;
    }

    const modules = await this.acces.lire<ModuleParcours[]>(
      'lecture des états de modules',
      this.acces.appel('etats_modules', { p_id_formation: idFormation }),
      [],
    );
    return { id_formation: idFormation, titre: titre ?? 'Formation', inscrit, modules };
  }

  /**
   * Modules (sections) et leurs étapes, dans l'ordre du programme.
   * Les ressources complémentaires sont jointes pour que le back-office
   * affiche l'inventaire média complet d'une étape — y compris les ressources
   * désactivées, que la RLS laisse passer pour le staff.
   */
  async chargerStructure(): Promise<Module[]> {
    return this.acces.lire<Module[]>(
      'lecture du programme',
      this.acces
        .table('sections')
        .select(
          'id_section, titre, description, position, est_publiee, ' +
            'lecons(id_lecon, id_section, titre, type, position, duree_s, est_publiee, ' +
            'video_provider, video_provider_id, video_url, pdf_public_id, ' +
            'ressources(id_ressource, nom, type, est_active, cloudinary_public_id, url, contenu))',
        )
        .order('position')
        .order('position', { referencedTable: 'lecons' }),
      [],
    );
  }

  /** Étapes d'un module avec leur état (RPC `etats_lecons` — stepper/timeline). */
  async etatsLecons(idSection: string): Promise<LeconEtape[]> {
    return this.acces.lire<LeconEtape[]>(
      'lecture des états d’étapes',
      this.acces.appel('etats_lecons', { p_id_section: idSection }),
      [],
    );
  }

  /**
   * Contenu jouable d'une étape (RPC `lecon_contenu`) : seule voie de lecture.
   * Aucune ligne si l'étape n'est pas déverrouillée ; PDF/quiz redigés tant
   * que la vidéo n'est pas terminée. Les ressources complémentaires suivent
   * leur propre RLS (déjà gatée par le même déblocage séquentiel).
   */
  async chargerLeconJouable(idLecon: string): Promise<LeconJouable | null> {
    const [lecon, ressources] = await Promise.all([
      this.acces.lire<LeconJouable | null>(
        'lecture du contenu de l’étape',
        this.acces.appel('lecon_contenu', { p_id_lecon: idLecon }).maybeSingle(),
        null,
      ),
      // Les ressources inactives et les leçons verrouillées sont écartées par
      // la RLS (`ressources_select_gated`) : rien à filtrer ici.
      this.acces.lire<Ressource[]>(
        'lecture des ressources de l’étape',
        this.acces
          .table('ressources')
          .select(
            'id_ressource, nom, type, description, type_mime, cloudinary_public_id, ' +
              'chemin_storage, url, contenu, langage, taille, position',
          )
          .eq('id_lecon', idLecon)
          .order('position')
          .order('date_creation'),
        [],
      ),
    ]);
    if (!lecon) {
      return null;
    }
    return { ...lecon, ressources };
  }

  /**
   * Valide un chapitre vidéo ou article (pose terminee_le côté serveur, ce qui
   * déverrouille le chapitre suivant). Interdit pour un chapitre quiz : celui-ci
   * se valide uniquement via corriger-quiz. Le client ne peut pas écrire
   * terminee_le en direct — la RPC vérifie le type et le déblocage.
   *
   * Rend le refus du serveur, déjà rédigé en français (« Chapitre verrouillé »,
   * « La vidéo doit être visionnée jusqu'à la fin »), ou null si la validation
   * est passée. Ces messages existaient déjà côté base ; ils étaient jetés.
   */
  async terminerLecon(idLecon: string): Promise<string | null> {
    return this.acces.ecrire(
      'validation de l’étape',
      this.acces.appel('terminer_lecon', { p_id_lecon: idLecon }),
      'La validation de l’étape a échoué. Réessaie.',
    );
  }

  /**
   * Signale que la vidéo est terminée — déverrouille le PDF. Signal client
   * (comme la reprise vidéo), non sécuritaire.
   */
  async marquerVideoTerminee(idLecon: string): Promise<string | null> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return null;
    }
    return this.acces.ecrire(
      'enregistrement de la fin de vidéo',
      this.acces
        .table('progression_lecons')
        .upsert(
          { id_profil: idProfil, id_lecon: idLecon, video_terminee_le: new Date().toISOString() },
          { onConflict: 'id_profil,id_lecon' },
        ),
      'La fin de la vidéo n’a pas pu être enregistrée.',
    );
  }

  /**
   * Sauvegarde la position de lecture vidéo (reprise).
   *
   * Seule écriture dont l'échec ne remonte pas à l'appelant : elle part toutes
   * les quelques secondes pendant la lecture, et une alerte à chaque
   * intermittence réseau serait plus nuisible que le défaut qu'elle signale.
   * L'incident est enregistré comme les autres, il reste donc diagnosticable.
   */
  async enregistrerPosition(idLecon: string, secondes: number): Promise<void> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return;
    }
    await this.acces.ecrire(
      'enregistrement de la position de lecture',
      this.acces
        .table('progression_lecons')
        .upsert(
          { id_profil: idProfil, id_lecon: idLecon, position_video_s: Math.floor(secondes) },
          { onConflict: 'id_profil,id_lecon' },
        ),
    );
  }

  /** Progression du profil connecté : leçons terminées / leçons accessibles. */
  async maProgression(): Promise<ProgressionResume> {
    const [total, terminees] = await Promise.all([
      this.acces.compter(
        'comptage des étapes',
        this.acces.table('lecons').select('id_lecon', { count: 'exact', head: true }),
      ),
      this.acces.compter(
        'comptage des étapes terminées',
        this.acces
          .table('progression_lecons')
          .select('id_progression_lecon', { count: 'exact', head: true })
          .not('terminee_le', 'is', null),
      ),
    ]);
    return { terminees, total };
  }

  /** Prochaines leçons non terminées, dans l'ordre du programme. */
  async prochainesLecons(limite: number): Promise<LeconResume[]> {
    const [structure, progression] = await Promise.all([
      this.chargerStructure(),
      this.acces.lire<{ id_lecon: string }[]>(
        'lecture de la progression',
        this.acces.table('progression_lecons').select('id_lecon').not('terminee_le', 'is', null),
        [],
      ),
    ]);
    const faites = new Set(progression.map((p) => p.id_lecon));
    return structure
      .flatMap((section) => section.lecons)
      .filter((lecon) => !faites.has(lecon.id_lecon))
      .slice(0, limite);
  }
}
