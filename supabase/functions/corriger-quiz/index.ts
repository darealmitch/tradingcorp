// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Correction de quiz — seule voie pour valider une étape. Le client envoie ses
// réponses, jamais les bonnes réponses (reponses.correcte n'est lue qu'ici, en
// service_role). En cas de réussite, la fonction pose elle-même
// progression_lecons.terminee_le : le client n'a plus le privilège colonne
// pour le faire directement (cf. migration pedagogie_quiz), donc valider une
// étape sans réussir son quiz est structurellement impossible.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface CorpsRequete {
  id_quiz?: string;
  /** { [id_question]: id_reponse } pour choix_unique, id_reponse[] pour choix_multiple. */
  reponses?: Record<string, string | string[]>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
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
      return json({ erreur: 'Connexion requise.' }, 401);
    }

    const { id_quiz, reponses } = (await req.json().catch(() => ({}))) as CorpsRequete;
    if (!id_quiz || !reponses) {
      return json({ erreur: 'Requête invalide.' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: quiz } = await admin
      .from('quiz')
      .select('id_quiz, id_lecon, score_requis')
      .eq('id_quiz', id_quiz)
      .maybeSingle();
    if (!quiz) {
      return json({ erreur: 'Quiz introuvable.' }, 404);
    }

    // Défense en profondeur : le quiz d'une étape ne se corrige que si la
    // vidéo de cette étape a été marquée terminée par l'apprenant.
    if (quiz.id_lecon) {
      const { data: progression } = await admin
        .from('progression_lecons')
        .select('video_terminee_le')
        .eq('id_lecon', quiz.id_lecon)
        .eq('id_profil', user.id)
        .maybeSingle();
      if (!progression?.video_terminee_le) {
        return json({ erreur: 'Termine la vidéo avant de passer le quiz.' }, 403);
      }
    }

    const { data: questions } = await admin
      .from('questions')
      .select('id_question, type, reponses(id_reponse, correcte)')
      .eq('id_quiz', id_quiz);
    if (!questions || questions.length === 0) {
      return json({ erreur: 'Ce quiz ne contient aucune question.' }, 422);
    }

    let bonnes = 0;
    for (const question of questions) {
      const correctes = new Set(
        (question.reponses as { id_reponse: string; correcte: boolean }[])
          .filter((r) => r.correcte)
          .map((r) => r.id_reponse),
      );
      const soumis = reponses[question.id_question];
      const donnees = new Set(Array.isArray(soumis) ? soumis : soumis ? [soumis] : []);
      const identiques =
        correctes.size === donnees.size && [...correctes].every((id) => donnees.has(id));
      if (identiques) {
        bonnes += 1;
      }
    }

    const score = Math.round((bonnes / questions.length) * 100);
    const reussi = score >= quiz.score_requis;

    await admin.from('tentatives_quiz').insert({
      id_profil: user.id,
      id_quiz,
      score,
      reussi,
      reponses_donnees: reponses,
    });

    if (reussi && quiz.id_lecon) {
      await admin
        .from('progression_lecons')
        .upsert(
          { id_profil: user.id, id_lecon: quiz.id_lecon, terminee_le: new Date().toISOString() },
          { onConflict: 'id_profil,id_lecon' },
        );
    }

    return json({ reussi, score, score_requis: quiz.score_requis }, 200);
  } catch (erreur) {
    console.error('[corriger-quiz]', erreur);
    return json({ erreur: 'La correction du quiz a échoué.' }, 500);
  }
});
