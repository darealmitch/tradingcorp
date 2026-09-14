import { Facture } from '../commerce/facture.model';
import { Role } from '../auth/profil.model';

/** Une ligne de l'historique des paiements, avec le profil du payeur. */
export interface PaiementLigne {
  id_paiement: string;
  montant_centimes: number;
  devise: string;
  statut: 'en_attente' | 'reussi' | 'rembourse' | 'echoue';
  moyen_paiement: string | null;
  reference_transaction: string;
  email: string | null;
  date_paiement: string;
  /** Paiement réalisé avec les clés de test Stripe (livemode false). */
  mode_test: boolean;
  /** Null si le compte du payeur a été supprimé — la pièce comptable survit. */
  profils: { role: Role; est_test: boolean } | null;
}

/**
 * Un paiement compte dans le chiffre d'affaires s'il est réussi, hors mode
 * test Stripe, et payé par un apprenant non marqué test. Un payeur au profil
 * supprimé reste compté : c'était un client réel.
 *
 * Règle de domaine, volontairement hors du service : elle ne dépend d'aucune
 * infrastructure, se teste sans base et doit rester la seule définition du
 * chiffre d'affaires dans l'application.
 */
export function compteDansCa(paiement: PaiementLigne): boolean {
  if (paiement.statut !== 'reussi' || paiement.mode_test) {
    return false;
  }
  const profil = paiement.profils;
  return !profil || (profil.role === 'apprenant' && !profil.est_test);
}

/**
 * Une facture vue depuis la comptabilité, et non depuis le compte de l'acheteur.
 *
 * Même ligne en base que `Facture` (core/commerce), trois champs de plus : ceux
 * qui n'ont de sens que lorsqu'on regarde l'ensemble des ventes plutôt que les
 * siennes. L'identité est celle FIGÉE au jour de la vente — elle ne suit pas les
 * corrections de profil, et survit à la suppression du compte, l'obligation de
 * conservation comptable primant le droit à l'effacement (RGPD art. 17.3.b).
 */
export interface FactureEmise extends Facture {
  /** Null si le compte a été supprimé : la pièce comptable, elle, demeure. */
  id_profil: string | null;
  client_nom: string | null;
  client_email: string | null;
  /** Vente réalisée avec les clés de test Stripe — hors comptabilité réelle. */
  mode_test: boolean;
}

/**
 * Une facture entre dans les totaux si elle constate une vente réelle.
 *
 * Le critère est plus étroit que pour les paiements : là où `compteDansCa`
 * écarte aussi les comptes de démonstration, une facture ne porte pas le rôle
 * de son acheteur — elle porte une identité figée. Le seul discriminant fiable
 * qu'elle contienne est le mode Stripe.
 *
 * Règle de domaine, volontairement hors du service : elle se teste sans base.
 */
export function compteEnFacturation(facture: FactureEmise): boolean {
  return !facture.mode_test;
}

/**
 * Montant facturé sur une année civile, en centimes.
 *
 * L'année civile et non les douze derniers mois : c'est l'unité de la
 * numérotation (« F2026-0001 » repart à 1 le 1er janvier) et celle sur laquelle
 * se juge le chiffre d'affaires d'une entreprise individuelle.
 */
export function cumulAnnee(factures: FactureEmise[], annee: number): number {
  return factures
    .filter((facture) => exerciceDe(facture) === annee)
    .reduce((somme, facture) => somme + facture.montant_centimes, 0);
}

/**
 * L'exercice comptable auquel une facture se rattache.
 *
 * TODO(human) — la date d'émission est un instant UTC, le numéro porte
 * l'année du compteur : ces deux sources peuvent diverger d'une facture.
 */
function exerciceDe(facture: FactureEmise): number {
  return new Date(facture.date_emission).getFullYear();
}
