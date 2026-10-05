import { Injectable, computed, inject, signal } from '@angular/core';
import { Role } from '../auth/profil.model';
import { StatutModeration } from '../communaute/communaute.model';
import { AccesDonnees } from '../supabase/acces-donnees';
import { EchangePrive, MessageDeFil, compterARepondre, regrouperEchanges } from './echanges';

/** Un commentaire tel que l'équipe le gère : son état, son auteur, sa leçon. */
export interface CommentaireModere {
  id_commentaire: string;
  id_parent: string | null;
  id_lecon: string;
  id_profil: string;
  contenu: string;
  statut: StatutModeration;
  est_prive: boolean;
  par_equipe: boolean;
  date_creation: string;
  profils: { prenom: string; nom: string; role: Role } | null;
  /** `id_section` sert au lien vers le fil, dans la leçon. */
  lecons: { titre: string; id_section: string } | null;
  /** Pour une réponse : le message auquel elle répond. */
  parent?: CommentaireModere | null;
}

/** Ce que l'écran de modération range dans ses onglets, hors échanges privés. */
export type EtatModeration = 'attente' | 'publies' | 'rejetes';

/** Les décisions de `moderer_commentaire`, mot pour mot. */
export type DecisionModeration = 'approuver' | 'rejeter' | 'rendre_prive' | 'rendre_public';

/** Ce qui attend l'équipe : la pastille de la navigation et les onglets. */
export interface CompteursModeration {
  enAttente: number;
  aRepondre: number;
  avisEnAttente: number;
}

const COLONNES_MODERATION =
  'id_commentaire, id_parent, id_lecon, id_profil, contenu, statut, est_prive, par_equipe, ' +
  'date_creation, profils(prenom, nom, role), lecons(titre, id_section)';

/** Les plus récents d'abord : au-delà, c'est de l'historique que personne ne déroule. */
const MAX_PAR_ONGLET = 100;

export interface CommentaireEnAttente {
  id_commentaire: string;
  id_lecon: string;
  contenu: string;
  date_creation: string;
  profils: { prenom: string; nom: string } | null;
  /** `id_section` sert au lien vers le fil, dans la leçon. */
  lecons: { titre: string; id_section: string } | null;
}

export interface AvisEnAttente {
  id_avis: string;
  note: number;
  contenu: string | null;
  date_creation: string;
  profils: { prenom: string; nom: string } | null;
}

/**
 * Modération des commentaires et des avis, réservée à l'équipe.
 *
 * La lecture passe par la table — la RLS ouvre tout à l'équipe. Les décisions
 * sur les commentaires passent par `moderer_commentaire` : c'est elle qui sait
 * ce qu'une décision a de sensé, et qui fait suivre tout le fil quand un
 * message devient privé.
 */
@Injectable({ providedIn: 'root' })
export class ModerationService {
  private readonly acces = inject(AccesDonnees);

  private readonly compteursSig = signal<CompteursModeration>({
    enAttente: 0,
    aRepondre: 0,
    avisEnAttente: 0,
  });

  /** Partagés entre la navigation (pastille) et l'écran de modération (onglets). */
  readonly compteurs = this.compteursSig.asReadonly();
  readonly aTraiter = computed(() => {
    const c = this.compteursSig();
    return c.enAttente + c.aRepondre + c.avisEnAttente;
  });

  /**
   * Les commentaires d'un onglet, chacun avec le message auquel il répond :
   * sans lui, une réponse se lit comme un propos sans contexte.
   */
  async commentairesParEtat(etat: EtatModeration): Promise<CommentaireModere[]> {
    const base = this.acces.table('commentaires').select(COLONNES_MODERATION);
    const filtree =
      etat === 'attente'
        ? base.eq('statut', 'en_attente')
        : etat === 'rejetes'
          ? base.eq('statut', 'rejete')
          : base.eq('statut', 'approuve').eq('est_prive', false);
    const lignes = await this.acces.lire<CommentaireModere[]>(
      'lecture des commentaires à gérer',
      filtree.order('date_creation', { ascending: false }).limit(MAX_PAR_ONGLET),
      [],
    );
    return this.avecParents(lignes);
  }

  /**
   * Les échanges privés : les messages privés, leur message d'origine quand il
   * est resté public, et — pour un fil devenu privé — les réponses écrites
   * avant, qui en font partie.
   */
  async echangesPrives(): Promise<EchangePrive<CommentaireModere>[]> {
    const prives = await this.acces.lire<CommentaireModere[]>(
      'lecture des échanges privés',
      this.acces
        .table('commentaires')
        .select(COLONNES_MODERATION)
        .eq('est_prive', true)
        .order('date_creation', { ascending: true }),
      [],
    );
    const filsPrives = prives.filter((c) => c.id_parent === null).map((c) => c.id_commentaire);
    const origines = [
      ...new Set(
        prives
          .map((c) => c.id_parent)
          .filter((id): id is string => id !== null && !filsPrives.includes(id)),
      ),
    ];

    const [messagesOrigine, reponsesPubliques] = await Promise.all([
      origines.length === 0
        ? Promise.resolve([])
        : this.acces.lire<CommentaireModere[]>(
            'lecture des messages d’origine',
            this.acces
              .table('commentaires')
              .select(COLONNES_MODERATION)
              .in('id_commentaire', origines),
            [],
          ),
      filsPrives.length === 0
        ? Promise.resolve([])
        : this.acces.lire<CommentaireModere[]>(
            'lecture des fils privés',
            this.acces
              .table('commentaires')
              .select(COLONNES_MODERATION)
              .in('id_parent', filsPrives)
              .eq('est_prive', false),
            [],
          ),
    ]);

    return regrouperEchanges([...prives, ...messagesOrigine, ...reponsesPubliques]);
  }

  /**
   * Une décision de l'équipe sur un commentaire. Le serveur refuse — en
   * français — ce qui n'a pas de sens : rendre public ce qu'un élève a écrit en
   * privé, rejeter une réponse de l'équipe…
   */
  async modererCommentaire(id: string, decision: DecisionModeration): Promise<string | null> {
    return this.acces.ecrire(
      'modération d’un commentaire',
      this.acces.appel('moderer_commentaire', { p_id_commentaire: id, p_decision: decision }),
      'La modération a échoué. Réessaie.',
    );
  }

  /** Suppression définitive d'un message rejeté : administrateur seulement, inscrite au journal. */
  async supprimerDefinitivement(id: string): Promise<string | null> {
    return this.acces.ecrire(
      'suppression définitive d’un commentaire',
      this.acces.appel('supprimer_commentaire', { p_id_commentaire: id }),
      'La suppression a échoué. Réessaie.',
    );
  }

  /** Recompte ce qui attend l'équipe, pour la pastille et les onglets. */
  async rafraichirCompteurs(): Promise<CompteursModeration> {
    const [enAttente, avisEnAttente, prives] = await Promise.all([
      this.compterCommentairesEnAttente(),
      this.acces.compter(
        'comptage des avis à modérer',
        this.acces
          .table('avis')
          .select('id_avis', { count: 'exact', head: true })
          .eq('statut', 'en_attente'),
      ),
      this.acces.lire<MessageDeFil[]>(
        'lecture des échanges privés',
        this.acces
          .table('commentaires')
          .select('id_commentaire, id_parent, par_equipe, est_prive, date_creation')
          .eq('est_prive', true),
        [],
      ),
    ]);
    const compteurs = { enAttente, aRepondre: compterARepondre(prives), avisEnAttente };
    this.compteursSig.set(compteurs);
    return compteurs;
  }

  /** Rattache à chaque réponse le message auquel elle répond. */
  private async avecParents(lignes: CommentaireModere[]): Promise<CommentaireModere[]> {
    const ids = [
      ...new Set(lignes.map((c) => c.id_parent).filter((id): id is string => id !== null)),
    ];
    if (ids.length === 0) {
      return lignes;
    }
    const parents = await this.acces.lire<CommentaireModere[]>(
      'lecture des messages d’origine',
      this.acces.table('commentaires').select(COLONNES_MODERATION).in('id_commentaire', ids),
      [],
    );
    const parId = new Map(parents.map((p) => [p.id_commentaire, p]));
    return lignes.map((c) => ({
      ...c,
      parent: c.id_parent ? (parId.get(c.id_parent) ?? null) : null,
    }));
  }

  async commentairesEnAttente(): Promise<CommentaireEnAttente[]> {
    return this.acces.lire<CommentaireEnAttente[]>(
      'lecture des commentaires à modérer',
      this.acces
        .table('commentaires')
        .select(
          'id_commentaire, id_lecon, contenu, date_creation, profils(prenom, nom), ' +
            'lecons(titre, id_section)',
        )
        .eq('statut', 'en_attente')
        .order('date_creation', { ascending: false }),
      [],
    );
  }

  async avisEnAttente(): Promise<AvisEnAttente[]> {
    return this.acces.lire<AvisEnAttente[]>(
      'lecture des avis à modérer',
      this.acces
        .table('avis')
        .select('id_avis, note, contenu, date_creation, profils(prenom, nom)')
        .eq('statut', 'en_attente')
        .order('date_creation', { ascending: false }),
      [],
    );
  }

  /**
   * Approuve ou rejette un avis. Retourne un message d'erreur, ou null.
   *
   * `modifier` et non `ecrire` : les policies de modération écartent les lignes
   * plutôt que de refuser l'opération. Un formateur dont le rôle vient de
   * changer, ou un avis déjà traité par quelqu'un d'autre entre-temps, ne
   * produisent AUCUNE erreur — l'écriture ne touche simplement rien. La file se
   * viderait à l'écran sans que la base bouge. C'est le `.select()` qui permet
   * de trancher : ce sont les lignes réellement modifiées qui reviennent.
   */
  async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    return this.acces.modifier(
      'modération d’un avis',
      this.acces.table('avis').update({ statut }).eq('id_avis', id).select('id_avis'),
      'La modération a échoué. Réessaie.',
    );
  }

  async compterCommentairesEnAttente(): Promise<number> {
    return this.acces.compter(
      'comptage des commentaires à modérer',
      this.acces
        .table('commentaires')
        .select('id_commentaire', { count: 'exact', head: true })
        .eq('statut', 'en_attente'),
    );
  }

  /** Note moyenne des avis approuvés, formatée — null tant qu'aucun avis. */
  async noteMoyenne(): Promise<string | null> {
    // La moyenne se calcule en base. Charger tous les avis approuvés pour les
    // additionner dans le navigateur faisait croître le transfert avec le
    // succès de la plateforme, pour produire un seul nombre (audit P-10).
    const brut = await this.acces.lire<number | string | null>(
      'lecture de la note moyenne',
      this.acces.appel('note_moyenne_avis'),
      null,
    );
    // `typeof` plutôt qu'une comparaison à `null` : `Number([])` vaut 0, si
    // bien qu'une valeur inattendue produirait une note de « 0 / 5 » — une
    // moyenne inexistante déguisée en pire note possible.
    if (typeof brut !== 'number' && typeof brut !== 'string') {
      return null;
    }
    // `numeric` peut arriver en nombre ou en chaîne selon la sérialisation :
    // sur une chaîne, `toLocaleString` existerait mais ignorerait les options
    // et rendrait la valeur brute — d'où la conversion explicite.
    const moyenne = Number(brut);
    if (Number.isNaN(moyenne)) {
      return null;
    }
    return `${moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5`;
  }
}
