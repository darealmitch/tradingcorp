/** Rôles applicatifs — alignés sur le CHECK de la table `profils`. */
export type Role = 'apprenant' | 'formateur' | 'admin';

/** Ligne de la table `profils` (créée par trigger à l'inscription). */
export interface Profil {
  id_profil: string;
  prenom: string;
  nom: string;
  avatar_url: string | null;
  role: Role;
  date_creation: string;
}
