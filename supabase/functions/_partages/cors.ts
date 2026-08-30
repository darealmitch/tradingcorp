// Sites autorisés à appeler les Edge Functions depuis un navigateur, partagés
// par toutes les fonctions.
//
// Elles répondaient jusqu'ici `Access-Control-Allow-Origin: *`, ce qui laissait
// n'importe quelle page du web déclencher un appel authentifié depuis le
// navigateur d'un utilisateur connecté. Le jeton n'est pas transmis
// automatiquement — il vit dans le localStorage, pas dans un cookie — donc ce
// n'était pas un CSRF exploitable ; mais `*` autorisait aussi la LECTURE de la
// réponse par un script tiers, et laissait le quota de cmc-proxy ouvert à qui
// voulait s'en servir depuis son propre site.
//
// ⚠️ DEUX NOTIONS DISTINCTES, longtemps confondues ici :
//
//   • l'ORIGINE (schéma + hôte) — ce que le navigateur envoie dans `Origin`,
//     et la seule chose que le CORS compare. Elle ne porte jamais de chemin ;
//   • la BASE DE L'APPLICATION — l'adresse à laquelle le site est réellement
//     servi, chemin compris. Sur GitHub Pages, l'application vit sous
//     `/tradingcorp/`, pas à la racine du domaine.
//
// Les confondre renvoyait l'acheteur, après son paiement, vers
// `https://darealmitch.github.io/espace?achat=succes` : la racine du domaine,
// où GitHub affiche « Site not found ». Le paiement était bien encaissé et
// l'accès bien ouvert par le webhook — mais le client voyait une page d'erreur
// au moment précis où il venait de payer. D'où cette table, qui associe à
// chaque origine autorisée la base réelle de l'application.
//
// Sur tradingcorp.fr les deux coïncident — le site est servi à la racine de son
// domaine. Pas sur GitHub Pages, où la même application est publiée en
// démonstration SOUS le chemin `/tradingcorp/` : cette entrée-là est la raison
// d'être de la table, et la démonstration serait muette sans elle (ni ticker,
// ni quiz, ni achat, faute d'autorisation CORS).
const SITES = new Map<string, string>([
  ['https://tradingcorp.fr', 'https://tradingcorp.fr'],
  // L'hébergeur redirige www vers l'apex, mais cette origine peut porter un
  // appel avant que la redirection ne s'applique.
  ['https://www.tradingcorp.fr', 'https://www.tradingcorp.fr'],
  // Version de démonstration, publiée par le job `demonstration` de la CI.
  ['https://darealmitch.github.io', 'https://darealmitch.github.io/tradingcorp'],
  // Développement, hébergé sur Vercel. Un nom à nous plutôt que l'adresse
  // *.vercel.app : les URL de prévisualisation changent à chaque branche, et
  // autoriser le suffixe entier reviendrait à ouvrir ces fonctions à tout site
  // publié sur Vercel, y compris ceux d'inconnus.
  ['https://dev.tradingcorp.fr', 'https://dev.tradingcorp.fr'],
  // Le développement sert l'application à la racine : origine et base y sont
  // confondues, et n'ont de valeur que sur la machine du développeur.
  ['http://localhost:4200', 'http://localhost:4200'],
  ['http://127.0.0.1:4200', 'http://127.0.0.1:4200'],
]);

// SITE_URL ajoute un site sans redéployer (préproduction, nom de domaine
// définitif) et peut porter un chemin : son origine entre dans la liste
// blanche, sa valeur complète devient la base de retour. Une valeur mal formée
// est ignorée plutôt que de faire échouer toutes les fonctions au démarrage.
const SITE_CONFIGURE = (Deno.env.get('SITE_URL') ?? '').replace(/\/+$/, '');
if (SITE_CONFIGURE) {
  try {
    SITES.set(new URL(SITE_CONFIGURE).origin, SITE_CONFIGURE);
  } catch {
    console.error('SITE_URL ignorée : ce n’est pas une URL absolue valide.');
  }
}

// Repli lorsque ni l'origine appelante ni SITE_URL ne renseignent la base :
// l'adresse du site publié, la première déclarée ci-dessus.
const [BASE_PAR_DEFAUT] = [...SITES.values()];

/**
 * En-têtes CORS pour cette requête. L'origine n'est reflétée que si elle est
 * connue ; sinon aucune n'est renvoyée et le navigateur bloque la lecture de la
 * réponse. `Vary: Origin` évite qu'un cache serve à un site la réponse
 * autorisée pour un autre.
 */
export function enTetesCors(req: Request): Record<string, string> {
  const origine = req.headers.get('Origin') ?? '';
  const entetes: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
  if (SITES.has(origine)) {
    entetes['Access-Control-Allow-Origin'] = origine;
  }
  return entetes;
}

/** Réponse au préflight OPTIONS. */
export function reponsePreflight(req: Request, methodes = 'POST, OPTIONS'): Response {
  return new Response(null, {
    status: 204,
    headers: { ...enTetesCors(req), 'Access-Control-Allow-Methods': methodes },
  });
}

/**
 * Base de l'application d'où provient la requête — chemin compris — si et
 * seulement si son origine figure dans la liste blanche ; sinon celle du site
 * publié.
 *
 * Sert à construire une URL de retour — typiquement les `success_url` et
 * `cancel_url` d'une session Stripe (P-20). Les en-têtes CORS ne suffisent
 * pas à protéger cet usage : ils sont appliqués PAR LE NAVIGATEUR, à la
 * lecture de la réponse. Un appel direct — curl, script serveur — porte
 * l'en-tête `Origin` qu'il veut et n'a que faire de ce qui lui est renvoyé.
 * Toute valeur issue de `Origin` qui finit dans une redirection doit donc
 * être confrontée à la liste, jamais recopiée telle quelle.
 */
export function baseApplication(req: Request): string {
  const origine = req.headers.get('Origin') ?? '';
  // `||` et non `??` : une origine inconnue rend `undefined`, mais SITE_URL
  // non renseignée rend la chaîne vide — qui n'est pas « nullish » et
  // passerait donc à travers un `??`, produisant une URL de retour vide.
  return SITES.get(origine) || SITE_CONFIGURE || BASE_PAR_DEFAUT;
}
