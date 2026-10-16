import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { ThemeService } from '../core/theme/theme.service';
import { nombreJeton, rgbJeton, valeurJeton } from './couleurs-theme';

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

/**
 * Fond animé du premier écran : grille de points et courbes de cours simulées
 * en marche aléatoire, sous un voile qui fond le tout dans la page.
 *
 * Il vivait dans le premier écran de l'accueil ; il est partagé depuis que la
 * page Programme reprend le même premier écran (16/10/2026). Le comportement
 * est celui d'origine, inchangé. Le composant remplit son parent, qui doit
 * être positionné (`position: relative`).
 */
@Component({
  selector: 'app-fond-courbes',
  template: `
    <canvas #toile class="fond-toile" aria-hidden="true"></canvas>
    <div class="fond-voile" aria-hidden="true"></div>
  `,
  styles: [
    `
      :host {
        position: absolute;
        inset: 0;
        display: block;
        pointer-events: none;
      }

      .fond-toile {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }

      .fond-voile {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 60% 50% at 18% 30%, rgba(56, 225, 255, 0.1), transparent 70%),
          radial-gradient(ellipse 50% 45% at 85% 65%, rgba(225, 77, 255, 0.09), transparent 70%),
          linear-gradient(
            180deg,
            color-mix(in srgb, var(--bg) 55%, transparent),
            color-mix(in srgb, var(--bg) 25%, transparent) 45%,
            var(--bg)
          );
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FondCourbes {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('toile');
  private readonly destroyRef = inject(DestroyRef);
  private readonly theme = inject(ThemeService);

  /** Recolore le canvas depuis les jetons CSS ; posé une fois le canvas prêt. */
  private rafraichirCouleurs?: () => void;

  constructor() {
    afterNextRender(() => this.paint());
    // Le canvas ne peut pas utiliser var(--x) : on le repeint à chaque bascule.
    effect(() => {
      this.theme.theme();
      this.rafraichirCouleurs?.();
    });
  }

  /** Fond animé : grille de points et courbes de cours simulées en marche aléatoire. */
  private paint(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    // Couleurs de marque lues dans les jetons CSS (repli = valeurs du thème sombre).
    const JETONS: [string, string][] = [
      ['--cyan', '56, 225, 255'],
      ['--violet', '124, 108, 255'],
      ['--magenta', '225, 77, 255'],
    ];

    const streams: Stream[] = JETONS.map(([jeton, repli], i) => ({
      rgb: rgbJeton(jeton, repli),
      anchor: 0.38 + i * 0.16,
      amp: 46 + i * 20,
      speed: 0.5 + i * 0.22,
      offset: 0,
      walk: 0,
      points: [],
    }));

    /** Opacités et couleur de grille, relues à chaque changement de thème. */
    let grilleCouleur = valeurJeton('--grid-dot') || 'rgba(154, 163, 192, 0.08)';
    let alphaLigne = nombreJeton('--canvas-line-alpha', 0.55);
    let alphaHalo = nombreJeton('--canvas-glow-alpha', 0.08);

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
      ctx.fillStyle = grilleCouleur;
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
      ctx.strokeStyle = `rgba(${s.rgb}, ${alphaHalo})`;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(${s.rgb}, ${alphaLigne})`;
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

    // Relit les jetons puis repeint : appelé par l'effect à chaque bascule.
    this.rafraichirCouleurs = (): void => {
      JETONS.forEach(([jeton, repli], i) => (streams[i].rgb = rgbJeton(jeton, repli)));
      grilleCouleur = valeurJeton('--grid-dot') || grilleCouleur;
      alphaLigne = nombreJeton('--canvas-line-alpha', alphaLigne);
      alphaHalo = nombreJeton('--canvas-glow-alpha', alphaHalo);
      drawFrame();
    };
    this.destroyRef.onDestroy(() => (this.rafraichirCouleurs = undefined));

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

    // L'animation ne tourne que lorsque le fond est à l'écran.
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
