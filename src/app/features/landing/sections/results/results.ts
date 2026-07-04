import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Reveal } from '../../../../shared/reveal';

/** Une capture de résultats affichée dans le carrousel. */
interface Result {
  img: string;
  alt: string;
}

/** ✏️ Captures du dossier images/resultat — ajoute / retire des entrées ici. */
const RESULTS: Result[] = [
  { img: 'images/resultat/resultat-01.jpg', alt: 'Capture de résultats — portefeuille 1' },
  { img: 'images/resultat/resultat-02.jpg', alt: 'Capture de résultats — portefeuille 2' },
  { img: 'images/resultat/resultat-03.jpg', alt: 'Capture de résultats — portefeuille 3' },
  { img: 'images/resultat/resultat-04.jpg', alt: 'Capture de résultats — portefeuille 4' },
  { img: 'images/resultat/resultat-05.jpg', alt: 'Capture de résultats — portefeuille 5' },
  { img: 'images/resultat/resultat-06.jpg', alt: 'Capture de résultats — portefeuille 6' },
  { img: 'images/resultat/resultat-07.jpg', alt: 'Capture de résultats — portefeuille 7' },
  { img: 'images/resultat/resultat-08.jpg', alt: 'Capture de résultats — portefeuille 8' },
  { img: 'images/resultat/resultat-09.jpg', alt: 'Capture de résultats — portefeuille 9' },
  { img: 'images/resultat/resultat-10.jpg', alt: 'Capture de résultats — portefeuille 10' },
  { img: 'images/resultat/resultat-11.jpg', alt: 'Capture de résultats — portefeuille 11' },
  { img: 'images/resultat/resultat-12.jpg', alt: 'Capture de résultats — portefeuille 12' },
  { img: 'images/resultat/resultat-13.jpg', alt: 'Capture de résultats — portefeuille 13' },
  { img: 'images/resultat/resultat-14.jpg', alt: 'Capture de résultats — portefeuille 14' },
  { img: 'images/resultat/resultat-15.jpg', alt: 'Capture de résultats — portefeuille 15' },
  { img: 'images/resultat/resultat-16.jpg', alt: 'Capture de résultats — portefeuille 16' },
  { img: 'images/resultat/resultat-17.jpg', alt: 'Capture de résultats — portefeuille 17' },
  { img: 'images/resultat/resultat-18.jpg', alt: 'Capture de résultats — portefeuille 18' },
  { img: 'images/resultat/resultat-19.jpg', alt: 'Capture de résultats — portefeuille 19' },
  { img: 'images/resultat/resultat-20.jpg', alt: 'Capture de résultats — portefeuille 20' },
  { img: 'images/resultat/resultat-21.jpg', alt: 'Capture de résultats — portefeuille 21' },
  { img: 'images/resultat/resultat-22.jpg', alt: 'Capture de résultats — portefeuille 22' },
  { img: 'images/resultat/resultat-23.jpg', alt: 'Capture de résultats — portefeuille 23' },
  { img: 'images/resultat/resultat-24.jpg', alt: 'Capture de résultats — portefeuille 24' },
  { img: 'images/resultat/resultat-25.jpg', alt: 'Capture de résultats — portefeuille 25' },
  { img: 'images/resultat/resultat-26.jpg', alt: 'Capture de résultats — portefeuille 26' },
  { img: 'images/resultat/resultat-27.jpg', alt: 'Capture de résultats — portefeuille 27' },
  { img: 'images/resultat/resultat-28.jpg', alt: 'Capture de résultats — portefeuille 28' },
  { img: 'images/resultat/resultat-29.jpg', alt: 'Capture de résultats — portefeuille 29' },
  { img: 'images/resultat/resultat-30.jpg', alt: 'Capture de résultats — portefeuille 30' },
  { img: 'images/resultat/resultat-31.jpg', alt: 'Capture de résultats — portefeuille 31' },
  { img: 'images/resultat/resultat-32.jpg', alt: 'Capture de résultats — portefeuille 32' },
  { img: 'images/resultat/resultat-33.jpg', alt: 'Capture de résultats — portefeuille 33' },
  { img: 'images/resultat/resultat-34.jpg', alt: 'Capture de résultats — portefeuille 34' },
  { img: 'images/resultat/resultat-35.jpg', alt: 'Capture de résultats — portefeuille 35' },
  { img: 'images/resultat/resultat-36.jpg', alt: 'Capture de résultats — portefeuille 36' },
  { img: 'images/resultat/resultat-37.jpg', alt: 'Capture de résultats — portefeuille 37' },
  { img: 'images/resultat/resultat-38.jpg', alt: 'Capture de résultats — portefeuille 38' },
  { img: 'images/resultat/resultat-39.jpg', alt: 'Capture de résultats — portefeuille 39' },
  { img: 'images/resultat/resultat-40.jpg', alt: 'Capture de résultats — portefeuille 40' },
  { img: 'images/resultat/resultat-41.jpg', alt: 'Capture de résultats — portefeuille 41' },
  { img: 'images/resultat/resultat-42.jpg', alt: 'Capture de résultats — portefeuille 42' },
  { img: 'images/resultat/resultat-43.jpg', alt: 'Capture de résultats — portefeuille 43' },
  { img: 'images/resultat/resultat-44.jpg', alt: 'Capture de résultats — portefeuille 44' },
  { img: 'images/resultat/resultat-45.jpg', alt: 'Capture de résultats — portefeuille 45' },
  { img: 'images/resultat/resultat-46.jpg', alt: 'Capture de résultats — portefeuille 46' },
  { img: 'images/resultat/resultat-47.jpg', alt: 'Capture de résultats — portefeuille 47' },
  { img: 'images/resultat/resultat-48.jpg', alt: 'Capture de résultats — portefeuille 48' },
];

/** Constats d'accroche affichés au-dessus du carrousel. */
const CONSTATS = [
  'Ton pouvoir d’achat fond comme neige au soleil.',
  "Il y a de très grandes chances que tu n’aies jamais de retraite.",
  'Ta vie ne dépend que d’un salaire.',
];

@Component({
  selector: 'app-results',
  templateUrl: './results.html',
  styleUrl: './results.css',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Results {
  private readonly destroyRef = inject(DestroyRef);

  protected readonly results = RESULTS;
  protected readonly constats = CONSTATS;
  protected readonly total = RESULTS.length;

  /** Index de la capture affichée en grand (null = lightbox fermée). */
  protected readonly activeIndex = signal<number | null>(null);

  /** Capture courante, dérivée de l'index — la lightbox reste ouverte au changement. */
  protected readonly active = computed<Result | null>(() => {
    const i = this.activeIndex();
    return i === null ? null : this.results[i];
  });

  /** Élément déclencheur, re-focalisé à la fermeture. */
  private lastTrigger: HTMLElement | null = null;

  constructor() {
    this.destroyRef.onDestroy(() => (document.body.style.overflow = ''));
  }

  /** Ouvre la capture en grand et fige le défilement de la page. */
  protected open(index: number, event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.activeIndex.set(index);
    document.body.style.overflow = 'hidden';
  }

  /** Capture suivante, en boucle. */
  protected next(): void {
    const i = this.activeIndex();
    if (i !== null) {
      this.activeIndex.set((i + 1) % this.total);
    }
  }

  /** Capture précédente, en boucle. */
  protected prev(): void {
    const i = this.activeIndex();
    if (i !== null) {
      this.activeIndex.set((i - 1 + this.total) % this.total);
    }
  }

  /** Ferme la lightbox, restaure le défilement et rend le focus. */
  protected close(): void {
    if (this.activeIndex() === null) {
      return;
    }
    this.activeIndex.set(null);
    document.body.style.overflow = '';
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }
}
