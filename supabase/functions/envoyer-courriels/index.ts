// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { envoyer } from '../_partages/courriel.ts';
import { type Courriel, html, texte } from './message.ts';

// Envoi des e-mails des échanges — ceux que la base a rangés dans `courriels`,
// dans la transaction même de l'action, en doublant une notification.
//
// APPELÉE PAR LA BASE, JAMAIS PAR UN NAVIGATEUR. pg_net la réveille au commit
// d'une action qui prévient quelqu'un, et un passage planifié toutes les dix
// minutes relance ce qui attend. Pas de CORS donc, ni de jeton d'utilisateur :
// la base s'authentifie par la clé `courriels_cle` de son coffre, qu'elle
// envoie dans le corps de la requête. D'où la place de cette fonction parmi
// les fonctions publiques de la CI (`--no-verify-jwt`) : publiée protégée,
// elle refuserait la base, et plus aucun e-mail ne partirait.
//
// ELLE NE DÉCIDE DE RIEN. Destinataires, texte et lien sont fixés par la base
// au moment de l'action ; la requête n'apporte que la clé. Un appel de trop ne
// peut donc envoyer que ce qui attendait déjà — et la réservation
// (`for update skip locked`) empêche deux appels simultanés d'envoyer deux fois
// le même e-mail.

/** Taille d'un lot réservé, et nombre de lots au plus par appel. */
const PAR_LOT = 20;
const LOTS_MAX = 5;

// Brevo accepte des rafales bien plus fortes ; l'écart évite seulement de tout
// lancer à la même milliseconde.
const PAUSE_ENTRE_ENVOIS_MS = 150;

interface Reserve extends Courriel {
  id_courriel: string;
  destinataire: string;
  prenom: string | null;
}

function json(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

const pause = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ erreur: 'Méthode non prise en charge.' }, 405);
  }

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const demande = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const { data: cleValide } = await admin.rpc('courriels_cle_valide', {
      p_cle: typeof demande.cle === 'string' ? demande.cle : '',
    });
    if (cleValide !== true) {
      return json({ erreur: 'Clé absente ou invalide.' }, 401);
    }

    // Rien n'est réservé sans clé Brevo : les e-mails attendent le passage
    // suivant au lieu de s'user en tentatives perdues d'avance.
    if (!Deno.env.get('BREVO_API_KEY')) {
      console.error('[envoyer-courriels] BREVO_API_KEY absente — la file attend');
      return json({ erreur: 'BREVO_API_KEY absente des secrets.' }, 503);
    }

    const adresseSite = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') || 'https://tradingcorp.fr';

    let envoyes = 0;
    let echecs = 0;
    for (let lot = 0; lot < LOTS_MAX; lot++) {
      const { data, error } = await admin.rpc('reserver_courriels', { p_nombre: PAR_LOT });
      if (error) {
        console.error('[envoyer-courriels] réservation', error);
        return json({ erreur: 'La file n’a pas pu être lue.', envoyes, echecs }, 500);
      }
      const reserves = (data ?? []) as Reserve[];

      for (const c of reserves) {
        if (envoyes + echecs > 0) {
          await pause(PAUSE_ENTRE_ENVOIS_MS);
        }
        const parti = await envoyer({
          destinataire: c.destinataire,
          destinataireNom: c.prenom,
          objet: c.objet,
          html: html(c, c.prenom, adresseSite),
          texte: texte(c, c.prenom, adresseSite),
        });
        // Un identifiant dans le journal, jamais une adresse.
        const { error: erreurConclusion } = await admin.rpc('conclure_courriel', {
          p_id_courriel: c.id_courriel,
          p_envoye: parti,
        });
        if (erreurConclusion) {
          console.error('[envoyer-courriels] conclusion', c.id_courriel, erreurConclusion);
        }
        if (parti) {
          envoyes++;
        } else {
          echecs++;
        }
      }

      if (reserves.length < PAR_LOT) {
        break;
      }
    }

    return json({ envoyes, echecs }, 200);
  } catch (erreur) {
    console.error('[envoyer-courriels]', erreur);
    return json({ erreur: 'L’envoi n’a pas pu être mené à son terme.' }, 500);
  }
});
