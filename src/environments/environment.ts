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
  // Vidéo de présentation hébergée sur Bunny Stream (bibliothèque 708929).
  // URL d'EMBED (iframe) : la variante /play/ est une page de partage, elle ne
  // peut pas alimenter une balise <video>. Le lecteur Bunny sert du HLS.
  bunnyPresentationVideoUrl:
    'https://iframe.mediadelivery.net/embed/708929/ac46adc6-1c4c-4e1e-9681-1808d07461fd',
};
