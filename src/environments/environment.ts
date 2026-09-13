/**
 * Base d'appel de l'API CoinMarketCap.
 *
 * ⚠️ La clé CoinMarketCap ne doit JAMAIS vivre côté navigateur (exposée +
 * l'API CMC ne renvoie pas d'en-têtes CORS). On appelle donc un chemin de
 * même origine (`/api/cmc`) relayé vers CMC par un proxy qui, lui, porte la
 * clé côté serveur :
 *   - en développement : `proxy.conf.js` (clé lue depuis la variable
 *     d'environnement CMC_API_KEY) ;
 *   - en production : un reverse-proxy / backend équivalent.
 */
export const environment = {
  cmcApiBaseUrl: '/api/cmc',
  production: false,
  supabaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co',
  supabaseKey: 'sb_publishable_bspPMBm3rYTXcEEsNR1tDQ_dAWwr9gm',
  // Cloudinary — médias du projet. SEUL le Cloud Name (public) vit ici : il
  // sert à construire les URLs de livraison. L'API Key et l'API Secret sont des
  // secrets d'Edge Function (voir supabase/functions/.env.example) et ne
  // doivent JAMAIS être embarqués dans le build Angular.
  cloudinaryCloudName: 'xzqyu82g',
  // Vidéo de présentation, sur Bunny Stream — bibliothèque 752291, et NON 708929
  // où vivent les chapitres. Deux bibliothèques parce que deux régimes :
  //
  //   • 708929 (formation) : « CDN token authentication » activé. Toute requête
  //     sans jeton est rejetée, y compris celles du lecteur d'embed — vérifié,
  //     un embed de chapitre affiche 403 dans le navigateur. C'est ce qui rend
  //     les cours impartageables ;
  //   • 752291 (public) : sans token, puisque cette vidéo-ci a vocation à être
  //     vue par des visiteurs anonymes.
  //
  // Laisser la présentation dans 708929 l'avait cassée : la page d'accueil
  // affichait un 403 à la place du formateur.
  //
  // URL d'EMBED (iframe) : la variante /play/ est une page de partage, elle ne
  // peut pas alimenter une balise <video>. Le lecteur Bunny sert du HLS.
  bunnyPresentationVideoUrl:
    'https://iframe.mediadelivery.net/embed/752291/234442b8-b1d8-401f-9e5d-2a9e583d6aa0',
  // Collecteur d'erreurs distant (P-14). Vide = rien n'est transmis, et
  // l'application se comporte exactement comme avant. Renseigner l'URL d'un
  // collecteur acceptant du JSON en POST suffit à ouvrir la supervision.
  supervisionUrl: '',
};
