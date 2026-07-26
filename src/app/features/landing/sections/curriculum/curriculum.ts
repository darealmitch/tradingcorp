import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/** ✏️ Les matières du programme, dans l'ordre d'affichage. */
const TOPICS = [
  'Développement personnel',
  'Éducation financière',
  'La fiscalité',
  'Les marchés financiers',
  'Trading',
  'Analyse fondamentale',
  'Investissement',
  'Optimisation',
];

@Component({
  selector: 'app-curriculum',
  templateUrl: './curriculum.html',
  styleUrl: './curriculum.css',
  imports: [Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Curriculum {
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);
  protected readonly topics = TOPICS;

  /** Certificat affiché en grand (lightbox) ou non. */
  protected readonly certOpen = signal(false);

  /** Élément déclencheur, re-focalisé à la fermeture. */
  private lastTrigger: HTMLElement | null = null;

  /** Conteneur de la lightbox, ciblé pour y porter le focus à l'ouverture. */
  private readonly dialogue = viewChild<ElementRef<HTMLElement>>('dialogue');

  constructor() {
    this.destroyRef.onDestroy(() => (document.body.style.overflow = ''));
  }

  /** Ouvre le certificat en grand et fige le défilement. */
  protected openCert(event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.certOpen.set(true);
    document.body.style.overflow = 'hidden';
    // Remplace `autofocus` (déconseillé) : focus posé après rendu effectif.
    setTimeout(() => this.dialogue()?.nativeElement.focus({ preventScroll: true }));
  }

  /**
   * Ferme si le clic vient du fond et non du contenu. Évite de poser un
   * gestionnaire sur le conteneur interne, qui en ferait un faux élément
   * interactif (non focusable et sans équivalent clavier).
   */
  protected fermerSiFond(evenement: MouseEvent): void {
    if (evenement.target === evenement.currentTarget) {
      this.closeCert();
    }
  }

  /** Ferme le certificat, restaure le défilement et rend le focus. */
  protected closeCert(): void {
    if (!this.certOpen()) {
      return;
    }
    this.certOpen.set(false);
    document.body.style.overflow = '';
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }
}
