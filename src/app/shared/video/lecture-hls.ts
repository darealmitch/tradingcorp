/**
 * Attachement d'un flux HLS à une balise <video>, partagé par les deux endroits
 * du parcours qui lisent une vidéo : le chapitre et la ressource
 * complémentaire.
 *
 * Extrait de `LeconPlayer` le jour où une ressource a dû être lue dans la page
 * elle aussi. Deux implémentations auraient divergé sur les détails qui
 * comptent — la destruction de l'instance précédente, le repli natif de Safari,
 * l'import dynamique — et c'est précisément là que se logent les fuites de
 * mémoire et les écrans noirs.
 */

/** Ce qu'on garde d'une instance `hls.js` : de quoi la défaire. */
export interface AttachementHls {
  destroy(): void;
}

/**
 * Faut-il passer par `hls.js` pour cette source ?
 *
 * Null quand la lecture native suffit : Safari lit le HLS seul, et un MP4 se
 * pose directement sur la balise. Inutile d'y charger la bibliothèque.
 */
export function fluxHls(url: string | null): string | null {
  if (!url?.includes('.m3u8')) {
    return null;
  }
  const natif = document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
  return natif ? null : url;
}

/**
 * Source à poser directement sur l'attribut `src` : MP4, ou HLS là où le
 * navigateur le lit seul. Null quand `hls.js` prend la main — un `src`
 * concurrent ferait alors échouer la lecture par MediaSource.
 */
export function srcDirect(url: string | null): string | null {
  return fluxHls(url) ? null : url;
}

/**
 * Charge `hls.js` à la demande et alimente l'élément.
 *
 * L'import est dynamique pour que la bibliothèque (~40 Ko) reste hors du
 * bundle des pages qui ne lisent pas de HLS. Rend null si rien n'a été
 * attaché — source absente, élément absent, ou navigateur sans MediaSource.
 */
export async function attacherHls(
  source: string | null,
  el: HTMLVideoElement | undefined,
  estObsolete: () => boolean = () => false,
): Promise<AttachementHls | null> {
  if (!source || !el) {
    return null;
  }
  const { default: Hls } = await import('hls.js');
  // La cible a pu changer pendant le chargement du module.
  if (estObsolete() || !Hls.isSupported()) {
    return null;
  }
  const hls = new Hls({ enableWorker: true });
  hls.loadSource(source);
  hls.attachMedia(el);
  return hls;
}
