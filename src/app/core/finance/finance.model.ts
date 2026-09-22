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

/**
 * Résultat d'un essai de confirmation de commande — ce que la chaîne d'envoi
 * répond quand on la sollicite à vide, sans vente.
 *
 * Deux drapeaux plutôt qu'un booléen : « ça n'a pas marché » n'aide personne,
 * alors que « la clé Brevo manque » et « Brevo a refusé » appellent des gestes
 * différents.
 */
export interface EssaiFacturation {
  destinataire: string;
  /** « ESSAI-2026-09-21 » — une référence qu'aucune vente ne peut porter. */
  numero: string;
  brevo_configure: boolean;
  envoye: boolean;
}

/** Un enregistrement DNS attendu par Brevo pour authentifier le domaine. */
export interface EnregistrementDns {
  /** Nom d'hôte à créer, tel que Brevo l'écrit (« brevo._domainkey »). */
  nom: string;
  type: string;
  valeur: string;
  /** Vrai si Brevo constate qu'il est déjà en place. */
  pose: boolean;
}

export interface DomaineExpediteur {
  domaine: string;
  authentifie: boolean;
  /**
   * Fournisseur DNS détecté par Brevo (« Cloudflare »).
   *
   * Affiché parce que c'est l'information qui dit où aller poser un
   * enregistrement : le bureau d'enregistrement d'un domaine n'est pas
   * forcément celui qui sert sa zone, et les deux interfaces se ressemblent
   * assez pour qu'on modifie la mauvaise sans s'en apercevoir.
   */
  fournisseur: string | null;
  /** ISO — date à laquelle le domaine a été authentifié. */
  authentifieLe: string | null;
  /** Vide sur un domaine authentifié : Brevo n'a plus rien à demander. */
  enregistrements: EnregistrementDns[];
}
