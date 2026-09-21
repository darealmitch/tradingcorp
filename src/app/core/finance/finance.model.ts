import { Facture } from '../commerce/facture.model';
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
 * Une facture vue depuis la comptabilité, et non depuis le compte de l'acheteur.
 *
 * Même ligne en base que `Facture` (core/commerce), trois champs de plus : ceux
 * qui n'ont de sens que lorsqu'on regarde l'ensemble des ventes plutôt que les
 * siennes. L'identité est celle FIGÉE au jour de la vente — elle ne suit pas les
 * corrections de profil, et survit à la suppression du compte, l'obligation de
 * conservation comptable primant le droit à l'effacement (RGPD art. 17.3.b).
 */
export interface FactureEmise extends Facture {
  /** Null si le compte a été supprimé : la pièce comptable, elle, demeure. */
  id_profil: string | null;
  client_nom: string | null;
  client_email: string | null;
  /** Vente réalisée avec les clés de test Stripe — hors comptabilité réelle. */
  mode_test: boolean;
}

/**
 * Une facture entre dans les totaux si elle constate une vente réelle.
 *
 * Le critère est plus étroit que pour les paiements : là où `compteDansCa`
 * écarte aussi les comptes de démonstration, une facture ne porte pas le rôle
 * de son acheteur — elle porte une identité figée. Le seul discriminant fiable
 * qu'elle contienne est le mode Stripe.
 *
 * Règle de domaine, volontairement hors du service : elle se teste sans base.
 */
export function compteEnFacturation(facture: FactureEmise): boolean {
  return !facture.mode_test;
}

/**
 * Montant facturé sur une année civile, en centimes.
 *
 * L'année civile et non les douze derniers mois : c'est celle sur laquelle se
 * juge le chiffre d'affaires d'une entreprise individuelle.
 *
 * Ne filtre PAS les ventes de test : c'est à l'appelant de composer avec
 * `compteEnFacturation`, pour que « quelles factures » et « quel exercice »
 * restent deux questions distinctes.
 */
export function cumulAnnee(factures: FactureEmise[], annee: number): number {
  return factures
    .filter((facture) => exerciceDe(facture) === annee)
    .reduce((somme, facture) => somme + facture.montant_centimes, 0);
}

const ANNEE_A_PARIS = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
});

/**
 * L'exercice auquel une facture se rattache : l'année civile de sa date
 * d'émission, LUE À L'HEURE DE PARIS.
 *
 * La date est la seule source : la numérotation de Stripe ne porte pas l'année
 * et ne repart pas à zéro au 1er janvier. Et l'heure de Paris — ni celle du
 * navigateur, ni UTC. Une vente conclue le 1er janvier à 0 h 30 à Paris est
 * datée du 31 décembre en UTC ; elle appartient pourtant à l'exercice qui
 * commence, celui où l'entreprise l'a réalisée. Le total d'un administrateur
 * ne dépend ainsi ni de l'endroit d'où il se connecte, ni du fuseau des
 * serveurs.
 */
function exerciceDe(facture: FactureEmise): number {
  return Number(ANNEE_A_PARIS.format(new Date(facture.date_emission)));
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
