import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/** Un chiffre-clé animé du parcours. */
interface Stat {
  target: number;
  decimals: number;
  suffix: string;
  label: string;
}

/** Une étape du parcours. */
interface Milestone {
  step: string;
  title: string;
  desc: string;
}

/**
 * Années de début du parcours — les durées affichées se recalculent chaque
 * année automatiquement. (Calé sur le récit de 2024 : « investisseur depuis
 * 6 ans, trader depuis 5 ans ». ✏️ Ajuste ces années si besoin.)
 */
const INVESTISSEMENT_DEBUT = 2018;
const TRADING_DEBUT = 2019;

/** Nombre d'années révolues depuis une année de début. */
function anneesDepuis(debut: number): number {
  return Math.max(0, new Date().getFullYear() - debut);
}

const STATS: Stat[] = [
  {
    target: anneesDepuis(INVESTISSEMENT_DEBUT),
    decimals: 0,
    suffix: ' ans',
    label: "d'investissement",
  },
  { target: anneesDepuis(TRADING_DEBUT), decimals: 0, suffix: ' ans', label: 'de trading' },
  { target: 1_000_000, decimals: 0, suffix: ' €+', label: 'générés en fonds propres' },
  { target: 200, decimals: 0, suffix: '+', label: 'élèves formés' },
];

const MILESTONES: Milestone[] = [
  {
    step: '18 ans',
    title: 'Le bac en candidat libre',
    desc: "L'école n'était pas faite pour moi. Je décroche mon bac seul, à ma façon.",
  },
  {
    step: 'Le déclic',
    title: 'Une année chez McDonald’s',
    desc: 'Derrière le comptoir, je place mes premières économies — modestement, mais je commence.',
  },
  {
    step: 'Entrepreneuriat',
    title: 'Mandataire immobilier',
    desc: 'Chez Keller Williams. Chaque commission gagnée est réinvestie sur les marchés.',
  },
  {
    step: 'Les marchés',
    title: 'Plus de 1 000 000 €',
    desc: 'Générés en fonds propres sur les marchés financiers, à force de méthode et de discipline.',
  },
  {
    step: 'Transmission',
    title: 'Formateur & cofondateur',
    desc: '200+ élèves accompagnés, et trois projets cofondés : Million Quest, IMEO et Trading Corp.',
  },
];

/** Retours clients filmés après un entretien téléphonique avec Keryan. */
const TESTIMONIALS = [
  { pid: 'keryan-01_okdcno', alt: 'Retour client après entretien — 1' },
  { pid: 'keryan-02_nkju0c', alt: 'Retour client après entretien — 2' },
  { pid: 'keryan-03_sbfiwm', alt: 'Retour client après entretien — 3' },
];

@Component({
  selector: 'app-trainer',
  templateUrl: './trainer.html',
  styleUrl: './trainer.css',
  imports: [Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trainer {
  private readonly portrait = viewChild.required<ElementRef<HTMLElement>>('portrait');
  private readonly statEls = viewChildren<ElementRef<HTMLElement>>('statValue');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);
  protected readonly stats = STATS;
  protected readonly milestones = MILESTONES;
  // URLs Cloudinary résolues une fois via MediaService (source unique).
  protected readonly testimonials = TESTIMONIALS.map((t) => ({
    ...t,
    url: this.media.videoUrl(t.pid),
  }));

  /** Valeurs affichées des compteurs (formatées). */
  protected readonly values = signal(STATS.map(() => '0'));

  /** Source de la vidéo ouverte en grand (null = lightbox fermée). */
  protected readonly activeVideo = signal<string | null>(null);

  /** Élément déclencheur, re-focalisé à la fermeture. */
  private lastTrigger: HTMLElement | null = null;

  constructor() {
    afterNextRender(() => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.initCounters(reduced);
      if (!reduced) {
        this.initParallax();
      }
    });
    this.destroyRef.onDestroy(() => (document.body.style.overflow = ''));
  }

  /** Ouvre une vidéo en grand (présentation ou témoignage) et fige le défilement. */
  protected openVideo(src: string, event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.activeVideo.set(src);
    document.body.style.overflow = 'hidden';
  }

  /** Ferme la vidéo (l'élément est détruit → lecture arrêtée) et restaure le focus. */
  protected closeVideo(): void {
    if (!this.activeVideo()) {
      return;
    }
    this.activeVideo.set(null);
    document.body.style.overflow = '';
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }

  protected readonly presentationVideoUrl = environment.bunnyPresentationVideoUrl;

  /** Compteurs animés au premier passage dans le viewport. */
  private initCounters(reduced: boolean): void {
    if (reduced) {
      this.values.set(STATS.map((s) => this.format(s.target, s.decimals)));
      return;
    }

    this.statEls().forEach((ref, index) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            this.runCounter(index);
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(ref.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private runCounter(index: number): void {
    const stat = STATS[index];
    const duration = 1600;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = this.format(stat.target * eased, stat.decimals);
      this.values.update((values) => values.map((v, i) => (i === index ? current : v)));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(raf));
  }

  private format(value: number, decimals: number): string {
    return value.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /** Parallaxe douce du portrait selon la position de défilement. */
  private initParallax(): void {
    const portrait = this.portrait().nativeElement;
    let ticking = false;

    const apply = (): void => {
      ticking = false;
      const rect = portrait.getBoundingClientRect();
      // Décalage relatif au centre du viewport : négatif au-dessus, positif en dessous.
      const delta = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
      portrait.style.transform = `translateY(${delta * -26}px)`;
    };

    const onScroll = (): void => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    });
  }
}
