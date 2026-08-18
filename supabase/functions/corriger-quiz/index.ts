// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { echecsConsecutifs, messageAttente, secondesAAttendre } from './attente.ts';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Correction de quiz — seule voie pour valider une étape. Le client envoie ses
// réponses, jamais les bonnes réponses (reponses.correcte n'est lue qu'ici, en
// service_role). En cas de réussite, la fonction pose elle-même
// progression_lecons.terminee_le : le client n'a plus le privilège colonne
// pour le faire directement (cf. migration pedagogie_quiz), donc valider une
// étape sans réussir son quiz est structurellement impossible.
//
// Deux règles empêchent le quiz de n'être qu'une formalité :
//
//   • les bonnes réponses ne sont renvoyées QU'EN CAS DE RÉUSSITE. Elles
//     l'étaient à chaque correction — il suffisait donc de soumettre n'importe
//     quoi, de lire la réponse et de resoumettre. L'explication d'échec, elle,
//     est toujours renvoyée : c'est elle qui fait apprendre, pas la solution ;
//   • une tentative qui échoue impose un délai avant la suivante, croissant
//     avec le nombre d'échecs enchaînés. Personne n'est bloqué définitivement,
//     mais réviser redevient plus rapide que deviner.
//
// Staff et comptes de démonstration sont exemptés du délai : la recette d'un
// quiz suppose de le rejouer.

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

interface CorpsRequete {
  id_quiz?: string;
  /** { [id_question]: id_reponse } pour choix_unique, id_reponse[] pour choix_multiple. */
  reponses?: Record<string, string | string[]>;
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

    const { id_quiz, reponses } = (await req.json().catch(() => ({}))) as CorpsRequete;
    if (!id_quiz || !reponses) {
      return json(req, { erreur: 'Requête invalide.' }, 400);
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
      return json(req, { erreur: 'Quiz introuvable.' }, 404);
    }

    // Défense en profondeur : un quiz est un CHAPITRE à part entière — il ne
    // se corrige que si ce chapitre est déverrouillé pour l'apprenant
    // (déblocage séquentiel serveur ; démo et staff toujours autorisés).
    // Appel en contexte utilisateur : lecon_debloquee lit auth.uid().
    if (quiz.id_lecon) {
      const { data: debloquee } = await porteur.rpc('lecon_debloquee', {
        p_id_lecon: quiz.id_lecon,
      });
      if (!debloquee) {
        return json(
          req,
          { erreur: 'Termine les chapitres précédents avant de passer ce quiz.' },
          403,
        );
      }
    }

    // Exemptés du délai : le staff et les comptes de démonstration, qui
    // rejouent les quiz pour les vérifier, pas pour les réussir.
    const { data: profil } = await admin
      .from('profils')
      .select('role, est_test')
      .eq('id_profil', user.id)
      .maybeSingle();
    const exempte =
      profil?.est_test === true || profil?.role === 'formateur' || profil?.role === 'admin';

    if (!exempte) {
      // Les dernières tentatives suffisent : au-delà, on est de toute façon au
      // palier maximal.
      const { data: precedentes } = await admin
        .from('tentatives_quiz')
        .select('reussi, date_passage')
        .eq('id_profil', user.id)
        .eq('id_quiz', id_quiz)
        .order('date_passage', { ascending: false })
        .limit(10);

      const historique = (precedentes ?? []) as { reussi: boolean; date_passage: string }[];
      const attente = secondesAAttendre(
        echecsConsecutifs(historique),
        historique[0]?.date_passage ?? null,
        Date.now(),
      );
      if (attente > 0) {
        return json(req, { erreur: messageAttente(attente), secondes_restantes: attente }, 429);
      }
    }

    const { data: questions } = await admin
      .from('questions')
      .select(
        'id_question, type, explication_reussite, explication_echec, reponses(id_reponse, correcte)',
      )
      .eq('id_quiz', id_quiz);
    if (!questions || questions.length === 0) {
      return json(req, { erreur: 'Ce quiz ne contient aucune question.' }, 422);
    }

    // Détail pédagogique par question : le verdict, la saisie de l'apprenant et
    // l'explication adaptée. `bonnes_reponses` n'est joint qu'en cas de
    // réussite — un échec dit ce qui est faux et pourquoi, jamais la solution.
    interface DetailQuestion {
      id_question: string;
      correcte: boolean;
      bonnes_reponses?: string[];
      reponses_donnees: string[];
      explication: string | null;
    }

    let bonnes = 0;
    /** Correction complète — filtrée avant l'envoi selon l'issue du quiz. */
    const correction: (DetailQuestion & { bonnes_reponses: string[] })[] = [];
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
      correction.push({
        id_question: question.id_question,
        correcte: identiques,
        bonnes_reponses: [...correctes],
        reponses_donnees: [...donnees],
        explication: identiques
          ? (question.explication_reussite ?? null)
          : (question.explication_echec ?? null),
      });
    }

    const score = Math.round((bonnes / questions.length) * 100);
    const reussi = score >= quiz.score_requis;

    // Le filtrage se fait ici, une fois le verdict connu, et non pendant la
    // boucle : c'est le score global qui décide, pas la justesse d'une
    // question isolée. Retirer la clé — plutôt que la vider — évite qu'un
    // tableau vide passe pour « aucune bonne réponse ».
    const detail: DetailQuestion[] = reussi
      ? correction
      : correction.map((d) => ({
          // Énuméré plutôt que soustrait : ce qui part vers le client se lit
          // ici en entier, et un champ ajouté demain ne fuitera pas par défaut.
          id_question: d.id_question,
          correcte: d.correcte,
          reponses_donnees: d.reponses_donnees,
          explication: d.explication,
        }));

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

    return json(req, { reussi, score, score_requis: quiz.score_requis, detail }, 200);
  } catch (erreur) {
    console.error('[corriger-quiz]', erreur);
    return json(req, { erreur: 'La correction du quiz a échoué.' }, 500);
  }
});
