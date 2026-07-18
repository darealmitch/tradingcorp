import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/** Une capture de résultats affichée dans le carrousel. */
interface Result {
  img: string;
  alt: string;
}

/** ✏️ Captures de résultats (Cloudinary : tradingcorp/landing/resultats). */
const RESULTS: Result[] = [
  {
    img: 'tradingcorp/landing/resultats/resultat-01',
    alt: 'Capture de résultats — portefeuille 1',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-02',
    alt: 'Capture de résultats — portefeuille 2',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-03',
    alt: 'Capture de résultats — portefeuille 3',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-04',
    alt: 'Capture de résultats — portefeuille 4',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-05',
    alt: 'Capture de résultats — portefeuille 5',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-06',
    alt: 'Capture de résultats — portefeuille 6',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-07',
    alt: 'Capture de résultats — portefeuille 7',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-08',
    alt: 'Capture de résultats — portefeuille 8',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-09',
    alt: 'Capture de résultats — portefeuille 9',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-10',
    alt: 'Capture de résultats — portefeuille 10',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-11',
    alt: 'Capture de résultats — portefeuille 11',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-12',
    alt: 'Capture de résultats — portefeuille 12',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-13',
    alt: 'Capture de résultats — portefeuille 13',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-14',
    alt: 'Capture de résultats — portefeuille 14',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-15',
    alt: 'Capture de résultats — portefeuille 15',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-16',
    alt: 'Capture de résultats — portefeuille 16',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-17',
    alt: 'Capture de résultats — portefeuille 17',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-18',
    alt: 'Capture de résultats — portefeuille 18',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-19',
    alt: 'Capture de résultats — portefeuille 19',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-20',
    alt: 'Capture de résultats — portefeuille 20',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-21',
    alt: 'Capture de résultats — portefeuille 21',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-22',
    alt: 'Capture de résultats — portefeuille 22',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-23',
    alt: 'Capture de résultats — portefeuille 23',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-24',
    alt: 'Capture de résultats — portefeuille 24',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-25',
    alt: 'Capture de résultats — portefeuille 25',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-26',
    alt: 'Capture de résultats — portefeuille 26',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-27',
    alt: 'Capture de résultats — portefeuille 27',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-28',
    alt: 'Capture de résultats — portefeuille 28',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-29',
    alt: 'Capture de résultats — portefeuille 29',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-30',
    alt: 'Capture de résultats — portefeuille 30',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-31',
    alt: 'Capture de résultats — portefeuille 31',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-32',
    alt: 'Capture de résultats — portefeuille 32',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-33',
    alt: 'Capture de résultats — portefeuille 33',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-34',
    alt: 'Capture de résultats — portefeuille 34',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-35',
    alt: 'Capture de résultats — portefeuille 35',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-36',
    alt: 'Capture de résultats — portefeuille 36',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-37',
    alt: 'Capture de résultats — portefeuille 37',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-38',
    alt: 'Capture de résultats — portefeuille 38',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-39',
    alt: 'Capture de résultats — portefeuille 39',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-40',
    alt: 'Capture de résultats — portefeuille 40',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-41',
    alt: 'Capture de résultats — portefeuille 41',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-42',
    alt: 'Capture de résultats — portefeuille 42',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-43',
    alt: 'Capture de résultats — portefeuille 43',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-44',
    alt: 'Capture de résultats — portefeuille 44',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-45',
    alt: 'Capture de résultats — portefeuille 45',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-46',
    alt: 'Capture de résultats — portefeuille 46',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-47',
    alt: 'Capture de résultats — portefeuille 47',
  },
  {
    img: 'tradingcorp/landing/resultats/resultat-48',
    alt: 'Capture de résultats — portefeuille 48',
  },
];

/** Constats d'accroche affichés au-dessus du carrousel. */
const CONSTATS = [
  'Ton pouvoir d’achat fond comme neige au soleil.',
  'Il y a de très grandes chances que tu n’aies jamais de retraite.',
  'Ta vie ne dépend que d’un salaire.',
];

@Component({
  selector: 'app-results',
  templateUrl: './results.html',
  styleUrl: './results.css',
  imports: [Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Results {
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);
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
