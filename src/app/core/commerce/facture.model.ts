/**
 * Facture émise après un paiement — le socle commun, sans l'identité de
 * l'acheteur. La comptabilité l'étend avec `FactureEmise` (core/finance).
 *
 * L'acheteur n'a pas d'écran de factures : la sienne lui parvient jointe à la
 * confirmation de commande (22/09/2026).
 *
 * La facture est émise par Stripe. Son identifiant Stripe reste côté serveur :
 * le PDF s'obtient par `generer-facture`, qui établit le droit sous RLS avant
 * de demander un lien frais à Stripe (20260921100000).
 */
export interface Facture {
  id_facture: string;
  /** Numéro attribué par Stripe, continu à l'échelle du compte. */
  numero: string;
  designation: string;
  montant_centimes: number;
  devise: string;
  date_emission: string;
}
