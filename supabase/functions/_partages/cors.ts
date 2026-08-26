// Origines autorisées à appeler les Edge Functions, partagées par toutes les
// fonctions appelées depuis le navigateur.
//
// Elles répondaient jusqu'ici `Access-Control-Allow-Origin: *`, ce qui laissait
// n'importe quelle page du web déclencher un appel authentifié depuis le
// navigateur d'un utilisateur connecté. Le jeton n'est pas transmis
// automatiquement — il vit dans le localStorage, pas dans un cookie — donc ce
// n'était pas un CSRF exploitable ; mais `*` autorisait aussi la LECTURE de la
// réponse par un script tiers, et laissait le quota de cmc-proxy ouvert à qui
// voulait s'en servir depuis son propre site.
//
// SITE_URL permet d'ajouter une origine sans redéployer (préproduction, nom de
// domaine définitif). Localhost reste accepté pour le développement : il n'a de
// valeur que sur la machine du développeur, jamais sur le site publié.
const ORIGINES = [
  'https://darealmitch.github.io',
  'http://localhost:4200',
  'http://127.0.0.1:4200',
  Deno.env.get('SITE_URL') ?? '',
].filter(Boolean);

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
  if (ORIGINES.includes(origine)) {
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
 * L'origine de la requête, si et seulement si elle figure dans la liste
 * blanche ; sinon `SITE_URL`, l'adresse du site publié.
 *
 * Sert à construire une URL de retour — typiquement les `success_url` et
 * `cancel_url` d'une session Stripe (P-20). Les en-têtes CORS ne suffisent
 * pas à protéger cet usage : ils sont appliqués PAR LE NAVIGATEUR, à la
 * lecture de la réponse. Un appel direct — curl, script serveur — porte
 * l'en-tête `Origin` qu'il veut et n'a que faire de ce qui lui est renvoyé.
 * Toute valeur issue de `Origin` qui finit dans une redirection doit donc
 * être confrontée à la liste, jamais recopiée telle quelle.
 */
export function origineValidee(req: Request): string {
  const origine = req.headers.get('Origin') ?? '';
  if (ORIGINES.includes(origine)) {
    return origine;
  }
  return Deno.env.get('SITE_URL') ?? ORIGINES[0] ?? '';
}
