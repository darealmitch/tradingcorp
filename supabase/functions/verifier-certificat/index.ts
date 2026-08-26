// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Vérification publique d'un certificat par son numéro.
//
// Fonction PUBLIQUE (un employeur qui contrôle une attestation n'a pas de
// compte) : déployer avec --no-verify-jwt.
//
// Pourquoi elle existe, alors que la base sait déjà répondre : la RPC
// `verifier_certificat` était exposée directement à `anon`, sans rien qui
// limite le nombre d'appels (audit P-18). Une limitation par IP ne peut pas
// s'écrire en SQL — PostgREST ne transmet pas l'adresse de l'appelant à la
// base. Elle s'écrit donc ici, et la RPC n'est plus accessible qu'en rôle de
// service.
//
// Le numéro est tiré au hasard sur un alphabet de 31 caractères : la limitation
// n'est pas ce qui empêche de le deviner, elle borne le coût d'un robot qui
// essaierait quand même.

const FENETRE_MS = 60_000;
const MAX_APPELS_PAR_FENETRE = 20;

const compteurs = new Map<string, { debut: number; appels: number }>();

function debitDepasse(req: Request): boolean {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'inconnue';
  const maintenant = Date.now();
  const compteur = compteurs.get(ip);

  if (!compteur || maintenant - compteur.debut > FENETRE_MS) {
    compteurs.set(ip, { debut: maintenant, appels: 1 });
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
    return reponsePreflight(req, 'POST, OPTIONS');
  }

  if (debitDepasse(req)) {
    return json(req, { erreur: 'Trop de vérifications — réessaie dans une minute.' }, 429);
  }

  let saisi: unknown;
  try {
    ({ numero: saisi } = await req.json());
  } catch {
    return json(req, { erreur: 'Requête illisible.' }, 400);
  }

  const numero = typeof saisi === 'string' ? saisi.trim().toUpperCase() : '';

  // Filtre de forme avant d'interroger la base : un numéro hors format ne peut
  // correspondre à rien, autant ne pas payer la requête. La borne haute évite
  // aussi qu'une chaîne démesurée serve de charge utile.
  if (numero.length < 6 || numero.length > 64) {
    return json(req, { certificat: null }, 200);
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  const { data, error } = await admin.rpc('verifier_certificat', { p_numero: numero });
  if (error) {
    console.error('[verifier-certificat]', error);
    return json(req, { erreur: 'La vérification a échoué.' }, 500);
  }

  // Réponse volontairement identique en forme, qu'un certificat existe ou non :
  // le code de statut ne doit pas devenir l'oracle qui remplace l'énumération.
  return json(req, { certificat: (data as unknown[])?.[0] ?? null }, 200);
});
