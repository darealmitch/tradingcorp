import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Reveal } from '../../../../shared/reveal';

/** Un avis : capture d'écran + texte alternatif. */
interface Avis {
  img: string;
  alt: string;
}

/** ✏️ Ajoute ou retire des captures ici — la longueur du défilement s'adapte seule. */
const AVIS: Avis[] = [
  { img: 'images/avis-01.png', alt: 'Retour membre TradingCorp' },
  { img: 'images/avis-02.png', alt: 'Performance trading membre' },
  { img: 'images/avis-03.png', alt: 'Avis membre TradingCorp' },
  { img: 'images/avis-04.png', alt: 'Résultat trading élève' },
  { img: 'images/avis-05.png', alt: 'Témoignage Discord' },
  { img: 'images/avis-06.png', alt: 'Gain trading membre' },
  { img: 'images/avis-07.png', alt: "Retour d'expérience élève" },
  { img: 'images/avis-08.png', alt: 'Discussion Discord TradingCorp' },
  { img: 'images/avis-09.png', alt: 'Message de satisfaction membre' },
  { img: 'images/avis-10.jpg', alt: 'Avis WhatsApp membre' },
  { img: 'images/avis-11.jpg', alt: 'Discussion WhatsApp membre' },
  { img: 'images/avis-12.jpg', alt: 'Retour WhatsApp élève' },
  { img: 'images/avis-13.jpg', alt: 'Capture WhatsApp satisfaction' },
  { img: 'images/avis-14.jpg', alt: 'Retour SMS membre' },
  { img: 'images/avis-15.jpg', alt: 'Retour SMS membre' },
  { img: 'images/avis-16.jpg', alt: 'Retour SMS membre' },
  { img: 'images/avis-17.jpg', alt: 'Retour SMS membre' },
  { img: 'images/avis-18.jpg', alt: 'Retour SMS membre' },
  { img: 'images/avis-19.png', alt: 'Retour formation' },
  { img: 'images/avis-20.png', alt: 'Retour formation fiscalité' },
  { img: 'images/avis-21.png', alt: 'Retour formation TradingCorp' },
  { img: 'images/avis-22.png', alt: 'Retour formation TradingCorp' },
  { img: 'images/avis-23.png', alt: 'Retour formation TradingCorp' },
  { img: 'images/avis-24.png', alt: 'Retour formation TradingCorp' },
  { img: 'images/avis-25.png', alt: 'Retour formation TradingCorp' },
];

/** Touches qui provoquent un défilement vertical, neutralisées pendant la modal. */
const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

@Component({
  selector: 'app-notice',
  templateUrl: './notice.html',
  styleUrl: './notice.css',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notice {
  private readonly stage = viewChild.required<ElementRef<HTMLElement>>('stage');
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly avis = AVIS;

  /** Avec prefers-reduced-motion : bande défilable au doigt, sans épinglage. */
  protected readonly reducedMotion = signal(false);

  /** Index de l'avis affiché dans la modal (null = modal fermée). */
  protected readonly activeIndex = signal<number | null>(null);

  /** Avis courant, dérivé de l'index — la modal reste ouverte quand il change. */
  protected readonly activeAvis = computed<Avis | null>(() => {
    const i = this.activeIndex();
    return i === null ? null : this.avis[i];
  });

  /** Carte à re-focaliser à la fermeture, pour un parcours clavier cohérent. */
  private lastTrigger: HTMLElement | null = null;

  /** ScrollTrigger de la galerie, piloté par la navigation de la modal. */
  private scrollTrigger: ScrollTrigger | undefined;
  /** Animation en cours du scroll de la galerie (synchro avec l'avis affiché). */
  private syncTween: gsap.core.Tween | undefined;

  constructor() {
    afterNextRender(() => this.initGallery());
  }

  /** Ouvre la modal sur l'avis cliqué, verrouille le scroll et cale la galerie. */
  protected openAvis(index: number, event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.activeIndex.set(index);
    this.lockScroll();
    this.syncGalleryTo(index, true);
  }

  /**
   * Avis suivant, navigation linéaire sans boucle. Chaque pas fait progresser la
   * position du ScrollTrigger. Passé le dernier avis, on ne revient pas au
   * premier : la galerie est déjà à sa position maximale, la modal se ferme et
   * le défilement vertical reprend naturellement vers la section suivante.
   */
  protected next(): void {
    const i = this.activeIndex();
    if (i === null) {
      return;
    }
    if (i < this.avis.length - 1) {
      const target = i + 1;
      this.activeIndex.set(target);
      this.syncGalleryTo(target);
    } else {
      this.closeAvis();
    }
  }

  /** Avis précédent, sans boucle : reste sur le premier une fois atteint. */
  protected prev(): void {
    const i = this.activeIndex();
    if (i !== null && i > 0) {
      const target = i - 1;
      this.activeIndex.set(target);
      this.syncGalleryTo(target);
    }
  }

  /** Ferme la modal, déverrouille le scroll et rend le focus à la carte. */
  protected closeAvis(): void {
    const i = this.activeIndex();
    if (i === null) {
      return;
    }
    // Cale exactement la galerie sur l'avis courant avant de rendre la main :
    // à la fermeture, la carte correspondante est déjà en place (aucun saut).
    this.snapGalleryTo(i);
    this.activeIndex.set(null);
    this.unlockScroll();
    // preventScroll : la restitution du focus ne doit provoquer aucun saut.
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }

  /**
   * Anime la position du ScrollTrigger vers l'avis d'index donné.
   * Mapping linéaire : index 0 → début du pin, dernier index → fin du pin
   * (position maximale de la galerie). On pilote `scrollTrigger.scroll()`
   * (API GSAP native), pas de scrollIntoView.
   */
  private syncGalleryTo(index: number, immediate = false): void {
    const st = this.scrollTrigger;
    if (!st) {
      return;
    }
    const span = this.avis.length - 1;
    const progress = span > 0 ? index / span : 0;
    const target = st.start + progress * (st.end - st.start);

    this.syncTween?.kill();
    if (immediate) {
      st.scroll(target);
      return;
    }

    const proxy = { y: st.scroll() };
    this.syncTween = gsap.to(proxy, {
      y: target,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => st.scroll(proxy.y),
    });
  }

  /** Positionne instantanément la galerie sur l'avis d'index donné. */
  private snapGalleryTo(index: number): void {
    const st = this.scrollTrigger;
    if (!st) {
      return;
    }
    this.syncTween?.kill();
    const span = this.avis.length - 1;
    const progress = span > 0 ? index / span : 0;
    st.scroll(st.start + progress * (st.end - st.start));
  }

  /* ===== Verrou de scroll compatible GSAP =====
     On bloque le scroll utilisateur (molette, tactile, touches) mais on laisse
     passer le scroll piloté par GSAP — impossible avec `overflow: hidden`. */

  private readonly blockScroll = (event: Event): void => event.preventDefault();
  private readonly blockScrollKeys = (event: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(event.key)) {
      event.preventDefault();
    }
  };

  private lockScroll(): void {
    window.addEventListener('wheel', this.blockScroll, { passive: false });
    window.addEventListener('touchmove', this.blockScroll, { passive: false });
    window.addEventListener('keydown', this.blockScrollKeys);
    // Le lissage GSAP pilote la galerie : on neutralise le scroll-behavior
    // global (smooth) pour que chaque pas de synchro soit instantané.
    document.documentElement.style.scrollBehavior = 'auto';
  }

  private unlockScroll(): void {
    window.removeEventListener('wheel', this.blockScroll);
    window.removeEventListener('touchmove', this.blockScroll);
    window.removeEventListener('keydown', this.blockScrollKeys);
    document.documentElement.style.scrollBehavior = '';
  }

  /**
   * Galerie horizontale : la scène (titre + bande) s'épingle et le scroll
   * vertical translate la bande vers la gauche, sur exactement la largeur
   * qui déborde de l'écran.
   */
  private initGallery(): void {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion.set(true);
      return;
    }

    gsap.registerPlugin(ScrollTrigger);

    const stage = this.stage().nativeElement;
    const track = this.track().nativeElement;

    // Distance recalculée à chaque refresh (resize, chargement…) — jamais figée.
    const distance = (): number => Math.max(0, track.scrollWidth - window.innerWidth);

    const tween = gsap.to(track, {
      x: () => -distance(),
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: 'top top',
        end: () => `+=${distance()}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
      },
    });
    this.scrollTrigger = tween.scrollTrigger;

    // Les captures chargent en différé : on remesure une fois toutes affichées.
    const images = Array.from(track.querySelectorAll('img'));
    Promise.all(
      images.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) {
              resolve();
            } else {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }
          }),
      ),
    ).then(() => ScrollTrigger.refresh());

    this.destroyRef.onDestroy(() => {
      this.syncTween?.kill();
      tween.scrollTrigger?.kill();
      tween.kill();
      this.unlockScroll();
    });
  }
}
