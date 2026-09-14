// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';
import { composer } from '../_partages/facture.ts';
import { envoyer } from '../_partages/courriel.ts';
import { vendeur } from '../_partages/vendeur.ts';

// Éprouve la chaîne de facturation SANS vente.
//
// POURQUOI ELLE EXISTE. La composition du PDF et l'envoi Brevo ne se vérifient
// qu'à l'exécution, et jusqu'ici le seul moyen de les déclencher était un achat
// Stripe réel : un numéro consommé à jamais, une pièce comptable, un e-mail à
// un client. Trois effets définitifs pour répondre à « est-ce que l'envoi
// part ? ». Cette fonction pose la même question sans aucun d'eux.
//
// CE QU'ELLE NE FAIT PAS, et c'est l'essentiel :
//   • elle n'appelle JAMAIS `numero_facture()` — la série réelle est intacte,
//     le document porte un numéro « ESSAI-… » qu'aucune vente ne peut produire ;
//   • elle n'écrit rien dans `factures`, ni dans le stockage ;
//   • elle n'envoie qu'à l'adresse de CELUI QUI L'APPELLE. Pas de destinataire
//     en paramètre : une fonction qui expédie des pièces jointes à une adresse
//     libre est un relais ouvert, quand bien même elle serait réservée au staff.
//
// Elle éprouve en revanche tout le reste, dans le vrai runtime : `VENDEUR_ADRESSE`,
// la composition pdf-lib, la clé Brevo, l'expéditeur vérifié, la remise.

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
    if (!user?.email) {
      return json(req, { erreur: 'Connexion requise.' }, 401);
    }

    // Réservé à l'administrateur. La lecture passe par le jeton de l'appelant :
    // `profils_select_self_ou_staff` lui rend sa propre ligne, et le rôle qui
    // s'y trouve est celui que la base applique — pas une copie de la règle.
    const { data: profil } = await porteur
      .from('profils')
      .select('role, prenom, nom')
      .eq('id_profil', user.id)
      .maybeSingle();
    if (profil?.role !== 'admin') {
      return json(req, { erreur: 'Réservé aux administrateurs.' }, 403);
    }

    const identite = vendeur();
    if (!identite) {
      // Le diagnostic le plus utile de tous : c'est ce silence-là qui, en
      // production, empêcherait toute facture d'être émise sans rien casser
      // d'autre. Le dire ici évite de le découvrir sur une vraie vente.
      return json(
        req,
        {
          erreur:
            'VENDEUR_ADRESSE absente des secrets — aucune facture ne serait émise lors d’une vente.',
          vendeur: false,
        },
        503,
      );
    }

    // Un numéro qui ne peut appartenir à aucune série : la vraie numérotation
    // est « F2026-0001 », celle-ci porte la date du jour et le mot ESSAI.
    const numero = `ESSAI-${new Date().toISOString().slice(0, 10)}`;
    const pdf = await composer(identite, {
      numero,
      dateEmission: new Date().toISOString(),
      designation: 'Formation TradingCorp — document d’essai',
      montantCentimes: 99700,
      devise: 'eur',
      clientNom: [profil.prenom, profil.nom].filter(Boolean).join(' ').trim() || null,
      clientEmail: user.email,
      moyenPaiement: 'card',
      datePaiement: new Date().toISOString(),
      // Porte la mention « DOCUMENT DE TEST — aucun paiement réel » en clair
      // sur le PDF : personne ne peut le prendre pour une facture.
      modeTest: true,
    });

    const cleBrevo = Boolean(Deno.env.get('BREVO_API_KEY'));
    const parti = await envoyer({
      destinataire: user.email,
      destinataireNom: profil.prenom ?? null,
      objet: `Essai de facturation TradingCorp — ${numero}`,
      html: `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2233;max-width:620px">
  <p>Ce message est un essai déclenché depuis l’écran Paramètres.</p>
  <p>
    Il emprunte exactement le chemin d’une vraie confirmation de commande :
    même composition du PDF, même expéditeur, même envoi. Seules diffèrent les
    données, qui sont fictives, et la pièce jointe, qui porte un numéro
    « ESSAI » et la mention « document de test ».
  </p>
  <p>Aucune vente n’a été enregistrée et aucun numéro de facture n’a été consommé.</p>
  <p style="margin-top:26px;color:#6b6f80;font-size:13px">TradingCorp</p>
</div>`.trim(),
      piecesJointes: [{ nom: `${numero}.pdf`, contenu: pdf }],
    });

    return json(
      req,
      {
        destinataire: user.email,
        numero,
        vendeur: true,
        // `envoyer` avale ses erreurs et journalise : ces deux drapeaux
        // permettent de distinguer « clé absente » de « Brevo a refusé », sans
        // quoi l'écran ne pourrait dire que « ça n'a pas marché ».
        brevo_configure: cleBrevo,
        envoye: parti,
        // Message prêt à afficher : `invoquer` le relève dans le champ `erreur`
        // du corps, sans quoi l'écran retomberait sur un libellé générique.
        erreur: parti
          ? undefined
          : cleBrevo
            ? 'Brevo a refusé l’envoi. Le journal de la fonction en donne le motif — souvent un expéditeur non vérifié.'
            : 'BREVO_API_KEY absente des secrets : aucun e-mail ne peut partir.',
      },
      parti ? 200 : 502,
    );
  } catch (erreur) {
    console.error('[essai-facturation]', erreur);
    return json(req, { erreur: 'L’essai n’a pas pu être mené à son terme.' }, 500);
  }
});
