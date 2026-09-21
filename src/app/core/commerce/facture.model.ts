/**
 * Facture émise après un paiement, telle que son TITULAIRE la voit.
 *
 * Le modèle s'en tient à ce qu'un écran d'apprenant a besoin d'afficher. Deux
 * colonnes lisibles en base n'y figurent pas — `client_nom` et `client_email`,
 * figés à l'émission : l'acheteur connaît sa propre identité, la lui réafficher
 * n'apprend rien. Elles servent à la comptabilité, qui a son modèle à elle
 * (`FactureEmise`, core/finance).
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
