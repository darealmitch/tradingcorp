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
  cloudinaryCloudName: 'tradingcorp',
  cloudinaryKey: '286468734477574',
};
