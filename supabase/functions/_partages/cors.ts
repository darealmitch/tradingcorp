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
