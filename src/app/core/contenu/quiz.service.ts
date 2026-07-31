import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { QuestionQuiz, ResultatQuiz } from './apprentissage.model';

/**
 * Accès au quiz de fin d'étape. Les bonnes réponses ne sont jamais lues par
 * le client (RPC `reponses_publiques`, sans la colonne `correcte`) ; la
 * correction et la validation de l'étape se font exclusivement dans l'Edge
 * Function `corriger-quiz` (service_role).
 */
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly acces = inject(AccesDonnees);

  /** Questions du quiz, avec leurs options (sans la bonne réponse). */
  async chargerQuestions(idQuiz: string): Promise<QuestionQuiz[]> {
    const lignes = await this.acces.lire<Omit<QuestionQuiz, 'reponses'>[]>(
      'lecture des questions du quiz',
      this.acces
        .table('questions')
        .select('id_question, libelle, position, type')
        .eq('id_quiz', idQuiz)
        .order('position'),
      [],
    );

    const parQuestion = await Promise.all(
      lignes.map((q) =>
        this.acces.lire<QuestionQuiz['reponses']>(
          'lecture des options de réponse',
          this.acces.appel('reponses_publiques', { p_id_question: q.id_question }),
          [],
        ),
      ),
    );

    return lignes.map((q, i) => ({ ...q, reponses: parQuestion[i] }));
  }

  /**
   * Soumet les réponses pour correction. En cas de réussite, l'étape est
   * validée côté serveur et l'étape suivante se déverrouille automatiquement.
   *
   * Rend le résultat, ou le message d'erreur à afficher : un quiz dont la
   * correction échouait laissait l'écran dans son état de saisie sans rien
   * dire — l'apprenant ne savait pas s'il avait réussi.
   */
  async soumettre(
    idQuiz: string,
    reponses: Record<string, string | string[]>,
  ): Promise<{ resultat?: ResultatQuiz; erreur?: string }> {
    const { donnees, erreur } = await this.acces.invoquer<ResultatQuiz>(
      'correction du quiz',
      'corriger-quiz',
      { id_quiz: idQuiz, reponses },
      'La correction n’a pas abouti. Réessaie.',
    );
    if (erreur) {
      return { erreur };
    }
    return donnees ? { resultat: donnees } : { erreur: 'La correction n’a pas abouti. Réessaie.' };
  }
}
