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
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MediaService } from '../../../../core/media/media.service';

/**
 * Une case : un identifiant (affiché en 01, 02, …), un titre court et son message.
 * `visuel` (optionnel) : chemin d'une image affichée à la place du numéro géant.
 */
interface CaseItem {
  id: number;
  titre: string;
  message: string;
  visuel?: string;
}

/**
 * ✏️ Ajoute, modifie ou supprime tes cases ici — c'est le seul endroit à toucher.
 * Chaque case ajoutée allonge automatiquement la traversée au scroll.
 */
const CASES: CaseItem[] = [
  {
    id: 1,
    titre: 'Forme-toi & Apprends',
    message:
      'Grâce à des vidéos éducatives et des supports écrits, ' +
      'tu auras à ta disposition tous les outils dont tu as besoin pour performer sur les marchés.',
    visuel: 'tradingcorp/landing/cases/pexels-jakubzerdzicki-26841237',
  },
  {
    id: 2,
    titre: 'Communauté & Partage',
    message:
      'Avec la communauté, tes réussites comme tes pertes, ' +
      "tes questionnements et tes certitudes évoluent au sein d'une communauté engagée, " +
      'composée de traders déjà compétents et rentables, dont moi.',
    visuel: 'tradingcorp/landing/cases/vitaly-gariev-Y32qbykD69g-unsplash',
  },
  {
    id: 3,
    titre: 'Évolue & Progresse',
    message: "Et si tu fais partie des meilleurs, tu auras l'opportunité de travailler avec nous.",
    visuel: 'tradingcorp/landing/cases/adeolu-eletu-E7RLgUjjazc-unsplash',
  },
];

/** Longueur de scroll allouée à chaque case (en % de hauteur d'écran). */
const SCROLL_PAR_CASE = 120;

/** Lissage de la caméra : plus petit = plus d'inertie (0.1 ≈ 0,6 s pour se poser). */
const LISSAGE = 0.1;

@Component({
  selector: 'app-cases',
  templateUrl: './cases.html',
  styleUrl: './cases.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cases {
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly progressBar = viewChild.required<ElementRef<HTMLElement>>('progressBar');
  private readonly tunnel = viewChild.required<ElementRef<HTMLCanvasElement>>('tunnel');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);
  protected readonly cases = CASES;
  protected readonly total = String(CASES.length).padStart(2, '0');

  /** Position courante dans la traversée, affichée dans le HUD (01, 02, …). */
  protected readonly currentIndex = signal('01');

  /** Avec prefers-reduced-motion : liste statique, aucun épinglage ni animation. */
  protected readonly reducedMotion = signal(false);

  /** Progression brute du scroll (0 → 1), cible que la caméra suit avec inertie. */
  private sceneProgress = 0;

  constructor() {
    afterNextRender(() => this.initScrollScene());
  }

  /**
    Rendu façon Active Theory : le scroll ne déclenche pas des transitions,
    il définit la position d'une caméra. À chaque frame, la caméra se rapproche
    de cette cible (lerp), et chaque case est rendue en continu selon sa
    distance à la caméra — échelle, opacité, dérives latérales — pendant que
    le tunnel de particules avance du même mouvement.
   */
  private initScrollScene(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion.set(true);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const stage = this.stage().nativeElement;
    const slides = Array.from(stage.querySelectorAll<HTMLElement>('.case-slide'));
    const count = slides.length;

    // L'épinglage : le scroll est converti en progression, rien d'autre.
    const trigger = ScrollTrigger.create({
      trigger: stage,
      start: 'top top',
      end: () => `+=${count * SCROLL_PAR_CASE}%`,
      pin: true,
      onUpdate: (self) => {
        this.sceneProgress = self.progress;
      },
    });
    this.destroyRef.onDestroy(() => trigger.kill());

    this.startRenderLoop(slides);
  }

  /** Boucle de rendu unique : caméra lissée, cases et particules synchronisées. */
  private startRenderLoop(slides: HTMLElement[]): void {
    const canvas = this.tunnel().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const count = slides.length;
    const bar = this.progressBar().nativeElement;
    const parts = slides.map((slide) => ({
      slide,
      // Numéro géant ou image : même rôle de fond, même dérive parallaxe.
      backdrop: slide.querySelector<HTMLElement>('.slide-number, .slide-visual'),
      title: slide.querySelector<HTMLElement>('.slide-title'),
      message: slide.querySelector<HTMLElement>('.slide-message'),
    }));

    const COLORS = ['56, 225, 255', '124, 108, 255', '225, 77, 255'];

    interface Particle {
      x: number;
      y: number;
      z: number;
      rgb: string;
    }

    const particles: Particle[] = Array.from({ length: 160 }, () => ({
      x: (Math.random() - 0.5) * 2,
      y: (Math.random() - 0.5) * 2,
      z: Math.random() * 0.9 + 0.1,
      rgb: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));

    let width = 0;
    let height = 0;

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', resize));

    let rendered = 0;
    let raf = 0;
    let running = false;

    const drawParticles = (advance: number): void => {
      ctx.clearRect(0, 0, width, height);
      const cx = width / 2;
      const cy = height / 2;
      const scale = Math.min(width, height) * 0.5;

      for (const p of particles) {
        p.z -= advance;
        // Une particule sortie du champ réapparaît à l'autre bout du tunnel.
        if (p.z <= 0.05 || p.z > 1) {
          p.z = p.z <= 0.05 ? p.z + 0.95 : p.z - 0.95;
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
        ctx.arc(px, py, 0.4 + depth * 2.2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.rgb}, ${0.12 + depth * 0.5})`;
        ctx.fill();
      }
    };

    const drawSlides = (): void => {
      // La caméra parcourt les cases : 0.5 = première centrée, count - 0.5 = dernière.
      const camera = 0.5 + rendered * (count - 1);

      parts.forEach((part, i) => {
        const dist = i + 0.5 - camera; // > 0 : devant nous, < 0 : déjà traversée
        const behind = dist < 0;
        const abs = Math.abs(dist);
        const opacity = Math.max(0, behind ? 1 - abs * 2.4 : 1 - dist * 1.15);

        if (opacity <= 0.001) {
          gsap.set(part.slide, { opacity: 0, visibility: 'hidden' });
          return;
        }

        const scale = behind ? 1 + abs * 0.9 : 1 / (1 + dist * 1.1);
        gsap.set(part.slide, { opacity, scale, visibility: 'visible' });
        gsap.set(part.backdrop, { xPercent: dist * -14 });
        gsap.set(part.title, { x: dist * 90 });

        // Le message n'est net qu'au voisinage immédiat de la case.
        const focus = Math.max(0, 1 - abs / 0.4);
        gsap.set(part.message, { opacity: focus, y: (1 - focus) * 30 });
      });

      gsap.set(bar, { scaleX: rendered });

      const index = Math.min(count, Math.floor(camera) + 1);
      const label = String(index).padStart(2, '0');
      if (label !== this.currentIndex()) {
        this.currentIndex.set(label);
      }
    };

    const tick = (): void => {
      // Le cœur du rendu : la caméra suit le scroll avec inertie.
      const delta = this.sceneProgress - rendered;
      rendered += delta * LISSAGE;
      const advance = Math.max(-0.06, Math.min(0.08, 0.0012 + delta * 0.15));

      drawParticles(advance);
      drawSlides();

      raf = requestAnimationFrame(tick);
    };

    // La boucle ne tourne que lorsque la scène est à l'écran.
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
