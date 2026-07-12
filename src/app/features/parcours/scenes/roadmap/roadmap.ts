import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EtatModule, ModuleParcours } from '../../../../core/contenu/apprentissage.model';
import { Icone } from '../../../../shared/ui/icone';

const ETAT_LABEL: Record<EtatModule, string> = {
  verrouille: 'Verrouillé',
  debloque: 'À découvrir',
  en_cours: 'En cours',
  termine: 'Terminé',
};

const ETAT_ACTION: Record<EtatModule, string> = {
  verrouille: 'Verrouillé',
  debloque: 'Commencer',
  en_cours: 'Continuer',
  termine: 'Revoir',
};

const ETAT_ICONE: Record<EtatModule, string> = {
  verrouille: 'cadenas',
  debloque: 'fleche',
  en_cours: 'lecture',
  termine: 'coche',
};

/**
 * Roadmap immersive : les modules défilent comme des plans traversés par une
 * caméra (pin + scrub GSAP). Le module au centre devient le point focal, les
 * autres reculent en profondeur. Les états viennent du serveur (RPC) : le
 * clic n'ouvre que ce que le serveur autorise, jamais ne « débloque ».
 */
@Component({
  selector: 'app-parcours-roadmap',
  templateUrl: './roadmap.html',
  styleUrl: './roadmap.css',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParcoursRoadmap {
  readonly modules = input.required<ModuleParcours[]>();
  readonly ouvrir = output<ModuleParcours>();

  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly aura = viewChild.required<ElementRef<HTMLElement>>('aura');
  private readonly railFill = viewChild.required<ElementRef<HTMLElement>>('railFill');
  private readonly cartes = viewChildren<ElementRef<HTMLElement>>('carte');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reducedMotion = signal(false);
  protected readonly actifIndex = signal(0);

  private camera = 0;

  constructor() {
    afterNextRender(() => this.init());
  }

  protected estActif(i: number): boolean {
    return i === this.actifIndex();
  }

  protected numero(i: number): string {
    return String(i + 1).padStart(2, '0');
  }

  protected label(m: ModuleParcours): string {
    return ETAT_LABEL[m.etat];
  }

  protected action(m: ModuleParcours): string {
    return ETAT_ACTION[m.etat];
  }

  protected icone(m: ModuleParcours): string {
    return ETAT_ICONE[m.etat];
  }

  protected pourcent(m: ModuleParcours): number {
    return m.total_lecons > 0 ? Math.round((m.lecons_terminees / m.total_lecons) * 100) : 0;
  }

  protected activer(m: ModuleParcours, i: number): void {
    if (m.etat === 'verrouille') {
      this.secouer(i); // refus visuel — aucun déblocage côté client
      return;
    }
    this.ouvrir.emit(m);
  }

  private secouer(i: number): void {
    const el = this.cartes()[i]?.nativeElement;
    if (el && !this.reducedMotion()) {
      gsap.fromTo(el, { x: -7 }, { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' });
    }
  }

  private init(): void {
    const cartes = this.cartes().map((c) => c.nativeElement);
    if (cartes.length === 0) {
      return;
    }
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion.set(true); // rendu statique (CSS .est-statique)
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const n = cartes.length;

    const trigger = ScrollTrigger.create({
      trigger: this.stage().nativeElement,
      start: 'top top',
      end: `+=${n * 62}%`,
      pin: true,
      scrub: 0.6,
      onUpdate: (self) => {
        this.camera = self.progress * (n - 1);
        this.render(cartes);
      },
    });
    this.destroyRef.onDestroy(() => trigger.kill());
    this.render(cartes);
  }

  /** Positionne chaque carte selon sa distance à la caméra (profondeur). */
  private render(cartes: HTMLElement[]): void {
    const cam = this.camera;
    const n = cartes.length;

    cartes.forEach((el, i) => {
      const d = i - cam;
      const abs = Math.abs(d);
      gsap.set(el, {
        xPercent: -50,
        yPercent: -50,
        y: d * 132,
        scale: 1 / (1 + abs * 0.17),
        opacity: Math.max(0, 1 - abs * 0.3),
        rotateX: Math.max(-22, Math.min(22, d * -6)),
        filter: `blur(${Math.min(7, abs * 1.6)}px)`,
        zIndex: 200 - Math.round(abs * 10),
      });
    });

    const p = n > 1 ? cam / (n - 1) : 0;
    gsap.set(this.aura().nativeElement, {
      yPercent: -50 + p * 10,
      opacity: 0.45 + Math.sin(p * Math.PI) * 0.35,
    });
    gsap.set(this.railFill().nativeElement, { scaleY: p });

    const actif = Math.round(cam);
    if (actif !== this.actifIndex()) {
      this.actifIndex.set(actif);
    }
  }
}
