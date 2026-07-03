import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Reveal } from '../../../../shared/reveal';

interface Stat {
  target: number;
  decimals: number;
  suffix: string;
  label: string;
}

@Component({
  selector: 'app-markets',
  templateUrl: './markets.html',
  styleUrl: './markets.css',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Markets {
  private readonly statsRow = viewChild.required<ElementRef<HTMLElement>>('statsRow');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly stats: Stat[] = [
    { target: 120, decimals: 0, suffix: '+', label: 'marchés couverts' },
    { target: 12, decimals: 0, suffix: ' ms', label: 'de latence moyenne' },
    { target: 99.99, decimals: 2, suffix: ' %', label: 'de disponibilité' },
    { target: 150, decimals: 0, suffix: 'k+', label: 'traders actifs' },
  ];

  protected readonly values = signal(this.stats.map(() => '0'));

  constructor() {
    afterNextRender(() => this.armCounters());
  }

  private armCounters(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.values.set(this.stats.map((s) => this.format(s.target, s.decimals)));
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect();
          this.runCounters();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(this.statsRow().nativeElement);
    this.destroyRef.onDestroy(() => observer.disconnect());
  }

  private runCounters(): void {
    const duration = 1400;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      this.values.set(this.stats.map((s) => this.format(s.target * eased, s.decimals)));
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
}
