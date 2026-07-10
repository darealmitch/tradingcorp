import { Role } from '../auth/profil.model';

/** Ligne renvoyée par la RPC lister_profils_admin (profil + e-mail auth). */
export interface ProfilAdmin {
  id_profil: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  date_creation: string;
}
