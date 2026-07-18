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
  viewChildren,
} from '@angular/core';
import { gsap } from 'gsap';
import { EtatModule, ModuleParcours } from '../../../../core/contenu/apprentissage.model';
import { Icone } from '../../../../shared/ui/icone';
import { Verrou } from '../../../../shared/ui/verrou';

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
 * Roadmap du parcours : les modules forment une liste verticale qui défile
 * NATURELLEMENT — aucune capture du scroll, la molette agit comme partout
 * ailleurs. En passant devant le centre du viewport, chaque carte gagne en
 * présence (échelle / opacité / légère inclinaison) et recule aux bords : un
 * effet de profondeur LIÉ à la position de défilement, jamais une caméra qui
 * immobilise la page. Les états viennent du serveur (RPC) : le clic n'ouvre
 * que ce que le serveur autorise, jamais ne « débloque ».
 */
@Component({
  selector: 'app-parcours-roadmap',
  templateUrl: './roadmap.html',
  styleUrl: './roadmap.css',
  imports: [Icone, Verrou],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParcoursRoadmap {
  readonly modules = input.required<ModuleParcours[]>();
  readonly ouvrir = output<ModuleParcours>();

  private readonly cartes = viewChildren<ElementRef<HTMLElement>>('carte');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly reducedMotion = signal(false);
  protected readonly actifIndex = signal(0);

  /** rAF en attente (throttle du recalcul au défilement). */
  private rafId = 0;

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
      this.reducedMotion.set(true); // liste nette, sans effet de profondeur
      return;
    }

    // Effet piloté par le défilement NATIF de la page (throttle rAF). Aucune
    // fixation, aucun pin : on lit seulement la position des cartes.
    const planifier = (): void => {
      if (this.rafId) {
        return;
      }
      this.rafId = requestAnimationFrame(() => {
        this.rafId = 0;
        this.render(cartes);
      });
    };
    window.addEventListener('scroll', planifier, { passive: true });
    window.addEventListener('resize', planifier, { passive: true });
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', planifier);
      window.removeEventListener('resize', planifier);
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
      }
    });
    this.render(cartes);
  }

  /**
   * Profondeur de chaque carte selon la distance de son centre au centre
   * visible du viewport (sous le header de 72px). On ne touche JAMAIS à x/y :
   * la carte reste dans le flux, seuls échelle / opacité / inclinaison varient.
   */
  private render(cartes: HTMLElement[]): void {
    const focal = (72 + window.innerHeight) / 2;
    const demi = window.innerHeight / 2;
    let actif = 0;
    let minAbs = Infinity;

    cartes.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const centre = rect.top + rect.height / 2;
      const d = demi > 0 ? (centre - focal) / demi : 0; // ~ -1 (haut) .. +1 (bas)
      const abs = Math.min(Math.abs(d), 1);
      const flou = Math.round(Math.min(2, abs * 1.4) * 2) / 2;
      gsap.set(el, {
        scale: 1 - abs * 0.13,
        opacity: Math.max(0.4, 1 - abs * 0.4),
        rotateX: Math.max(-14, Math.min(14, d * -7)),
        filter: flou > 0 ? `blur(${flou}px)` : 'none',
        zIndex: 100 - Math.round(abs * 10),
      });
      if (abs < minAbs) {
        minAbs = abs;
        actif = i;
      }
    });

    if (actif !== this.actifIndex()) {
      this.actifIndex.set(actif);
    }
  }
}
