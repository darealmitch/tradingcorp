// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Relais CoinMarketCap pour le ticker de la landing (équivalent production de
// proxy.conf.js, qui n'existe qu'en dev). La clé CMC vit côté serveur (secret
// d'Edge Function) et ne transite jamais par le navigateur.
//
// Fonction PUBLIQUE (ticker affiché aux visiteurs anonymes) : déployer avec
// --no-verify-jwt. La liste blanche d'endpoints limite tout détournement de
// quota à la lecture de cours — aucune écriture, aucun autre endpoint CMC.

const CMC_BASE = 'https://pro-api.coinmarketcap.com';

const ENDPOINTS_AUTORISES = ['/v3/cryptocurrency/quotes/latest', '/v1/cryptocurrency/map'];

// Le quota CoinMarketCap est la ressource à protéger : la fonction est publique
// (le ticker s'affiche aux visiteurs anonymes), donc n'importe qui pouvait la
// faire tourner en boucle et épuiser le crédit mensuel — après quoi le ticker
// s'éteint pour tout le monde (P-16). Deux garde-fous, dans cet ordre :
//
//   1. UN CACHE, qui est la vraie réponse au problème. Des cours de crypto
//      rafraîchis toutes les 60 s suffisent largement à un bandeau d'accueil.
//      Cent visiteurs simultanés ne coûtent plus qu'un appel par minute au lieu
//      de cent. Le cache vit dans l'isolat : Supabase en démarre plusieurs et
//      les recycle, donc il n'est pas partagé ni garanti — c'est un
//      amortisseur, pas une promesse. Le `Cache-Control` renvoyé au client
//      complète la protection en amont, côté navigateur et CDN.
//
//   2. UNE LIMITATION PAR IP, filet de sécurité pour le cas que le cache ne
//      couvre pas : un appelant qui ferait varier la chaîne de paramètres pour
//      forcer un appel réseau à chaque requête.
const TTL_CACHE_MS = 60_000;
const FENETRE_MS = 60_000;
const MAX_APPELS_PAR_FENETRE = 60;

const cache = new Map<string, { expire: number; corps: string; statut: number }>();
const compteurs = new Map<string, { debut: number; appels: number }>();

/** Vrai si l'appelant a dépassé son quota sur la fenêtre courante. */
function debitDepasse(req: Request): boolean {
  // `x-forwarded-for` peut lister plusieurs adresses : la première est le
  // client d'origine. En dernier recours on regroupe tout le trafic anonyme
  // sous une même clé, ce qui reste préférable à ne rien compter.
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';
  const maintenant = Date.now();
  const compteur = compteurs.get(ip);

  if (!compteur || maintenant - compteur.debut > FENETRE_MS) {
    compteurs.set(ip, { debut: maintenant, appels: 1 });
    // Purge opportuniste : sans elle, la table des compteurs grandirait aussi
    // longtemps que vit l'isolat.
    if (compteurs.size > 5_000) {
      for (const [cle, valeur] of compteurs) {
        if (maintenant - valeur.debut > FENETRE_MS) compteurs.delete(cle);
      }
    }
    return false;
  }

  compteur.appels += 1;
  return compteur.appels > MAX_APPELS_PAR_FENETRE;
}

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return reponsePreflight(req, 'GET, OPTIONS');
  }

  const url = new URL(req.url);
  // Chemin demandé, débarrassé du préfixe de la fonction (selon le routage).
  const chemin = url.pathname
    .replace(/^\/functions\/v1\/cmc-proxy/, '')
    .replace(/^\/cmc-proxy/, '');

  if (!ENDPOINTS_AUTORISES.includes(chemin)) {
    return json(req, { erreur: 'Endpoint non autorisé.' }, 403);
  }

  if (debitDepasse(req)) {
    return json(req, { erreur: 'Trop de requêtes — réessaie dans une minute.' }, 429);
  }

  const cleCache = `${chemin}${url.search}`;
  const enCache = cache.get(cleCache);
  if (enCache && enCache.expire > Date.now()) {
    return new Response(enCache.corps, {
      status: enCache.statut,
      headers: {
        ...enTetesCors(req),
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${TTL_CACHE_MS / 1000}`,
        'X-Cache': 'HIT',
      },
    });
  }

  const cle = Deno.env.get('CMC_API_KEY');
  if (!cle) {
    return json(req, { erreur: 'Clé CoinMarketCap non configurée (secret manquant).' }, 500);
  }

  try {
    const reponse = await fetch(`${CMC_BASE}${chemin}${url.search}`, {
      headers: { 'X-CMC_PRO_API_KEY': cle, Accept: 'application/json' },
    });
    const corps = await reponse.text();

    // Seules les réponses utiles sont mises en cache : garder une erreur
    // pendant une minute la ferait servir à tous les visiteurs suivants.
    if (reponse.ok) {
      cache.set(cleCache, { expire: Date.now() + TTL_CACHE_MS, corps, statut: reponse.status });
      if (cache.size > 100) {
        for (const [k, v] of cache) {
          if (v.expire <= Date.now()) cache.delete(k);
        }
      }
    }

    return new Response(corps, {
      status: reponse.status,
      headers: {
        ...enTetesCors(req),
        'Content-Type': 'application/json',
        'Cache-Control': reponse.ok ? `public, max-age=${TTL_CACHE_MS / 1000}` : 'no-store',
        'X-Cache': 'MISS',
      },
    });
  } catch (erreur) {
    console.error('[cmc-proxy]', erreur);
    return json(req, { erreur: 'CoinMarketCap injoignable.' }, 502);
  }
});
