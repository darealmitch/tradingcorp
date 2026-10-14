/**
 * Ce que la mesure d'audience a le droit de compter.
 *
 * Ces listes sont la copie exacte de celles de `compter_evenement`
 * (migration `mesure_d_audience`) : la base ignore toute paire qu'elle ne
 * connaît pas. Ajouter un bouton mesuré, c'est donc l'ajouter ICI ET dans la
 * fonction SQL — un test vérifie que chaque `appMesureClic` du site figure
 * dans la liste ci-dessous.
 */

/** Pages de vente dont on compte les vues. */
export const PAGES_MESUREES = ['/', '/programme', '/inscription', '/espace/formations'] as const;

/** Boutons d'appel à l'action dont on compte les clics. */
export const BOUTONS_MESURES = [
  'hero',
  'offre-essai',
  'offre-achat',
  'barre',
  'entete',
  'transition',
  'programme-hero',
  'programme-fin',
] as const;

export type PageMesuree = (typeof PAGES_MESUREES)[number];
export type BoutonMesure = (typeof BOUTONS_MESURES)[number];

/** Site d'où vient la mesure : la recette écrit dans la même base que la production. */
export type SiteMesure = 'prod' | 'dev';

/**
 * Clé du stockage local qui retient l'opposition d'un visiteur. Elle conserve
 * un choix exprimé, ce qui la dispense de consentement ; elle est décrite dans
 * la politique de cookies.
 */
export const CLE_OPPOSITION_MESURE = 'tradingcorp-mesure';
