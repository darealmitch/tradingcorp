/**
 * Délai d'attente entre deux tentatives de quiz.
 *
 * Sans lui, un apprenant peut soumettre n'importe quoi, lire la correction et
 * resoumettre aussitôt : le quiz ne mesure alors plus rien. Le délai ne bloque
 * personne définitivement — chacun finit par réussir — mais il rend le rejeu à
 * l'aveugle plus coûteux que la révision, ce qui est exactement le but.
 *
 * Ce fichier est volontairement sans dépendance : il ne connaît ni Deno, ni
 * Supabase, ni le réseau. C'est ce qui permet de le tester depuis la suite
 * Angular, alors que le reste de l'Edge Function ne l'est pas.
 */

/**
 * Attente en secondes selon le nombre d'échecs consécutifs déjà encaissés :
 * la première tentative est immédiate, la deuxième attend 30 s, puis 2, 5 et
 * 10 minutes. Le dernier palier vaut pour tous les suivants.
 */
export const PALIERS_ATTENTE_S = [0, 30, 120, 300, 600] as const;

export function delaiRequisS(echecsConsecutifs: number): number {
  const rang = Math.min(Math.max(echecsConsecutifs, 0), PALIERS_ATTENTE_S.length - 1);
  return PALIERS_ATTENTE_S[rang];
}

/**
 * Secondes restant à patienter, 0 si la tentative peut partir tout de suite.
 *
 * `maintenant` est passé en paramètre plutôt que lu de l'horloge : c'est ce
 * qui rend la fonction vérifiable sans attendre réellement dix minutes.
 */
export function secondesAAttendre(
  echecsConsecutifs: number,
  derniereTentativeIso: string | null,
  maintenant: number,
): number {
  const requis = delaiRequisS(echecsConsecutifs);
  if (requis === 0 || !derniereTentativeIso) {
    return 0;
  }
  const depuis = Date.parse(derniereTentativeIso);
  if (Number.isNaN(depuis)) {
    // Date illisible : on laisse passer plutôt que de bloquer sur une donnée
    // qu'on ne sait pas interpréter.
    return 0;
  }
  const ecouleS = (maintenant - depuis) / 1000;
  return Math.max(0, Math.ceil(requis - ecouleS));
}

/**
 * Nombre d'échecs enchaînés depuis la dernière réussite. Une réussite remet le
 * compteur à zéro : refaire un quiz déjà validé pour réviser ne doit pas
 * hériter des pénalités d'un échec passé.
 *
 * @param tentatives tentatives de l'apprenant sur ce quiz, de la plus récente
 *                   à la plus ancienne.
 */
export function echecsConsecutifs(tentatives: { reussi: boolean }[]): number {
  const premiereReussite = tentatives.findIndex((t) => t.reussi);
  return premiereReussite === -1 ? tentatives.length : premiereReussite;
}

/** Message d'attente, en français et à la bonne unité. */
export function messageAttente(secondes: number): string {
  if (secondes < 60) {
    return `Attends encore ${secondes} seconde${secondes > 1 ? 's' : ''} avant de retenter ce quiz.`;
  }
  const minutes = Math.ceil(secondes / 60);
  return `Attends encore ${minutes} minute${minutes > 1 ? 's' : ''} avant de retenter ce quiz.`;
}
