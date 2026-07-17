import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { QuestionQuiz, ResultatQuiz } from './apprentissage.model';

/**
 * Accès au quiz de fin d'étape. Les bonnes réponses ne sont jamais lues par
 * le client (RPC `reponses_publiques`, sans la colonne `correcte`) ; la
 * correction et la validation de l'étape se font exclusivement dans l'Edge
 * Function `corriger-quiz` (service_role).
 */
@Injectable({ providedIn: 'root' })
export class QuizService {
  private readonly supabase = inject(SUPABASE);

  /** Questions du quiz, avec leurs options (sans la bonne réponse). */
  async chargerQuestions(idQuiz: string): Promise<QuestionQuiz[]> {
    const { data: questions } = await this.supabase
      .from('questions')
      .select('id_question, libelle, position, type')
      .eq('id_quiz', idQuiz)
      .order('position');
    const lignes = (questions as Omit<QuestionQuiz, 'reponses'>[] | null) ?? [];

    const parQuestion = await Promise.all(
      lignes.map((q) => this.supabase.rpc('reponses_publiques', { p_id_question: q.id_question })),
    );

    return lignes.map((q, i) => ({
      ...q,
      reponses: (parQuestion[i].data as QuestionQuiz['reponses'] | null) ?? [],
    }));
  }

  /**
   * Soumet les réponses pour correction. En cas de réussite, l'étape est
   * validée côté serveur et l'étape suivante se déverrouille automatiquement.
   */
  async soumettre(
    idQuiz: string,
    reponses: Record<string, string | string[]>,
  ): Promise<ResultatQuiz | null> {
    const { data, error } = await this.supabase.functions.invoke<ResultatQuiz>('corriger-quiz', {
      body: { id_quiz: idQuiz, reponses },
    });
    return error ? null : (data ?? null);
  }
}
