// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import Stripe from 'npm:stripe@18';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  // Client HTTP basé sur fetch : l'edge runtime n'a pas le module http de Node.
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
    // Identité de l'appelant, portée par son JWT (verify_jwt reste actif sur
    // cette fonction : les appels anonymes sont rejetés avant d'arriver ici).
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

    const { id_formation } = (await req.json().catch(() => ({}))) as { id_formation?: string };
    if (!id_formation) {
      return json(req, { erreur: 'Formation manquante.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Les comptes formateur et admin ne sont jamais clients : leurs paiements
    // fausseraient le chiffre d'affaires.
    const { data: profil } = await admin
      .from('profils')
      .select('role')
      .eq('id_profil', user.id)
      .maybeSingle();
    if (profil?.role !== 'apprenant') {
      return json(
        req,
        { erreur: 'Les comptes formateur et admin ne passent pas par l’achat.' },
        403,
      );
    }

    const { data: formation } = await admin
      .from('formations')
      .select('id_formation, titre, prix_centimes, devise, est_publiee')
      .eq('id_formation', id_formation)
      .maybeSingle();
    if (!formation?.est_publiee) {
      return json(req, { erreur: 'Formation introuvable.' }, 404);
    }
    if (formation.prix_centimes <= 0) {
      return json(req, { erreur: "Cette formation n'est pas en vente." }, 400);
    }

    const { data: existante } = await admin
      .from('inscriptions')
      .select('id_inscription')
      .eq('id_profil', user.id)
      .eq('id_formation', id_formation)
      .eq('statut', 'active')
      .maybeSingle();
    if (existante) {
      return json(req, { erreur: 'Tu es déjà inscrit à cette formation.' }, 409);
    }

    // Origine de l'appel : ramène vers l'app qui a initié l'achat (dev ou prod).
    const origine = req.headers.get('Origin') ?? Deno.env.get('SITE_URL') ?? '';

    // Le prix vient de la table formations (source de vérité) — pas de Price
    // Stripe à synchroniser. Le webhook rattachera le paiement au compte via
    // les métadonnées : cf. AUDIT-ARCHITECTURE, option A.
    //
    // `payment_method_types` n'est volontairement PAS fixé ici : sans lui,
    // Stripe applique les moyens de paiement cochés dans le Dashboard et les
    // filtre selon le pays et le montant du client. C'est ainsi que Klarna
    // (paiement en 3 fois) s'active — par un réglage, sans redéploiement. Les
    // figer dans le code reviendrait à devoir republier la fonction pour
    // ajouter un moyen de paiement, et masquerait Klarna aux clients éligibles.
    //
    // Klarna paie le marchand en une fois : le montant encaissé est identique,
    // c'est Klarna qui porte l'échelonnement et le risque d'impayé. Rien à
    // changer côté inscriptions. Attention en revanche au plafond — le
    // paiement en 3 fois est limité à 3 000 € en France.
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: formation.devise,
            unit_amount: formation.prix_centimes,
            product_data: { name: formation.titre },
          },
        },
      ],
      customer_email: user.email,
      metadata: { id_profil: user.id, id_formation: formation.id_formation },
      success_url: `${origine}/espace?achat=succes`,
      cancel_url: `${origine}/espace?achat=annule`,
    });

    return json(req, { url: session.url }, 200);
  } catch (erreur) {
    console.error('[checkout]', erreur);
    return json(req, { erreur: 'Le paiement est indisponible pour le moment.' }, 500);
  }
});
