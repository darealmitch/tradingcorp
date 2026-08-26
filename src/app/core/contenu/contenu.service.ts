import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import {
  Certificat,
  CertificatVerifie,
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
    // Le total NE PEUT PAS se compter d'ici. `lecons_select_gated` ne montre à
    // un apprenant que ses leçons DÉBLOQUÉES : un `count(*)` sur la table rend
    // le nombre d'étapes ouvertes, pas la longueur du programme. Le
    // dénominateur suivait donc la progression — 3 étapes terminées sur 4
    // visibles affichaient 75 % là où le programme en compte 103, soit 3 %
    // (audit P-24). `ma_progression()` compte côté serveur, sur les leçons
    // publiées de la formation, et rend un total qui ne bouge pas.
    const lignes = await this.acces.lire<ProgressionResume[]>(
      'lecture de la progression',
      this.acces.appel('ma_progression'),
      [],
    );
    return lignes[0] ?? { terminees: 0, total: 0 };
  }

  /**
   * Certificats obtenus par l'apprenant connecté (RLS : les siens seulement).
   *
   * Délivrés côté serveur à l'achèvement d'une formation. Les lire ici est la
   * seule façon pour l'apprenant d'apprendre qu'il en a un : sans cet appel,
   * le certificat existerait sans que son titulaire le sache.
   */
  async mesCertificats(): Promise<Certificat[]> {
    return this.acces.lire<Certificat[]>(
      'lecture des certificats',
      this.acces
        .table('certificats')
        .select('id_certificat, id_formation, numero, date_obtention, formations(titre)')
        .order('date_obtention', { ascending: false }),
      [],
    );
  }

  /**
   * Produit (au premier appel) puis ouvre le diplôme PDF du titulaire.
   *
   * Tout se décide côté serveur : l'Edge Function appelle delivrer_certificat,
   * qui vérifie que le parcours est réellement achevé. Le front ne fait
   * qu'afficher un bouton — cliquer sans y avoir droit ne produit qu'un refus.
   *
   * Le lien rendu est une URL SIGNÉE de courte durée : le fichier n'est pas
   * public, et l'adresse ne se partage pas durablement.
   */
  async lienCertificat(idFormation: string): Promise<{ url?: string; erreur?: string }> {
    const { donnees, erreur } = await this.acces.invoquer<{ url: string }>(
      'génération du certificat',
      'generer-certificat',
      { id_formation: idFormation },
      'Le certificat n’a pas pu être préparé. Réessaie.',
    );
    return { url: donnees?.url, erreur };
  }

  /**
   * Vérifie un certificat par son numéro — SANS session.
   *
   * Seule méthode publique de ce service : un employeur qui contrôle une
   * attestation n'a pas de compte, et n'a pas à en créer un.
   *
   * La recherche se fait par NUMÉRO, jamais par liste. Une vue publique
   * `certificats_verification` avait existé : elle laissait énumérer tous les
   * diplômés, noms et formations compris (retirée par 20260711120000). Le
   * numéro est long et tiré au hasard : on ne le devine pas, on le détient.
   */
  async verifierCertificat(numero: string): Promise<CertificatVerifie | null> {
    // L'appel passe par une Edge Function, et non plus par la RPC en direct :
    // celle-ci était ouverte à `anon` sans rien qui limite le nombre d'essais,
    // et la base ne peut pas compter un débit — PostgREST ne lui transmet pas
    // l'adresse de l'appelant (audit P-18). La fonction limite par IP, puis
    // interroge la base en rôle de service.
    const { donnees } = await this.acces.invoquer<{ certificat: CertificatVerifie | null }>(
      'vérification d’un certificat',
      'verifier-certificat',
      { numero: numero.trim().toUpperCase() },
    );
    return donnees?.certificat ?? null;
  }

  /** Prochaines leçons non terminées, dans l'ordre du programme. */
  async prochainesLecons(limite: number): Promise<LeconResume[]> {
    // Le tri et le filtrage se font en base. Cette méthode chargeait le
    // programme ENTIER — sections, leçons et ressources jointes — pour n'en
    // garder que les premières lignes non terminées : une centaine de leçons
    // transportées pour en afficher une (audit P-10).
    return this.acces.lire<LeconResume[]>(
      'lecture des prochaines étapes',
      this.acces.appel('prochaines_lecons', { p_limite: limite }),
      [],
    );
  }
}
