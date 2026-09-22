// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';
import { envoyerConfirmation } from '../_partages/confirmation.ts';
import { enregistrerFacture, telechargerPdf } from './facture-stripe.ts';

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

  // Le client de service, nécessaire aussi bien à l'ouverture d'accès qu'à sa
  // fermeture : `paiements` et `inscriptions` n'ont aucune policy d'écriture.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  // ---------------------------------------------------------------------------
  // FERMETURE D'ACCÈS — la moitié manquante du cycle de vie d'un paiement.
  //
  // La table `paiements` déclare quatre statuts et un seul était jamais écrit :
  // `reussi`. Un remboursement effectué dans Stripe ne laissait aucune trace
  // ici — l'argent repartait, l'accès à vie restait ouvert, et la vente
  // continuait de compter dans le chiffre d'affaires (P-17).
  //
  // Deux événements ferment un accès :
  //   • `charge.refunded` — remboursement, total ou partiel ;
  //   • `checkout.session.async_payment_failed` — le paiement différé
  //     (Klarna, virement) qui avait ouvert l'accès ne s'est jamais dénoué.
  // ---------------------------------------------------------------------------
  if (evenement.type === 'charge.refunded') {
    const charge = evenement.data.object as Stripe.Charge;

    // Un remboursement PARTIEL n'est pas une annulation : un geste commercial
    // ne doit pas fermer l'accès. Seul le remboursement intégral le fait.
    if (charge.amount_refunded < charge.amount) {
      return new Response('Remboursement partiel — accès maintenu', { status: 200 });
    }

    // La charge ne connaît pas la session Checkout : le lien passe par le
    // PaymentIntent, qui est la référence commune aux deux.
    const intention =
      typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
    if (!intention) {
      return new Response('Charge sans intention de paiement — ignorée', { status: 200 });
    }

    const sessions = await stripe.checkout.sessions.list({ payment_intent: intention, limit: 1 });
    const reference = sessions.data[0]?.id;
    if (!reference) {
      return new Response('Aucune session Checkout pour cette charge — ignorée', { status: 200 });
    }

    // Une seule RPC, donc une seule transaction : le paiement passe à
    // `rembourse`, l'inscription à `revoquee`, l'apprenant est notifié et le
    // journal est écrit — ou rien ne l'est. Enchaîner quatre appels REST
    // laisserait, au premier échec, un paiement remboursé avec un accès encore
    // ouvert : précisément l'incohérence qu'on corrige. La fonction est
    // idempotente, ce qui rend les relances de Stripe inoffensives.
    const { error } = await admin.rpc('revoquer_pour_remboursement', {
      p_reference: reference,
      p_motif: 'remboursement Stripe',
    });
    if (error) {
      // 500 : Stripe relancera l'événement.
      return new Response('Échec de la révocation', { status: 500 });
    }
    return new Response('Remboursement traité', { status: 200 });
  }

  if (evenement.type === 'checkout.session.async_payment_failed') {
    const session = evenement.data.object as Stripe.Checkout.Session;
    const { error } = await admin.rpc('revoquer_pour_remboursement', {
      p_reference: session.id,
      p_motif: 'paiement différé échoué',
    });
    if (error) {
      return new Response("Échec du traitement de l'échec de paiement", { status: 500 });
    }
    return new Response('Échec de paiement traité', { status: 200 });
  }

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

  // Idempotence : reference_transaction est UNIQUE — une relance de Stripe
  // (timeout, réessai automatique…) retombe sur le paiement déjà enregistré.
  //
  // C'EST ICI, et nulle part ailleurs, que se décide « cet encaissement est-il
  // nouveau ». `ignoreDuplicates` fait un ON CONFLICT DO NOTHING : l'upsert ne
  // rend une ligne QUE la première fois. Ce booléen commande ensuite les deux
  // gestes qui ne doivent avoir lieu qu'une fois — notifier et facturer.
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

  const encaissementNouveau = paiement !== null;
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

  // L'accès. Mise à jour SUR CONFLIT, et non « ignorer le doublon ».
  //
  // `ignoreDuplicates: true` laissait la ligne existante intacte, quel que soit
  // son état. Un apprenant remboursé — donc `revoquee` par
  // `revoquer_pour_remboursement` — qui rachetait voyait son paiement encaissé
  // et son accès rester fermé. La contrainte unique (id_profil, id_formation)
  // empêche d'en créer une seconde : rien ne l'aurait rouvert.
  //
  // La mise à jour ne touche que les quatre colonnes ci-dessous : la date
  // d'inscription d'origine est conservée. Écraser `source` est voulu — un
  // accès ouvert à la main puis payé EST un accès payé, et c'est ce qui permet
  // de retrouver la vente derrière l'inscription.
  //
  // Idempotent : une relance de Stripe réécrit les mêmes valeurs.
  const { error } = await admin.from('inscriptions').upsert(
    {
      id_profil,
      id_formation,
      id_paiement: paiement.id_paiement,
      statut: 'active',
      source: 'paiement',
    },
    { onConflict: 'id_profil,id_formation' },
  );
  if (error) {
    return new Response("Échec de création de l'inscription", { status: 500 });
  }

  // Notification et facture : une fois par ENCAISSEMENT, jamais par inscription.
  //
  // Cette condition portait sur l'inscription, et c'était un défaut : un élève
  // déjà inscrit — repris de Wix, ou à qui l'accès avait été ouvert à la main —
  // retombait sur le doublon, `inscription` valait null, et son achat ne
  // donnait lieu à AUCUNE facture. On encaissait sans facturer. L'obligation de
  // facturation ne dépend pas de l'existence préalable d'un accès.
  //
  // Le paiement, lui, est unique par `reference_transaction` : une relance de
  // Stripe sur le même événement ne rentre pas ici, et rien n'est émis deux fois.
  if (encaissementNouveau) {
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

    const designation = formation?.titre ?? 'Formation TradingCorp';
    const adresseSite = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') || 'https://tradingcorp.fr';

    // La facture : ÉMISE PAR STRIPE, pas ici. Checkout l'a créée au paiement
    // (`invoice_creation`, paramétré dans `checkout`). On en garde le reflet
    // pour l'écran de facturation, et on récupère son PDF pour le joindre à la
    // confirmation : l'élève n'a pas d'écran de factures, l'e-mail est le seul
    // endroit où il la reçoit. Ne pas dépendre de l'envoi de Stripe, c'est ne
    // dépendre ni d'un réglage de console, ni du mode — Stripe n'envoie rien en
    // mode test.
    const facture = await enregistrerFacture(stripe, session, {
      idProfil: id_profil,
      idPaiement: paiement.id_paiement,
      designation,
    });
    const pdfFacture = facture?.lienPdf ? await telechargerPdf(facture.lienPdf) : null;

    // La confirmation de commande : une obligation DISTINCTE de la facture
    // (L221-13 — le contrat confirmé sur support durable, avec le droit de
    // rétractation), que l'e-mail de Stripe ne remplit pas. Envoyée même si
    // le reflet de la facture a échoué : l'une ne dépend pas de l'autre.
    //
    // Awaitée plutôt que détachée : l'envoi prend une seconde, loin des vingt
    // que Stripe accorde. Aucune des deux fonctions n'échoue jamais — elles
    // journalisent —, donc rien ici ne peut provoquer un rejeu de l'événement.
    await envoyerConfirmation(
      {
        designation,
        montantCentimes: session.amount_total ?? 0,
        devise: session.currency ?? 'eur',
        clientNom: session.customer_details?.name ?? null,
        clientEmail: session.customer_details?.email ?? null,
        numeroFacture: facture?.numero ?? null,
        pdfFacture,
      },
      adresseSite,
    );
  }

  return new Response('OK', { status: 200 });
});
