export const environment = {
  production: true,
  // Production : le ticker passe par l'Edge Function cmc-proxy (la clé CMC reste
  // côté serveur). En dev, environment.ts utilise /api/cmc via proxy.conf.js.
  cmcApiBaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co/functions/v1/cmc-proxy',
  supabaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co',
  supabaseKey: 'sb_publishable_bspPMBm3rYTXcEEsNR1tDQ_dAWwr9gm',
  // Cloudinary — Cloud Name public uniquement (cf. environment.ts).
  cloudinaryCloudName: 'xzqyu82g',
  // Vidéo de présentation hébergée sur Bunny Stream (bibliothèque 708929),
  // en URL d'EMBED pour le lecteur iframe (cf. environment.ts).
  bunnyPresentationVideoUrl:
    'https://iframe.mediadelivery.net/embed/708929/ac46adc6-1c4c-4e1e-9681-1808d07461fd',
};
