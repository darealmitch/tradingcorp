// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';
import { envoyerConfirmation } from '../_partages/confirmation.ts';

// Éprouve l'envoi de la confirmation de commande SANS vente.
//
// Le nom date du temps où TradingCorp composait ses propres factures ; il est
// conservé pour ne pas laisser une fonction déployée orpheline. La facture est
// désormais émise et envoyée par Stripe — elle s'éprouve par un achat en mode
// test. Ce qui reste à TradingCorp, et que cette fonction éprouve, c'est la
// confirmation de commande (L221-13) : le gabarit, l'expéditeur, la clé Brevo,
// la remise.
//
// CE QU'ELLE NE FAIT PAS : elle n'écrit rien — ni paiement, ni facture, ni
// ligne de journal. C'est un outil de diagnostic, pas un acte de gestion.
//
// LE DESTINATAIRE EST LIBRE, mais le CONTENU ne l'est pas, et c'est là que se
// joue la sûreté. Le message est la vraie confirmation, avec des données
// fictives et un bandeau d'essai en tête : il n'y a rien à composer pour qui
// voudrait détourner la fonction, et il lui faudrait de toute façon un jeton
// d'administrateur. À défaut d'adresse, c'est celle de l'appelant.
//
// Le mode « dns » lit en outre, par l'API Brevo, l'état d'authentification du
// domaine expéditeur.

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

    const { destinataire, mode } = (await req.json().catch(() => ({}))) as {
      destinataire?: string;
      mode?: string;
    };

    // MODE « DNS » — ce que Brevo attend dans la zone du domaine.
    //
    // Lu par l'API plutôt que relevé dans l'interface : les écrans changent, et
    // guider quelqu'un de mémoire dans des menus qu'on ne voit pas est le plus
    // sûr moyen de lui faire perdre une demi-heure. L'API, elle, rend la valeur
    // exacte à recopier — et l'état de chaque enregistrement, donc ce qui
    // manque réellement.
    if (mode === 'dns') {
      const cle = Deno.env.get('BREVO_API_KEY');
      if (!cle) {
        return json(req, { erreur: 'BREVO_API_KEY absente des secrets.' }, 503);
      }
      const reponse = await fetch('https://api.brevo.com/v3/senders/domains', {
        headers: { 'api-key': cle, accept: 'application/json' },
      });
      if (!reponse.ok) {
        console.error('[essai-facturation] domaines', reponse.status, await reponse.text());
        return json(req, { erreur: `Brevo a répondu ${reponse.status}.` }, 502);
      }

      // NOMS DE CHAMPS RELEVÉS SUR LA VRAIE RÉPONSE, et non devinés : Brevo
      // rend `domain_name` et `records`, là où la première version de ce code
      // lisait `domain` et `dns_records`. Les deux graphies sont acceptées,
      // mais c'est la première qui sert.
      //
      // `records` vaut NULL sur un domaine déjà authentifié : Brevo n'a plus
      // rien à demander. Une liste vide n'est donc pas une anomalie, c'est la
      // bonne nouvelle — encore faut-il que l'écran le dise, au lieu d'afficher
      // un tableau sans lignes.
      const charge = (await reponse.json()) as { domains?: Record<string, unknown>[] };
      const domaines = (charge.domains ?? []).map((d) => {
        const auteur = (d.authenticator ?? {}) as Record<string, unknown>;
        const bruts = (d.records ?? d.dns_records ?? {}) as Record<string, unknown>;
        const nom = [d.domain_name, d.domain].find((v) => typeof v === 'string') as
          string | undefined;
        return {
          domaine: nom ?? '',
          authentifie: d.authenticated === true,
          // Le fournisseur DNS détecté par Brevo. Anodin en apparence, et
          // pourtant c'est ce qui dit OÙ poser un enregistrement manquant : le
          // bureau d'enregistrement n'est pas toujours celui qui sert la zone.
          fournisseur: typeof d.provider === 'string' ? d.provider : null,
          authentifieLe: typeof auteur.creationDate === 'string' ? auteur.creationDate : null,
          enregistrements: Object.values(bruts).map((brut) => {
            const r = (brut ?? {}) as Record<string, unknown>;
            return {
              nom: typeof r.host_name === 'string' ? r.host_name : '',
              type: typeof r.type === 'string' ? r.type.toUpperCase() : 'TXT',
              valeur: typeof r.value === 'string' ? r.value : '',
              pose: r.status === true,
            };
          }),
        };
      });
      // Journalisé seulement si la lecture n'a rien donné du tout : un domaine
      // authentifié sans enregistrement à poser est un cas normal.
      if (domaines.length > 0 && domaines.every((d) => !d.domaine)) {
        console.error(
          '[essai-facturation] forme inattendue',
          JSON.stringify(charge).slice(0, 2000),
        );
      }
      return json(req, { domaines }, 200);
    }

    // Adresse demandée, ou la sienne. Le format est vérifié ici : une adresse
    // mal formée part quand même chez Brevo, qui la refuse — autant rendre un
    // message qui dise ce qui ne va pas.
    const adresse = destinataire?.trim() || user.email;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adresse)) {
      return json(req, { erreur: 'Cette adresse électronique n’est pas valide.' }, 400);
    }

    // Une référence qui ne peut appartenir à aucune série de Stripe : la date du
    // jour et le mot ESSAI.
    const numero = `ESSAI-${new Date().toISOString().slice(0, 10)}`;
    const adresseSite = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') || 'https://tradingcorp.fr';

    const cleBrevo = Boolean(Deno.env.get('BREVO_API_KEY'));
    const parti = await envoyerConfirmation(
      {
        designation: 'Formation TradingCorp',
        montantCentimes: 99700,
        devise: 'eur',
        // Le nom n'a de sens que si le message part à l'appelant lui-même.
        clientNom:
          adresse === user.email
            ? [profil.prenom, profil.nom].filter(Boolean).join(' ').trim() || null
            : null,
        clientEmail: adresse,
        numeroFacture: numero,
        essai: true,
      },
      adresseSite,
    );

    return json(
      req,
      {
        destinataire: adresse,
        numero,
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
