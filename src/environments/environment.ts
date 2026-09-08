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
  // Collecteur d'erreurs distant (P-14). Vide = rien n'est transmis, et
  // l'application se comporte exactement comme avant. Renseigner l'URL d'un
  // collecteur acceptant du JSON en POST suffit à ouvrir la supervision.
  supervisionUrl: '',
  // ───────────────────────────────────────────────────────────────────────
  // Didomi — la plateforme qui recueille et conserve le consentement.
  //
  // Ces trois valeurs sont PUBLIQUES par nature : elles vivent dans le code
  // servi au navigateur, comme la clé Supabase juste au-dessus. Elles se
  // créent dans la console Didomi.
  //
  // Tant qu'elles sont vides, le SDK n'est pas chargé — et TOUT contenu tiers
  // reste bloqué. C'est délibéré : sans gestionnaire de consentement, aucun
  // consentement ne peut être recueilli, donc rien ne doit être déposé. Le
  // repli sûr est le refus, jamais l'autorisation tacite.
  didomi: {
    /** Clé API publique du compte. */
    cleApi: '',
    /** Identifiant de la notice (la bannière) à afficher. */
    idNotice: '',
    /**
     * Identifiant du fournisseur déclaré pour le lecteur vidéo.
     *
     * Bunny.net ne figure pas dans la liste TCF de l'IAB : il se déclare chez
     * Didomi comme fournisseur personnalisé, et reçoit alors un identifiant de
     * la forme `c:bunnynet-XXXXXXXX`.
     */
    vendeurLecteurVideo: '',
  },
};
