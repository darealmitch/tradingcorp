export const environment = {
  production: true,
  // Production : le ticker passe par l'Edge Function cmc-proxy (la clé CMC reste
  // côté serveur). En dev, environment.ts utilise /api/cmc via proxy.conf.js.
  cmcApiBaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co/functions/v1/cmc-proxy',
  supabaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co',
  supabaseKey: 'sb_publishable_bspPMBm3rYTXcEEsNR1tDQ_dAWwr9gm',
  // Cloudinary — Cloud Name public uniquement (cf. environment.ts).
  cloudinaryCloudName: 'xzqyu82g',
};
