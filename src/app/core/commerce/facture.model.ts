/**
 * Facture émise après un paiement.
 *
 * Le modèle ne porte QUE les six colonnes que la base laisse lire au client
 * (20260913140000). Trois autres existent en table et n'apparaissent pas ici,
 * à dessein : `chemin_storage` — le fichier s'obtient par URL signée, jamais en
 * devinant un chemin — ainsi que `client_nom` et `client_email`, figés à
 * l'émission et sans usage côté écran.
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
