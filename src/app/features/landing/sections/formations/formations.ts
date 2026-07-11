import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Cases } from './cases';

const IMPACT_TARGETS = [90, 161_115_493, 150];

@Component({
  selector: 'app-formations',
  templateUrl: './formations.html',
  styleUrl: './formations.css',
  imports: [Reveal, Cases],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Formations {
  private readonly figures = viewChildren<ElementRef<HTMLElement>>('impactFigure');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);

  protected readonly values = signal(IMPACT_TARGETS.map(() => '0'));

  constructor() {
    afterNextRender(() => this.armCounters());
  }

  private armCounters(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.values.set(IMPACT_TARGETS.map((target) => target.toLocaleString('fr-FR')));
      return;
    }

    this.figures().forEach((ref, index) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            this.runCounter(index);
          }
        },
        { threshold: 0.35 },
      );
      observer.observe(ref.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private runCounter(index: number): void {
    const target = IMPACT_TARGETS[index];
    const duration = 2200;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      const current = Math.round(target * eased).toLocaleString('fr-FR');
      this.values.update((values) => values.map((v, i) => (i === index ? current : v)));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(raf));
  }
}
