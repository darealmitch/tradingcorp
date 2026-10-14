/**
 * Chemin de retour après connexion ou inscription, s'il est sûr.
 *
 * Seul un chemin INTERNE est accepté : « /espace/formations » oui ;
 * « //exemple.com », « /\exemple.com » ou « https://… » non — un lien forgé
 * ne doit pas pouvoir emmener un visiteur qui vient de s'identifier vers un
 * autre site, au moment précis où il fait confiance à la page.
 */
export function retourSur(valeur: string | null | undefined): string | null {
  if (!valeur || !valeur.startsWith('/') || valeur.startsWith('//') || valeur.startsWith('/\\')) {
    return null;
  }
  return valeur;
}

/** L'écran d'achat : la destination des boutons « Acheter » des pages de vente. */
export const RETOUR_ACHAT = '/espace/formations';
