// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';

// Webhook appelé par Stripe (jamais par le navigateur) : à déployer avec
// verify_jwt désactivé ; l'authenticité est garantie par la signature Stripe.
const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});
// Vérification de signature asynchrone (SubtleCrypto), requise dans l'edge runtime.
const fournisseurCrypto = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) {
    return new Response('Signature absente', { status: 400 });
  }

  const corps = await req.text();
  let evenement: Stripe.Event;
  try {
    evenement = await stripe.webhooks.constructEventAsync(
      corps,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '',
      undefined,
      fournisseurCrypto,
    );
  } catch {
    return new Response('Signature invalide', { status: 400 });
  }

  // DEUX événements ouvrent l'accès, et non un seul.
  //
  // Une carte confirme immédiatement : `checkout.session.completed` arrive avec
  // payment_status = 'paid'. Les moyens de paiement à notification DIFFÉRÉE —
  // Klarna en paiement 3 fois, virements — terminent la session avant que les
  // fonds soient acquis : la session est alors 'unpaid', et le paiement se
  // dénoue plus tard par `checkout.session.async_payment_succeeded`.
  //
  // N'écouter que le premier événement en n'acceptant que 'paid' laissait donc
  // un client Klarna payer sans jamais recevoir son accès — l'événement qui
  // portait la bonne nouvelle n'était même pas écouté.
  const ATTENDUS = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  if (!ATTENDUS.includes(evenement.type)) {
    return new Response('Événement ignoré', { status: 200 });
  }

  const session = evenement.data.object as Stripe.Checkout.Session;
  const { id_profil, id_formation } = session.metadata ?? {};

  // Critère de livraison recommandé par Stripe : tout sauf 'unpaid'. Une
  // session 'unpaid' n'est pas un échec — c'est un paiement différé en cours,
  // qui reviendra par async_payment_succeeded. On la laisse passer sans rien
  // écrire, plutôt que d'enregistrer un paiement qui n'est pas encore acquis.
  if (session.payment_status === 'unpaid') {
    return new Response('Paiement différé en cours — accès à la confirmation', { status: 200 });
  }
  if (!id_profil || !id_formation) {
    return new Response('Session sans paiement rattachable — ignorée', { status: 200 });
  }

  // Écritures en service_role : paiements et inscriptions n'ont aucune policy
  // d'écriture client — le webhook est leur unique source (cf. migration, D3/D5).
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // Idempotence : reference_transaction est UNIQUE — une relance de Stripe
  // (timeout, réessai automatique…) retombe sur le paiement déjà enregistré.
  let { data: paiement } = await admin
    .from('paiements')
    .upsert(
      {
        id_profil,
        montant_centimes: session.amount_total ?? 0,
        devise: session.currency ?? 'eur',
        statut: 'reussi',
        moyen_paiement: session.payment_method_types?.[0] ?? null,
        reference_transaction: session.id,
        email: session.customer_details?.email ?? null,
        // livemode false = clé de test Stripe : exclu du chiffre d'affaires.
        mode_test: !evenement.livemode,
      },
      { onConflict: 'reference_transaction', ignoreDuplicates: true },
    )
    .select('id_paiement')
    .maybeSingle();

  if (!paiement) {
    ({ data: paiement } = await admin
      .from('paiements')
      .select('id_paiement')
      .eq('reference_transaction', session.id)
      .maybeSingle());
  }
  if (!paiement) {
    // 500 : Stripe relancera l'événement.
    return new Response("Échec d'enregistrement du paiement", { status: 500 });
  }

  const { data: inscription, error } = await admin
    .from('inscriptions')
    .upsert(
      {
        id_profil,
        id_formation,
        id_paiement: paiement.id_paiement,
        statut: 'active',
        source: 'paiement',
      },
      { onConflict: 'id_profil,id_formation', ignoreDuplicates: true },
    )
    .select('id_inscription')
    .maybeSingle();
  if (error) {
    return new Response("Échec de création de l'inscription", { status: 500 });
  }

  // Notification à l'apprenant — uniquement quand l'inscription vient d'être
  // créée (une relance Stripe retombe sur le doublon et n'en renvoie pas).
  if (inscription) {
    const { data: formation } = await admin
      .from('formations')
      .select('titre')
      .eq('id_formation', id_formation)
      .maybeSingle();
    await admin.from('notifications').insert({
      id_profil,
      titre: 'Paiement confirmé',
      message: `Ton accès à « ${formation?.titre ?? 'ta formation'} » est actif.`,
      type: 'succes',
      lien: '/espace/formations',
    });
  }

  return new Response('OK', { status: 200 });
});
