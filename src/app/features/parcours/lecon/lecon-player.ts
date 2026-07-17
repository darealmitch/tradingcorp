import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  LeconEtape,
  LeconJouable,
  QuestionQuiz,
  ResultatQuiz,
} from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { QuizService } from '../../../core/contenu/quiz.service';
import { MediaService } from '../../../core/media/media.service';
import { Icone } from '../../../shared/ui/icone';

/** Réponses en cours de saisie : id_question -> id_reponse (unique) ou id_reponse[] (multiple). */
type ReponsesSaisies = Record<string, string | string[]>;

@Component({
  selector: 'app-lecon-player',
  templateUrl: './lecon-player.html',
  styleUrl: './lecon-player.css',
  imports: [RouterLink, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeconPlayer {
  private readonly contenu = inject(ContenuService);
  private readonly quizService = inject(QuizService);
  protected readonly media = inject(MediaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly lecteur = viewChild<ElementRef<HTMLVideoElement>>('lecteur');

  protected readonly chargement = signal(true);
  protected readonly lecon = signal<LeconJouable | null>(null);
  protected readonly etapes = signal<LeconEtape[]>([]);
  protected readonly avertissement = signal<string | null>(null);

  protected readonly questions = signal<QuestionQuiz[]>([]);
  protected readonly chargementQuiz = signal(false);
  protected readonly reponses = signal<ReponsesSaisies>({});
  protected readonly envoiQuiz = signal(false);
  protected readonly resultatQuiz = signal<ResultatQuiz | null>(null);

  protected idSection = '';

  private readonly typesLabel: Record<LeconJouable['type'], string> = {
    article: 'Article',
    video: 'Vidéo',
    quiz: 'Quiz',
  };

  constructor() {
    void this.charger();
  }

  protected typeLabel(l: LeconJouable): string {
    return this.typesLabel[l.type];
  }

  private async charger(): Promise<void> {
    const idSection = this.route.snapshot.paramMap.get('id');
    const idLecon = this.route.snapshot.paramMap.get('idLecon');
    if (!idSection || !idLecon) {
      this.chargement.set(false);
      return;
    }
    this.idSection = idSection;

    const [lecon, etapes] = await Promise.all([
      this.contenu.chargerLeconJouable(idLecon),
      this.contenu.etatsLecons(idSection),
    ]);
    this.lecon.set(lecon);
    this.etapes.set(etapes);
    this.chargement.set(false);

    if (lecon?.id_quiz) {
      await this.chargerQuiz(lecon.id_quiz);
    }
  }

  private async chargerQuiz(idQuiz: string): Promise<void> {
    this.chargementQuiz.set(true);
    this.questions.set(await this.quizService.chargerQuestions(idQuiz));
    this.chargementQuiz.set(false);
  }

  /**
   * URL de lecture, hébergeur agnostique : une URL externe (Bunny/MP4/HLS
   * direct) est prioritaire ; à défaut on retombe sur Cloudinary. Aucune
   * dépendance à un hébergeur particulier.
   */
  protected videoUrl(l: LeconJouable): string | null {
    if (l.video_url) {
      return l.video_url;
    }
    if (l.video_provider === 'cloudinary' && l.video_provider_id) {
      return this.media.videoUrl(l.video_provider_id);
    }
    return null;
  }

  protected videoNonSupportee(l: LeconJouable): boolean {
    return !this.videoUrl(l) && !!l.video_provider_id;
  }

  protected pdfUrl(l: LeconJouable): string | null {
    return l.pdf_public_id ? this.media.pdfUrl(l.pdf_public_id) : null;
  }

  /** Paragraphes d'un chapitre article (séparés par une ligne vide). */
  protected paragraphes(l: LeconJouable): string[] {
    return (l.contenu ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /** Recharge le chapitre courant + la timeline (après une validation). */
  private async rafraichir(idLecon: string): Promise<void> {
    const [maj, etapes] = await Promise.all([
      this.contenu.chargerLeconJouable(idLecon),
      this.contenu.etatsLecons(this.idSection),
    ]);
    this.lecon.set(maj);
    this.etapes.set(etapes);
    if (maj?.id_quiz) {
      await this.chargerQuiz(maj.id_quiz);
    }
  }

  /** Valide un chapitre article (« marquer comme lu »). */
  protected async terminerArticle(): Promise<void> {
    const l = this.lecon();
    if (!l || l.terminee_le) {
      return;
    }
    await this.contenu.terminerLecon(l.id_lecon);
    await this.rafraichir(l.id_lecon);
  }

  /** Reprise : position enregistrée au chargement du lecteur natif. */
  protected reprendre(l: LeconJouable): void {
    const el = this.lecteur()?.nativeElement;
    if (el && l.position_video_s > 0) {
      el.currentTime = l.position_video_s;
    }
  }

  protected sauverPosition(): void {
    const el = this.lecteur()?.nativeElement;
    const l = this.lecon();
    if (el && l) {
      void this.contenu.enregistrerPosition(l.id_lecon, el.currentTime);
    }
  }

  /**
   * Fin d'un chapitre vidéo (fin native ou bouton de secours) : révèle le PDF
   * et valide le chapitre — un chapitre vidéo n'a pas de quiz, le quiz est un
   * chapitre distinct.
   */
  protected async videoTerminee(): Promise<void> {
    const l = this.lecon();
    if (!l || l.terminee_le) {
      return;
    }
    await this.contenu.marquerVideoTerminee(l.id_lecon);
    await this.contenu.terminerLecon(l.id_lecon);
    await this.rafraichir(l.id_lecon);
  }

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

  protected async soumettreQuiz(): Promise<void> {
    const l = this.lecon();
    if (!l?.id_quiz || !this.toutesRepondues()) {
      return;
    }
    this.envoiQuiz.set(true);
    const resultat = await this.quizService.soumettre(l.id_quiz, this.reponses());
    this.resultatQuiz.set(resultat);
    this.envoiQuiz.set(false);

    if (resultat?.reussi) {
      await this.rafraichir(l.id_lecon);
    }
  }

  protected reessayerQuiz(): void {
    this.resultatQuiz.set(null);
    this.reponses.set({});
  }

  protected etapeSuivante(): LeconEtape | null {
    const l = this.lecon();
    if (!l) {
      return null;
    }
    const liste = this.etapes();
    const i = liste.findIndex((e) => e.id_lecon === l.id_lecon);
    return i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
  }

  protected async allerSuivante(): Promise<void> {
    const suivante = this.etapeSuivante();
    if (suivante) {
      await this.router.navigate(['/espace/parcours', this.idSection, 'lecon', suivante.id_lecon]);
      await this.charger();
    }
  }

  /** Navigation directe sur une étape de la timeline — jamais une verrouillée. */
  protected async ouvrirEtape(e: LeconEtape): Promise<void> {
    if (e.etat === 'verrouille') {
      this.avertissement.set('Termine les étapes précédentes pour y accéder.');
      setTimeout(() => this.avertissement.set(null), 2500);
      return;
    }
    await this.router.navigate(['/espace/parcours', this.idSection, 'lecon', e.id_lecon]);
    await this.charger();
  }
}
