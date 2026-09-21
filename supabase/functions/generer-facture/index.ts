// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Téléchargement d'une facture, émise par Stripe au moment du paiement.
//
// Le nom de la fonction date du temps où TradingCorp composait ses factures
// lui-même ; il est conservé pour ne pas laisser derrière lui une fonction
// déployée orpheline. Elle ne génère rien : elle rend le PDF que Stripe a déjà
// produit et envoyé à l'acheteur.
//
// POURQUOI PASSER PAR ICI plutôt que de donner le lien au navigateur une fois
// pour toutes : les liens de facture Stripe EXPIRENT — trente jours après
// l'échéance, cent vingt au plus. Un lien stocké serait mort bien avant que
// l'élève ne vienne rechercher sa facture. On stocke l'identifiant, et on
// redemande un lien frais à chaque clic.
//
// Le droit vient de la RLS, comme pour `video-signee` : la ligne est d'abord
// lue avec le jeton de l'appelant — `factures_select_titulaire` ne montre que
// les siennes, ou toutes à l'administrateur —, et le service_role n'intervient
// qu'ensuite, pour lire l'identifiant Stripe, hors du périmètre client.

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});

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

    // 2. L'identifiant Stripe, une fois le droit établi sur cette ligne.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: ligne } = await admin
      .from('factures')
      .select('stripe_invoice_id')
      .eq('id_facture', id_facture)
      .maybeSingle();
    if (!ligne?.stripe_invoice_id) {
      return json(req, { erreur: 'Cette facture n’est pas disponible.' }, 404);
    }

    // 3. Un lien frais. Une facture émise avec les clés de test n'existe pas
    // pour les clés réelles, et inversement : Stripe répond alors « introuvable »,
    // ce qui n'a rien d'une panne — d'où un 404 et non un 500.
    let pdf: string | null | undefined;
    try {
      pdf = (await stripe.invoices.retrieve(ligne.stripe_invoice_id as string)).invoice_pdf;
    } catch (erreur) {
      console.error('[generer-facture] Stripe', ligne.stripe_invoice_id, erreur);
      return json(req, { erreur: 'Cette facture n’est pas accessible pour le moment.' }, 404);
    }
    if (!pdf) {
      return json(req, { erreur: 'Cette facture n’est pas encore disponible.' }, 404);
    }

    return json(req, { url: pdf, numero: autorisee.numero }, 200);
  } catch (erreur) {
    console.error('[generer-facture]', erreur);
    return json(req, { erreur: 'La facture n’a pas pu être préparée.' }, 500);
  }
});
