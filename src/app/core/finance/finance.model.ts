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
