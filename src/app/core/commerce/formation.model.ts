/** Formation publiée du catalogue (colonnes de `formations` exposées au client). */
export interface Formation {
  id_formation: string;
  titre: string;
  slug: string;
  description: string | null;
  prix_centimes: number;
  devise: string;
}

/** Inscription du profil connecté (RLS : il ne voit que les siennes). */
export interface Inscription {
  id_inscription: string;
  id_formation: string;
  statut: 'active' | 'revoquee';
}
