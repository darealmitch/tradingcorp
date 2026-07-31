import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  DetailQuestionQuiz,
  QuestionQuiz,
  ResultatQuiz,
} from '../../../core/contenu/apprentissage.model';
import { QuizService } from '../../../core/contenu/quiz.service';
import { Icone } from '../../../shared/ui/icone';

/** Réponses en cours de saisie : id_question -> id_reponse (unique) ou id_reponse[] (multiple). */
type ReponsesSaisies = Record<string, string | string[]>;

/**
 * Passation d'un quiz de chapitre : saisie, envoi, puis correction détaillée.
 *
 * Extrait de `LeconPlayer`, qui portait aussi la lecture vidéo, la progression
 * et la navigation. Le quiz a son propre état (réponses saisies, résultat,
 * envoi en cours) qui ne concerne personne d'autre : l'isoler retire cinq
 * signaux et huit méthodes du lecteur, et rend chacun des deux testable seul.
 *
 * Contrat volontairement étroit : le composant reçoit l'identifiant du quiz et
 * signale sa réussite. Il ne sait rien de la leçon, du parcours ni du
 * déverrouillage de l'étape suivante — c'est au parent d'en décider.
 */
@Component({
  selector: 'app-quiz-lecon',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './quiz-lecon.html',
  styleUrl: './quiz-lecon.css',
})
export class QuizLecon {
  private readonly quizService = inject(QuizService);

  readonly idQuiz = input.required<string>();
  /** Le chapitre est déjà validé : on affiche l'acquis, pas le questionnaire. */
  readonly dejaValide = input(false);

  /** Quiz réussi — au parent de rafraîchir la leçon et d'ouvrir la suite. */
  readonly reussi = output<void>();

  protected readonly questions = signal<QuestionQuiz[]>([]);
  protected readonly chargement = signal(false);
  protected readonly reponses = signal<ReponsesSaisies>({});
  protected readonly envoi = signal(false);
  protected readonly resultat = signal<ResultatQuiz | null>(null);
  /** Échec de la correction — distinct d'un quiz raté, qui est un résultat. */
  protected readonly erreur = signal<string | null>(null);

  /** Correction indexée par question, pour le retour pédagogique après envoi. */
  private readonly detailParQuestion = computed(() => {
    const detail = this.resultat()?.detail ?? [];
    return new Map<string, DetailQuestionQuiz>(detail.map((d) => [d.id_question, d]));
  });

  constructor() {
    // Le composant est réutilisé d'un chapitre à l'autre : tout état de la
    // passation précédente doit disparaître avec l'identifiant qui l'a produit.
    effect(() => {
      const id = this.idQuiz();
      this.reponses.set({});
      this.resultat.set(null);
      void this.charger(id);
    });
  }

  private async charger(idQuiz: string): Promise<void> {
    this.chargement.set(true);
    this.questions.set(await this.quizService.chargerQuestions(idQuiz));
    this.chargement.set(false);
  }

  // ===== Saisie =====

  protected repondreUnique(idQuestion: string, idReponse: string): void {
    this.reponses.update((r) => ({ ...r, [idQuestion]: idReponse }));
  }

  protected estCochee(idQuestion: string, idReponse: string): boolean {
    const valeur = this.reponses()[idQuestion];
    return Array.isArray(valeur) ? valeur.includes(idReponse) : valeur === idReponse;
  }

  protected basculerMultiple(idQuestion: string, idReponse: string): void {
    this.reponses.update((r) => {
      const actuel = r[idQuestion];
      const liste = Array.isArray(actuel) ? actuel : [];
      const suivante = liste.includes(idReponse)
        ? liste.filter((id) => id !== idReponse)
        : [...liste, idReponse];
      return { ...r, [idQuestion]: suivante };
    });
  }

  protected toutesRepondues(): boolean {
    const r = this.reponses();
    return this.questions().every((q) => {
      const v = r[q.id_question];
      return Array.isArray(v) ? v.length > 0 : !!v;
    });
  }

  // ===== Envoi et correction =====

  /**
   * La correction est faite par le serveur (`corriger-quiz`) : les bonnes
   * réponses ne sont révélées qu'avec le résultat, jamais avant.
   */
  protected async soumettre(): Promise<void> {
    if (!this.toutesRepondues() || this.envoi()) {
      return;
    }
    this.envoi.set(true);
    this.erreur.set(null);
    const { resultat, erreur } = await this.quizService.soumettre(this.idQuiz(), this.reponses());
    this.envoi.set(false);

    // Une correction qui n'aboutit pas laissait l'écran identique à lui-même :
    // l'apprenant ne savait pas si ses réponses étaient parties, et les
    // renvoyait. Les réponses saisies sont conservées pour qu'il puisse
    // simplement réessayer.
    if (erreur) {
      this.erreur.set(erreur);
      return;
    }
    this.resultat.set(resultat ?? null);
    if (resultat?.reussi) {
      this.reussi.emit();
    }
  }

  protected reessayer(): void {
    this.resultat.set(null);
    this.erreur.set(null);
    this.reponses.set({});
  }

  /** Correction d'une question (absente tant que le quiz n'a pas été soumis). */
  protected detailQuestion(idQuestion: string): DetailQuestionQuiz | undefined {
    return this.detailParQuestion().get(idQuestion);
  }

  /** Une option fait-elle partie des bonnes réponses (révélées après correction) ? */
  protected estBonneReponse(idQuestion: string, idReponse: string): boolean {
    return this.detailQuestion(idQuestion)?.bonnes_reponses.includes(idReponse) ?? false;
  }

  /** L'apprenant avait-il coché cette option ? */
  protected aEteCochee(idQuestion: string, idReponse: string): boolean {
    return this.detailQuestion(idQuestion)?.reponses_donnees.includes(idReponse) ?? false;
  }
}
