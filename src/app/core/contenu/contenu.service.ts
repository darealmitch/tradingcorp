import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
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
 * La RLS reste l'autorité d'accès — ce service ne filtre rien lui-même.
 */
@Injectable({ providedIn: 'root' })
export class ContenuService {
  private readonly supabase = inject(SUPABASE);

  /**
   * Parcours de l'utilisateur : sa formation (inscription active, sinon la
   * 1re formation publiée en teaser) + les états des modules calculés côté
   * serveur (RPC etats_modules). Le front ne fait qu'afficher ces états.
   */
  async chargerParcours(): Promise<Parcours | null> {
    const { data: inscription } = await this.supabase
      .from('inscriptions')
      .select('id_formation, formations(titre)')
      .eq('statut', 'active')
      .limit(1)
      .maybeSingle();

    let idFormation = (inscription as { id_formation?: string } | null)?.id_formation ?? null;
    let titre =
      (inscription as { formations?: { titre: string } | null } | null)?.formations?.titre ?? null;
    const inscrit = idFormation !== null;

    if (!idFormation) {
      const { data: formation } = await this.supabase
        .from('formations')
        .select('id_formation, titre')
        .eq('est_publiee', true)
        .order('prix_centimes')
        .limit(1)
        .maybeSingle();
      idFormation = (formation as { id_formation?: string } | null)?.id_formation ?? null;
      titre = (formation as { titre?: string } | null)?.titre ?? null;
    }
    if (!idFormation) {
      return null;
    }

    const { data } = await this.supabase.rpc('etats_modules', { p_id_formation: idFormation });
    return {
      id_formation: idFormation,
      titre: titre ?? 'Formation',
      inscrit,
      modules: (data as ModuleParcours[] | null) ?? [],
    };
  }

  /**
   * Modules (sections) et leurs étapes, dans l'ordre du programme.
   * Les ressources complémentaires sont jointes pour que le back-office
   * affiche l'inventaire média complet d'une étape — y compris les ressources
   * désactivées, que la RLS laisse passer pour le staff.
   */
  async chargerStructure(): Promise<Module[]> {
    const { data } = await this.supabase
      .from('sections')
      .select(
        'id_section, titre, description, position, est_publiee, ' +
          'lecons(id_lecon, id_section, titre, type, position, duree_s, est_publiee, ' +
          'video_provider, video_provider_id, video_url, pdf_public_id, ' +
          'ressources(id_ressource, nom, type, est_active, cloudinary_public_id, url, contenu))',
      )
      .order('position')
      .order('position', { referencedTable: 'lecons' });
    return (data as Module[] | null) ?? [];
  }

  /** Étapes d'un module avec leur état (RPC `etats_lecons` — stepper/timeline). */
  async etatsLecons(idSection: string): Promise<LeconEtape[]> {
    const { data } = await this.supabase.rpc('etats_lecons', { p_id_section: idSection });
    return (data as LeconEtape[] | null) ?? [];
  }

  /**
   * Contenu jouable d'une étape (RPC `lecon_contenu`) : seule voie de lecture.
   * Aucune ligne si l'étape n'est pas déverrouillée ; PDF/quiz redigés tant
   * que la vidéo n'est pas terminée. Les ressources complémentaires suivent
   * leur propre RLS (déjà gatée par le même déblocage séquentiel).
   */
  async chargerLeconJouable(idLecon: string): Promise<LeconJouable | null> {
    const [{ data: lecon }, { data: ressources }] = await Promise.all([
      this.supabase.rpc('lecon_contenu', { p_id_lecon: idLecon }).maybeSingle(),
      // Les ressources inactives et les leçons verrouillées sont écartées par
      // la RLS (`ressources_select_gated`) : rien à filtrer ici.
      this.supabase
        .from('ressources')
        .select(
          'id_ressource, nom, type, description, type_mime, cloudinary_public_id, ' +
            'chemin_storage, url, contenu, langage, taille, position',
        )
        .eq('id_lecon', idLecon)
        .order('position')
        .order('date_creation'),
    ]);
    if (!lecon) {
      return null;
    }
    return { ...(lecon as LeconJouable), ressources: (ressources as Ressource[] | null) ?? [] };
  }

  /**
   * Valide un chapitre vidéo ou article (pose terminee_le côté serveur, ce qui
   * déverrouille le chapitre suivant). Interdit pour un chapitre quiz : celui-ci
   * se valide uniquement via corriger-quiz. Le client ne peut pas écrire
   * terminee_le en direct — la RPC vérifie le type et le déblocage.
   */
  async terminerLecon(idLecon: string): Promise<void> {
    await this.supabase.rpc('terminer_lecon', { p_id_lecon: idLecon });
  }

  /**
   * Signale que la vidéo est terminée — déverrouille le PDF. Signal client
   * (comme la reprise vidéo), non sécuritaire.
   */
  async marquerVideoTerminee(idLecon: string): Promise<void> {
    const idProfil = await this.idProfilCourant();
    if (!idProfil) {
      return;
    }
    await this.supabase
      .from('progression_lecons')
      .upsert(
        { id_profil: idProfil, id_lecon: idLecon, video_terminee_le: new Date().toISOString() },
        { onConflict: 'id_profil,id_lecon' },
      );
  }

  /** Sauvegarde la position de lecture vidéo (reprise). */
  async enregistrerPosition(idLecon: string, secondes: number): Promise<void> {
    const idProfil = await this.idProfilCourant();
    if (!idProfil) {
      return;
    }
    await this.supabase
      .from('progression_lecons')
      .upsert(
        { id_profil: idProfil, id_lecon: idLecon, position_video_s: Math.floor(secondes) },
        { onConflict: 'id_profil,id_lecon' },
      );
  }

  private async idProfilCourant(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user?.id ?? null;
  }

  /** Progression du profil connecté : leçons terminées / leçons accessibles. */
  async maProgression(): Promise<ProgressionResume> {
    const [lecons, terminees] = await Promise.all([
      this.supabase.from('lecons').select('id_lecon', { count: 'exact', head: true }),
      this.supabase
        .from('progression_lecons')
        .select('id_progression_lecon', { count: 'exact', head: true })
        .not('terminee_le', 'is', null),
    ]);
    return { terminees: terminees.count ?? 0, total: lecons.count ?? 0 };
  }

  /** Prochaines leçons non terminées, dans l'ordre du programme. */
  async prochainesLecons(limite: number): Promise<LeconResume[]> {
    const [structure, progression] = await Promise.all([
      this.chargerStructure(),
      this.supabase.from('progression_lecons').select('id_lecon').not('terminee_le', 'is', null),
    ]);
    const faites = new Set(
      ((progression.data as { id_lecon: string }[] | null) ?? []).map((p) => p.id_lecon),
    );
    return structure
      .flatMap((section) => section.lecons)
      .filter((lecon) => !faites.has(lecon.id_lecon))
      .slice(0, limite);
  }
}
