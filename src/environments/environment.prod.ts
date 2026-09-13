export const environment = {
  production: true,
  // Production : le ticker passe par l'Edge Function cmc-proxy (la clé CMC reste
  // côté serveur). En dev, environment.ts utilise /api/cmc via proxy.conf.js.
  cmcApiBaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co/functions/v1/cmc-proxy',
  supabaseUrl: 'https://swzjzwymzjhdatcobibs.supabase.co',
  supabaseKey: 'sb_publishable_bspPMBm3rYTXcEEsNR1tDQ_dAWwr9gm',
  // Cloudinary — Cloud Name public uniquement (cf. environment.ts).
  cloudinaryCloudName: 'xzqyu82g',
  // Vidéo de présentation sur Bunny Stream — bibliothèque 752291, la publique,
  // distincte de 708929 où le token CDN ferme les chapitres (cf. environment.ts).
  bunnyPresentationVideoUrl:
    'https://iframe.mediadelivery.net/embed/752291/234442b8-b1d8-401f-9e5d-2a9e583d6aa0',
  // Collecteur d'erreurs (P-14). Les incidents du NAVIGATEUR partent vers
  // l'Edge Function `incident`, qui les range dans la table du même nom : ni
  // sous-traitant supplémentaire à déclarer au registre, ni transfert hors UE.
  // Les erreurs serveur, elles, sont déjà dans les logs Supabase.
  supervisionUrl: 'https://swzjzwymzjhdatcobibs.supabase.co/functions/v1/incident',
};
