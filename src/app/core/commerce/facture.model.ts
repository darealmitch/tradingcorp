/**
 * Facture émise après un paiement, telle que son TITULAIRE la voit.
 *
 * Le modèle s'en tient à ce qu'un écran d'apprenant a besoin d'afficher. Deux
 * colonnes lisibles en base n'y figurent pas — `client_nom` et `client_email`,
 * figés à l'émission : l'acheteur connaît sa propre identité, la lui réafficher
 * n'apprend rien. Elles servent à la comptabilité, qui a son modèle à elle
 * (`FactureEmise`, core/finance).
 *
 * `chemin_storage`, lui, n'est lisible par personne côté client : le fichier
 * s'obtient par URL signée, jamais en devinant un chemin (20260913140000).
 */
export interface Facture {
  id_facture: string;
  /** Numéro continu, de la forme « F2026-0001 ». */
  numero: string;
  designation: string;
  montant_centimes: number;
  devise: string;
  date_emission: string;
}
