import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';

/**
 * Champ de particules ambiant, en fond de page.
 *
 * Système visuel unique et continu qui unifie l'ambiance graphique entre les
 * sections : une nappe de particules dérivant lentement vers l'avant (effet
 * tunnel immersif), aux couleurs de la marque.
 *
 * Contraintes respectées :
 * - L'accueil reste strictement inchangé : le champ est masqué (opacité 0)
 *   tant que le hero occupe l'écran, puis apparaît une fois franchi.
 * - `prefers-reduced-motion` : une seule image statique, sans animation.
 * - La boucle est suspendue quand l'onglet est masqué ou le champ invisible.
 */
@Component({
  selector: 'app-particles',
  template: '<canvas #canvas class="particles-canvas" aria-hidden="true"></canvas>',
  styles: [
    `
      .particles-canvas {
        position: fixed;
        inset: 0;
        z-index: -1;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.4s linear;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Particles {
  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly destroyRef = inject(DestroyRef);

  /** Couleurs partagées avec le tunnel de la traversée, pour rester cohérent. */
  private readonly colors = ['56, 225, 255', '124, 108, 255', '225, 77, 255'];

  constructor() {
    afterNextRender(() => this.init());
  }

  private init(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    interface Particle {
      x: number;
      y: number;
      z: number;
      rgb: string;
    }

    const particles: Particle[] = Array.from({ length: 200 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random() * 0.9 + 0.1,
      rgb: this.colors[Math.floor(Math.random() * this.colors.length)],
    }));

    let width = 0;
    let height = 0;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // Canvas fixed plein écran : la taille du viewport est la référence fiable.
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', resize));

    const draw = (advance: number): void => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.6;

      for (const p of particles) {
        p.z -= advance;
        if (p.z <= 0.05) {
          p.z += 0.95;
          p.x = (Math.random() - 0.5) * 2;
          p.y = (Math.random() - 0.5) * 2;
        }
        const px = cx + (p.x / p.z) * scale;
        const py = cy + (p.y / p.z) * scale;
        if (px < -20 || px > width + 20 || py < -20 || py > height + 20) {
          continue;
        }
        const depth = 1 - p.z;
        ctx.beginPath();
        ctx.arc(px, py, 0.4 + depth * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb}, ${0.1 + depth * 0.45})`;
        ctx.fill();
      }
    };

    // Opacité pilotée par le scroll : strictement nulle tant que le hero
    // (~100vh) occupe l'écran, puis montée progressive une fois franchi.
    const updateOpacity = (): void => {
      const h = window.innerHeight;
      const t = Math.max(0, Math.min(1, (window.scrollY - h * 0.9) / (h * 0.5)));
      canvas.style.opacity = String(t * 0.9);
    };
    updateOpacity();
    window.addEventListener('scroll', updateOpacity, { passive: true });
    this.destroyRef.onDestroy(() => window.removeEventListener('scroll', updateOpacity));

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      draw(0);
      return;
    }

    let raf = 0;
    let running = false;

    const tick = (): void => {
      draw(0.0016);
      raf = requestAnimationFrame(tick);
    };

    const start = (): void => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(tick);
      }
    };
    const stop = (): void => {
      if (running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    };

    const onVisibility = (): void => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();

    this.destroyRef.onDestroy(() => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    });
  }
}
