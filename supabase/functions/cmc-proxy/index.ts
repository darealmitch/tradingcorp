// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

// Relais CoinMarketCap pour le ticker de la landing (équivalent production de
// proxy.conf.js, qui n'existe qu'en dev). La clé CMC vit côté serveur (secret
// d'Edge Function) et ne transite jamais par le navigateur.
//
// Fonction PUBLIQUE (ticker affiché aux visiteurs anonymes) : déployer avec
// --no-verify-jwt. La liste blanche d'endpoints limite tout détournement de
// quota à la lecture de cours — aucune écriture, aucun autre endpoint CMC.

const CMC_BASE = 'https://pro-api.coinmarketcap.com';

const ENDPOINTS_AUTORISES = ['/v3/cryptocurrency/quotes/latest', '/v1/cryptocurrency/map'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url = new URL(req.url);
  // Chemin demandé, débarrassé du préfixe de la fonction (selon le routage).
  const chemin = url.pathname
    .replace(/^\/functions\/v1\/cmc-proxy/, '')
    .replace(/^\/cmc-proxy/, '');

  if (!ENDPOINTS_AUTORISES.includes(chemin)) {
    return json({ erreur: 'Endpoint non autorisé.' }, 403);
  }

  const cle = Deno.env.get('CMC_API_KEY');
  if (!cle) {
    return json({ erreur: 'Clé CoinMarketCap non configurée (secret manquant).' }, 500);
  }

  try {
    const reponse = await fetch(`${CMC_BASE}${chemin}${url.search}`, {
      headers: { 'X-CMC_PRO_API_KEY': cle, Accept: 'application/json' },
    });
    const corps = await reponse.text();
    return new Response(corps, {
      status: reponse.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (erreur) {
    console.error('[cmc-proxy]', erreur);
    return json({ erreur: 'CoinMarketCap injoignable.' }, 502);
  }
});
