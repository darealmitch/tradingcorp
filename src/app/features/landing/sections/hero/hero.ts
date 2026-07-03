import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

interface Stream {
  rgb: string;
  anchor: number;
  amp: number;
  speed: number;
  offset: number;
  walk: number;
  points: number[];
}

const STEP = 16;

@Component({
  selector: 'app-hero',
  templateUrl: './hero.html',
  styleUrl: './hero.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('bg');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => this.paint());
  }

  /** Fond animé : grille de points et courbes de cours simulées en marche aléatoire. */
  private paint(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const streams: Stream[] = ['56, 225, 255', '124, 108, 255', '225, 77, 255'].map((rgb, i) => ({
      rgb,
      anchor: 0.38 + i * 0.16,
      amp: 46 + i * 20,
      speed: 0.5 + i * 0.22,
      offset: 0,
      walk: 0,
      points: [],
    }));

    const advance = (s: Stream): number => {
      s.walk = Math.max(-1, Math.min(1, s.walk + (Math.random() - 0.5) * 0.45));
      return s.walk;
    };

    let width = 0;
    let height = 0;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const s of streams) {
        s.points = [];
        const count = Math.ceil(width / STEP) + 2;
        for (let i = 0; i < count; i++) {
          s.points.push(advance(s));
        }
      }
    };

    const drawGrid = (): void => {
      ctx.fillStyle = 'rgba(154, 163, 192, 0.08)';
      for (let x = 24; x < width; x += 48) {
        for (let y = 24; y < height; y += 48) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }
    };

    const drawStream = (s: Stream): void => {
      const toY = (v: number): number => s.anchor * height + v * s.amp;
      ctx.beginPath();
      ctx.moveTo(-s.offset, toY(s.points[0]));
      for (let i = 1; i < s.points.length - 1; i++) {
        const x = i * STEP - s.offset;
        const midX = x + STEP / 2;
        const midY = (toY(s.points[i]) + toY(s.points[i + 1])) / 2;
        ctx.quadraticCurveTo(x, toY(s.points[i]), midX, midY);
      }
      ctx.lineWidth = 5;
      ctx.strokeStyle = `rgba(${s.rgb}, 0.08)`;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${s.rgb}, 0.55)`;
      ctx.stroke();
    };

    const drawFrame = (): void => {
      ctx.clearRect(0, 0, width, height);
      drawGrid();
      for (const s of streams) {
        drawStream(s);
      }
    };

    resize();
    window.addEventListener('resize', resize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', resize));

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      drawFrame();
      return;
    }

    let raf = 0;
    let running = false;

    const tick = (): void => {
      for (const s of streams) {
        s.offset += s.speed;
        while (s.offset >= STEP) {
          s.offset -= STEP;
          s.points.shift();
          s.points.push(advance(s));
        }
      }
      drawFrame();
      raf = requestAnimationFrame(tick);
    };

    // L'animation ne tourne que lorsque le hero est à l'écran.
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !running) {
        running = true;
        raf = requestAnimationFrame(tick);
      } else if (!entry.isIntersecting && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    observer.observe(canvas);

    this.destroyRef.onDestroy(() => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    });
  }
}
