// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';
import { envoyer } from '../_partages/courriel.ts';
import {
  type Annonce,
  DOCUMENTS,
  type DocumentLegal,
  dateValide,
  html,
  notification,
  objet,
  texte,
} from './message.ts';

// Annonce d'une mise à jour des conditions — CGU, politique de confidentialité,
// CGV : une notification dans l'espace ET un e-mail, comme le promet l'article
// 14 des CGU.
//
// Deux modes :
//   • « essai » — aux seuls comptes de test (`profils.est_test`), avec un
//     bandeau d'essai : on voit l'annonce telle qu'un élève la reçoit, dans son
//     espace et dans sa boîte, sans que personne d'autre ne reçoive rien ;
//   • « envoi » — à tous les comptes.
//
// UNE FOIS PAR PERSONNE. La notification porte une clé d'événement unique par
// personne (`conditions:<date>`), et l'e-mail ne part qu'aux personnes que
// `annoncer_mise_a_jour_conditions` vient de notifier. Un double clic, ou un
// second envoi après une coupure, ne renvoie donc rien à qui a déjà été
// prévenu — et prévient qui ne l'avait pas été. Revers de la médaille : un
// e-mail refusé ne repart pas au second envoi. D'où la clé Brevo vérifiée AVANT
// de poser la moindre notification, et l'essai à faire passer d'abord.
//
// Réservé à l'administrateur, comme l'essai de facturation.

const LONGUEUR_MAX_RESUME = 2000;

// Brevo accepte des rafales bien plus fortes ; l'écart évite seulement de tout
// lancer à la même milliseconde.
const PAUSE_ENTRE_ENVOIS_MS = 150;

interface Destinataire {
  id_destinataire: string;
  prenom_destinataire: string | null;
  courriel: string;
}

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

const pause = (ms: number) => new Promise((resoudre) => setTimeout(resoudre, ms));

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

    // Lu avec le jeton de l'appelant : `profils_select_self_ou_staff` lui rend
    // sa propre ligne, et le rôle qui s'y trouve est celui que la base applique.
    const { data: profil } = await porteur
      .from('profils')
      .select('role')
      .eq('id_profil', user.id)
      .maybeSingle();
    if (profil?.role !== 'admin') {
      return json(req, { erreur: 'Réservé aux administrateurs.' }, 403);
    }

    const demande = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const essai = demande.mode === 'essai';
    if (!essai && demande.mode !== 'envoi') {
      return json(req, { erreur: 'Mode d’envoi inconnu.' }, 400);
    }

    const date = typeof demande.date === 'string' ? demande.date : '';
    if (!dateValide(date)) {
      return json(req, { erreur: 'La date de la nouvelle version n’est pas valide.' }, 400);
    }

    // Dans l'ordre de DOCUMENTS, sans doublon ni intrus : le lien d'un e-mail
    // signé TradingCorp ne vient jamais d'une saisie.
    const demandes = Array.isArray(demande.documents) ? demande.documents : [];
    const documents = (Object.keys(DOCUMENTS) as DocumentLegal[]).filter((d) =>
      demandes.includes(d),
    );
    if (documents.length === 0) {
      return json(req, { erreur: 'Choisis au moins un document mis à jour.' }, 400);
    }

    const resume = typeof demande.resume === 'string' ? demande.resume.trim() : '';
    if (!resume) {
      return json(req, { erreur: 'Le résumé des changements est vide.' }, 400);
    }
    if (resume.length > LONGUEUR_MAX_RESUME) {
      return json(
        req,
        { erreur: `Le résumé dépasse ${LONGUEUR_MAX_RESUME} caractères : raccourcis-le.` },
        400,
      );
    }

    // Avant toute notification : sans clé, les notifications seraient posées et
    // aucun e-mail ne partirait — sans pouvoir repartir au second envoi.
    if (!Deno.env.get('BREVO_API_KEY')) {
      return json(
        req,
        { erreur: 'BREVO_API_KEY absente des secrets : aucun e-mail ne peut partir.' },
        503,
      );
    }

    const annonce: Annonce = { date, documents, resume, essai };
    const { titre, message, lien } = notification(annonce);
    // L'essai porte une clé neuve à chaque fois : il doit pouvoir se rejouer.
    const cle = essai ? `essai_conditions:${date}:${Date.now()}` : `conditions:${date}`;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data, error } = await admin.rpc('annoncer_mise_a_jour_conditions', {
      p_cle: cle,
      p_titre: titre,
      p_message: message,
      p_lien: lien,
      p_essai: essai,
    });
    if (error) {
      console.error('[informer-conditions] notifications', error);
      return json(req, { erreur: 'Les notifications n’ont pas pu être posées.' }, 500);
    }
    const destinataires = (data ?? []) as Destinataire[];

    if (destinataires.length === 0) {
      return essai
        ? json(
            req,
            {
              erreur:
                'Aucun compte de test : marque un compte comme compte de test depuis l’écran Utilisateurs.',
            },
            409,
          )
        : json(
            req,
            {
              mode: 'envoi',
              notifies: 0,
              courriels_envoyes: 0,
              courriels_echoues: 0,
              deja_informes: true,
            },
            200,
          );
    }

    const adresseSite = Deno.env.get('SITE_URL')?.replace(/\/+$/, '') || 'https://tradingcorp.fr';
    const aujourdhui = new Date().toISOString().slice(0, 10);

    const echecs: string[] = [];
    for (const [rang, d] of destinataires.entries()) {
      if (rang > 0) {
        await pause(PAUSE_ENTRE_ENVOIS_MS);
      }
      const parti = await envoyer({
        destinataire: d.courriel,
        destinataireNom: d.prenom_destinataire,
        objet: objet(annonce),
        html: html(annonce, d.prenom_destinataire, adresseSite, aujourdhui),
        texte: texte(annonce, d.prenom_destinataire, adresseSite, aujourdhui),
      });
      if (!parti) {
        echecs.push(d.id_destinataire);
      }
    }
    const envoyes = destinataires.length - echecs.length;

    if (!essai) {
      // Des identifiants, pas des adresses : une adresse rangée dans le journal
      // échapperait à l'anonymisation qui suit la suppression d'un compte.
      const { error: erreurJournal } = await admin.from('journal_admin').insert({
        id_profil: user.id,
        action: 'information_conditions',
        cible: `${destinataires.length} compte(s)`,
        meta: {
          date,
          documents,
          notifies: destinataires.length,
          courriels_envoyes: envoyes,
          courriels_echoues: echecs.length,
          ...(echecs.length > 0 ? { echecs } : {}),
        },
      });
      if (erreurJournal) {
        console.error('[informer-conditions] journal', erreurJournal);
      }
    }

    return json(
      req,
      {
        mode: essai ? 'essai' : 'envoi',
        notifies: destinataires.length,
        courriels_envoyes: envoyes,
        courriels_echoues: echecs.length,
        deja_informes: false,
        // Relevé par `invoquer` quand le statut n'est pas 2xx.
        erreur:
          envoyes === 0
            ? 'Les notifications sont posées, mais Brevo a refusé tous les e-mails. Le journal de la fonction en donne le motif.'
            : undefined,
      },
      envoyes === 0 ? 502 : 200,
    );
  } catch (erreur) {
    console.error('[informer-conditions]', erreur);
    return json(req, { erreur: 'L’annonce n’a pas pu être menée à son terme.' }, 500);
  }
});
