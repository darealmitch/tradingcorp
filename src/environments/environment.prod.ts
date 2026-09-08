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
  // Collecteur d'erreurs (P-14). Les incidents du NAVIGATEUR partent vers
  // l'Edge Function `incident`, qui les range dans la table du même nom : ni
  // sous-traitant supplémentaire à déclarer au registre, ni transfert hors UE.
  // Les erreurs serveur, elles, sont déjà dans les logs Supabase.
  supervisionUrl: 'https://swzjzwymzjhdatcobibs.supabase.co/functions/v1/incident',
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
