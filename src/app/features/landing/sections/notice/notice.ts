import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/** Un avis : capture d'écran + texte alternatif. */
interface Avis {
  img: string;
  alt: string;
}

/** ✏️ Ajoute ou retire des captures ici — la longueur du défilement s'adapte seule. */
const AVIS: Avis[] = [
  { img: 'tradingcorp/landing/avis/avis-01', alt: 'Retour membre TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-02', alt: 'Performance trading membre' },
  { img: 'tradingcorp/landing/avis/avis-03', alt: 'Avis membre TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-04', alt: 'Résultat trading élève' },
  { img: 'tradingcorp/landing/avis/avis-05', alt: 'Témoignage Discord' },
  { img: 'tradingcorp/landing/avis/avis-06', alt: 'Gain trading membre' },
  { img: 'tradingcorp/landing/avis/avis-07', alt: "Retour d'expérience élève" },
  { img: 'tradingcorp/landing/avis/avis-08', alt: 'Discussion Discord TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-09', alt: 'Message de satisfaction membre' },
  { img: 'tradingcorp/landing/avis/avis-10', alt: 'Avis WhatsApp membre' },
  { img: 'tradingcorp/landing/avis/avis-11', alt: 'Discussion WhatsApp membre' },
  { img: 'tradingcorp/landing/avis/avis-12', alt: 'Retour WhatsApp élève' },
  { img: 'tradingcorp/landing/avis/avis-13', alt: 'Capture WhatsApp satisfaction' },
  { img: 'tradingcorp/landing/avis/avis-14', alt: 'Retour SMS membre' },
  { img: 'tradingcorp/landing/avis/avis-15', alt: 'Retour SMS membre' },
  { img: 'tradingcorp/landing/avis/avis-16', alt: 'Retour SMS membre' },
  { img: 'tradingcorp/landing/avis/avis-17', alt: 'Retour SMS membre' },
  { img: 'tradingcorp/landing/avis/avis-18', alt: 'Retour SMS membre' },
  { img: 'tradingcorp/landing/avis/avis-19', alt: 'Retour formation' },
  { img: 'tradingcorp/landing/avis/avis-20', alt: 'Retour formation fiscalité' },
  { img: 'tradingcorp/landing/avis/avis-21', alt: 'Retour formation TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-22', alt: 'Retour formation TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-23', alt: 'Retour formation TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-24', alt: 'Retour formation TradingCorp' },
  { img: 'tradingcorp/landing/avis/avis-25', alt: 'Retour formation TradingCorp' },
];

/** Touches qui provoquent un défilement vertical, neutralisées pendant la modal. */
const SCROLL_KEYS = new Set([' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown']);

@Component({
  selector: 'app-notice',
  templateUrl: './notice.html',
  styleUrl: './notice.css',
  imports: [Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notice {
  /** Conteneur de la modal, ciblé pour y porter le focus à l'ouverture. */
  private readonly dialogue = viewChild<ElementRef<HTMLElement>>('dialogue');

  protected readonly media = inject(MediaService);
  protected readonly avis = AVIS;

  /** Index de l'avis affiché dans la modal (null = modal fermée). */
  protected readonly activeIndex = signal<number | null>(null);

  /** Avis courant, dérivé de l'index — la modal reste ouverte quand il change. */
  protected readonly activeAvis = computed<Avis | null>(() => {
    const i = this.activeIndex();
    return i === null ? null : this.avis[i];
  });

  /** Carte à re-focaliser à la fermeture, pour un parcours clavier cohérent. */
  private lastTrigger: HTMLElement | null = null;

  /** Ouvre la modal sur l'avis cliqué et verrouille le défilement de la page. */
  protected openAvis(index: number, event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.activeIndex.set(index);
    this.lockScroll();
    this.donnerFocusAuDialogue();
  }

  /**
   * Ferme si le clic vient du fond et non du contenu. Évite de poser un
   * gestionnaire sur le conteneur interne, qui en ferait un faux élément
   * interactif (non focusable et sans équivalent clavier).
   */
  protected fermerSiFond(evenement: MouseEvent): void {
    if (evenement.target === evenement.currentTarget) {
      this.closeAvis();
    }
  }

  /**
   * Déplace le focus dans la modal à l'ouverture — le rôle que tenait
   * `autofocus`, mais sans l'attribut (déconseillé) et après rendu effectif.
   */
  private donnerFocusAuDialogue(): void {
    setTimeout(() => this.dialogue()?.nativeElement.focus({ preventScroll: true }));
  }

  /**
   * Avis suivant, navigation linéaire sans boucle. Passé le dernier, on ne
   * revient pas au premier : la modal se ferme et la lecture de la page
   * reprend naturellement vers la section suivante.
   */
  protected next(): void {
    const i = this.activeIndex();
    if (i === null) {
      return;
    }
    if (i < this.avis.length - 1) {
      this.activeIndex.set(i + 1);
    } else {
      this.closeAvis();
    }
  }

  /** Avis précédent, sans boucle : reste sur le premier une fois atteint. */
  protected prev(): void {
    const i = this.activeIndex();
    if (i !== null && i > 0) {
      this.activeIndex.set(i - 1);
    }
  }

  /** Ferme la modal, déverrouille le scroll et rend le focus à la carte. */
  protected closeAvis(): void {
    const i = this.activeIndex();
    if (i === null) {
      return;
    }
    this.activeIndex.set(null);
    this.unlockScroll();
    // preventScroll : la restitution du focus ne doit provoquer aucun saut.
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }

  /* ===== Verrou de défilement pendant la modal =====
     La page ne doit pas défiler derrière le témoignage affiché en grand. */

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
    // `scroll-behavior: smooth` est posé globalement : on le neutralise le
    // temps de la modal, pour qu'aucun défilement résiduel ne s'anime derrière.
    document.documentElement.style.scrollBehavior = 'auto';
  }

  private unlockScroll(): void {
    window.removeEventListener('wheel', this.blockScroll);
    window.removeEventListener('touchmove', this.blockScroll);
    window.removeEventListener('keydown', this.blockScrollKeys);
    document.documentElement.style.scrollBehavior = '';
  }
}
