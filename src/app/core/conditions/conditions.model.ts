/** Les documents dont une mise à jour s'annonce — mêmes clés que la fonction Edge. */
export type DocumentLegal = 'cgu' | 'confidentialite' | 'cgv';

export const DOCUMENTS_LEGAUX: readonly { id: DocumentLegal; titre: string }[] = [
  { id: 'cgu', titre: 'Conditions générales d’utilisation' },
  { id: 'confidentialite', titre: 'Politique de confidentialité' },
  { id: 'cgv', titre: 'Conditions générales de vente' },
];

export interface MiseAJourConditions {
  /** « AAAA-MM-JJ » : la date de la nouvelle version, celle qu'affiche la page. */
  date: string;
  documents: DocumentLegal[];
  /** Une ligne commençant par « - » devient une puce dans l'e-mail. */
  resume: string;
}

/**
 * « essai » : aux seuls comptes de test, avec un bandeau d'essai.
 * « envoi » : à tous les comptes.
 */
export type ModeAnnonce = 'essai' | 'envoi';

export interface ResultatAnnonce {
  mode: ModeAnnonce;
  /** Comptes notifiés à l'instant — et à eux seuls l'e-mail est parti. */
  notifies: number;
  courriels_envoyes: number;
  courriels_echoues: number;
  /** Tout le monde avait déjà été prévenu de cette version : rien n'est reparti. */
  deja_informes: boolean;
}

/**
 * La dernière mise à jour des conditions, telle qu'elle s'annonce.
 *
 * Écrite ici, à côté du code des pages légales qu'elle résume : quand une page
 * change, ce résumé change dans le même commit, et l'écran Paramètres le
 * propose pré-rempli. L'administrateur le relit, et peut le corriger, avant
 * chaque envoi.
 */
export const DERNIERE_MISE_A_JOUR: MiseAJourConditions = {
  date: '2026-10-05',
  documents: ['cgu', 'confidentialite'],
  resume: [
    '- Vos commentaires publiés apparaissent désormais aux autres élèves sous votre prénom et l’initiale de votre nom (par exemple « Léa M. »).',
    '- L’équipe peut vous répondre en privé, ou rendre privé l’un de vos commentaires : seuls vous et l’équipe voyez alors l’échange, et vous pouvez y répondre.',
    '- Vous voyez l’état de chacun de vos commentaires (en attente, publié ou non publié) et pouvez le supprimer à tout moment.',
    '- La politique de confidentialité précise qui voit vos commentaires et vos échanges privés.',
  ].join('\n'),
};

/** Même borne que la fonction Edge, qui refuse au-delà. */
export const LONGUEUR_MAX_RESUME = 2000;
