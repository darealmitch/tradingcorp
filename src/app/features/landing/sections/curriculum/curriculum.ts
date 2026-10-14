import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { compte, dureeCourte } from '../../../../core/commerce/vitrine.textes';
import { VitrineService } from '../../../../core/commerce/vitrine.service';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/**
 * Les matières du programme, dans l'ordre d'affichage. Repli seulement : les
 * modules publiés, avec leurs objectifs, viennent de la vitrine ; cette liste
 * ne s'affiche que si elle n'a pas pu être lue.
 */
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

  private readonly vitrine = inject(VitrineService);

  protected readonly media = inject(MediaService);
  protected readonly topics = TOPICS;
  protected readonly compte = compte;
  protected readonly dureeCourte = dureeCourte;

  /**
   * Les modules publiés, chacun dépliable sur son accroche et ses objectifs —
   * ce qu'on y apprend, dit par la formation elle-même, et non une liste de
   * huit intitulés à prendre sur parole.
   */
  protected readonly modules = computed(() => this.vitrine.vitrine()?.programme ?? []);

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
