import { Role } from '../auth/profil.model';

/**
 * Modèles du domaine « comptes » : les utilisateurs vus depuis le back-office.
 *
 * Distinct de `auth/profil.model` (le profil de l'utilisateur connecté, qui ne
 * connaît que lui-même) : ici on décrit *les autres*, e-mail compris — une
 * information que seule la RPC réservée aux administrateurs expose.
 */

/** Ligne renvoyée par la RPC `lister_profils_admin` (profil + e-mail auth). */
export interface ProfilAdmin {
  id_profil: string;
  prenom: string;
  nom: string;
  email: string;
  role: Role;
  date_creation: string;
  /** Mot de passe temporaire pas encore remplacé (activation en attente). */
  doit_changer_mdp: boolean;
  /** Compte de démonstration, exclu des statistiques. */
  est_test: boolean;
  /** Compte propriétaire : seul habilité à supprimer un administrateur. */
  est_proprietaire: boolean;
}

/**
 * Accès d'un compte à une formation : une ligne d'`inscriptions`. Un accès
 * retiré reste « révoqué » plutôt que supprimé — il se rend tel qu'il était.
 */
export interface AccesFormation {
  id_profil: string;
  id_formation: string;
  statut: 'active' | 'revoquee';
}

/**
 * Essai accordé par un administrateur : une ligne d'`essais`. Il n'ouvre aucun
 * droit de plus que la découverte — les leçons offertes —, mais l'élève a reçu
 * l'e-mail qui le lui explique. `annonce_le` reste nul tant que l'annonce
 * attend la mise en production. Retiré (`retire_le`), l'essai ferme au
 * contraire les leçons offertes à ce compte.
 */
export interface EssaiAccorde {
  id_profil: string;
  accorde_le: string;
  annonce_le: string | null;
  retire_le: string | null;
}

/** Où en est l'essai d'un élève, tel que l'écran Utilisateurs le présente. */
export type EtatEssai = 'aucun' | 'en_cours' | 'programme' | 'retire';

/** Données de création d'un compte par un administrateur. */
export interface CreationCompte {
  email: string;
  prenom: string;
  nom: string;
  /** Un administrateur ne se crée pas ici : il se promeut via `changerRole`. */
  role: 'apprenant' | 'formateur';
  id_formation: string | null;
}
