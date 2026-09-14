// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Consultation d'une facture déjà émise.
//
// La facture est CRÉÉE par le webhook, au moment du paiement, et envoyée par
// e-mail avec la confirmation de commande. Cette fonction-ci ne fabrique rien :
// elle rend le document que l'acheteur a déjà reçu, pour qu'il puisse le
// retrouver sans fouiller sa boîte mail.
//
// Le droit vient de la RLS, comme pour `video-signee` : la ligne est d'abord
// lue avec le jeton de l'appelant — `factures_select_titulaire` ne montre que
// les siennes — et le service_role n'intervient qu'ensuite, pour lire le
// `chemin_storage`, dont le privilège est retiré au client.

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

  try {
    const porteur = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const {
      data: { user },
    } = await porteur.auth.getUser();
    if (!user) {
      return json(req, { erreur: 'Connexion requise.' }, 401);
    }

    const { id_facture } = (await req.json().catch(() => ({}))) as { id_facture?: string };
    if (!id_facture) {
      return json(req, { erreur: 'Requête invalide.' }, 400);
    }

    // 1. Le droit : sous RLS, une facture qui n'est pas la sienne n'existe pas.
    const { data: autorisee } = await porteur
      .from('factures')
      .select('numero')
      .eq('id_facture', id_facture)
      .maybeSingle();
    if (!autorisee) {
      return json(req, { erreur: 'Facture introuvable.' }, 403);
    }

    // 2. Le fichier, une fois le droit établi sur cette ligne précise.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: facture } = await admin
      .from('factures')
      .select('chemin_storage')
      .eq('id_facture', id_facture)
      .maybeSingle();
    if (!facture?.chemin_storage) {
      // Le document n'a pas été déposé : l'adresse du vendeur manquait au
      // moment de la vente, ou le dépôt a échoué. Le journal du webhook le dit.
      return json(req, { erreur: 'Cette facture n’est pas encore disponible.' }, 404);
    }

    // URL signée plutôt que bucket ouvert : le fichier reste inaccessible par
    // son chemin, et le lien expire. Dix minutes, comme pour les certificats.
    const { data: lien, error: erreurLien } = await admin.storage
      .from('factures')
      .createSignedUrl(facture.chemin_storage as string, 600);
    if (erreurLien || !lien) {
      console.error('[generer-facture] lien', erreurLien);
      return json(req, { erreur: 'Le lien de téléchargement n’a pas pu être créé.' }, 500);
    }

    return json(req, { url: lien.signedUrl, numero: autorisee.numero }, 200);
  } catch (erreur) {
    console.error('[generer-facture]', erreur);
    return json(req, { erreur: 'La facture n’a pas pu être préparée.' }, 500);
  }
});
