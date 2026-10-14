/**
 * Ce que les pages publiques disent de l'offre, tel que la base le rend
 * (`vitrine_formation`). Des agrégats seulement : un visiteur n'a accès à
 * aucun contenu de leçon, et la vitrine n'en transporte aucun.
 */

/** Leçon offerte aux comptes sans achat (accès découverte), nommée en vitrine. */
export interface LeconOfferteVitrine {
  titre: string;
  /** Titre du module qui la contient. */
  module: string;
  duree_s: number;
}

/** Un module publié du programme, avec ses chiffres. */
export interface ModuleVitrine {
  position: number;
  titre: string;
  accroche: string | null;
  objectifs: string[];
  lecons_video: number;
  secondes_video: number;
  quiz: number;
  lecons_offertes: number;
}

/** La formation en vitrine : prix, chiffres du programme, leçons offertes. */
export interface Vitrine {
  id_formation: string;
  titre: string;
  prix_centimes: number;
  devise: string;
  delivre_certificat: boolean;
  modules: number;
  lecons_video: number;
  secondes_video: number;
  quiz: number;
  ressources: number;
  lecons_offertes: LeconOfferteVitrine[];
  programme: ModuleVitrine[];
}

/**
 * 99 700 centimes → « 997 € ». Un prix à centimes garde ses centimes :
 * l'arrondir l'afficherait plus bas qu'il n'est.
 */
export function prixAffiche(centimes: number, devise: string): string {
  const euros = centimes / 100;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: devise.toUpperCase(),
    maximumFractionDigits: Number.isInteger(euros) ? 0 : 2,
  }).format(euros);
}
