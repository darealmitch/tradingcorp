/** Formation publiée du catalogue (colonnes de `formations` exposées au client). */
export interface Formation {
  id_formation: string;
  titre: string;
  slug: string;
  description: string | null;
  prix_centimes: number;
  devise: string;
}

/**
 * Formation vue par le staff : publiées et brouillons, avec les réglages que
 * l'apprenant n'a pas à connaître.
 */
export interface FormationStaff {
  id_formation: string;
  titre: string;
  slug: string;
  est_publiee: boolean;
  /** Un certificat est délivré à l'achèvement intégral de cette formation. */
  delivre_certificat: boolean;
}

/** Inscription du profil connecté (RLS : il ne voit que les siennes). */
export interface Inscription {
  id_inscription: string;
  id_formation: string;
  statut: 'active' | 'revoquee';
}
