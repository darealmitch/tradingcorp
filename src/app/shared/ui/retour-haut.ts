import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { Icone } from './icone';

/** Hauteur au-delà de laquelle le bouton apparaît — environ un écran défilé. */
const SEUIL_APPARITION = 600;

/**
 * Retour en haut de page, posé au-dessus du contenu dès qu'on a défilé.
 *
 * Utile surtout sur les pages longues (introduction de module, catalogue,
 * tableaux du back-office) où revenir au menu demandait sinon un défilement
 * inverse complet.
 *
 * Le signal n'est écrit que lorsque la visibilité CHANGE : un défilement continu
 * ne déclenche donc aucun rendu superflu, malgré la fréquence de l'événement.
 */
@Component({
  selector: 'app-retour-haut',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <button
        class="retour-haut"
        type="button"
        (click)="remonter()"
        aria-label="Revenir en haut de la page"
      >
        <app-icone nom="fleche" [taille]="18" />
      </button>
    }
  `,
  styles: `
    .retour-haut {
      position: fixed;
      right: 24px;
      /* Remonté au-dessus de la barre d'achat quand elle est là ; la variable
         vaut zéro partout ailleurs. */
      bottom: calc(24px + var(--hauteur-barre-achat, 0px));
      z-index: 40;
      display: grid;
      place-content: center;
      width: 46px;
      height: 46px;
      padding: 0;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow);
      cursor: pointer;
      transition:
        transform 0.2s var(--ease-out),
        border-color 0.2s,
        color 0.2s;
    }

    /* L'icône du jeu pointe vers la droite : on la redresse vers le haut. */
    .retour-haut app-icone {
      transform: rotate(-90deg);
    }

    .retour-haut:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      color: var(--accent);
    }

    .retour-haut:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    /* Sur petit écran, on se cale au-dessus du pouce sans masquer les actions
       principales, souvent posées en bas de page. */
    @media (max-width: 640px) {
      .retour-haut {
        right: 16px;
        bottom: calc(16px + var(--hauteur-barre-achat, 0px));
        width: 42px;
        height: 42px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .retour-haut {
        transition: none;
      }

      .retour-haut:hover {
        transform: none;
      }
    }
  `,
})
export class RetourHaut {
  protected readonly visible = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // `afterNextRender` : aucun accès à `window` tant que le rendu n'a pas eu
    // lieu — le composant reste ainsi inoffensif en environnement sans DOM.
    afterNextRender(() => {
      const surDefilement = (): void => {
        const doitEtreVisible = window.scrollY > SEUIL_APPARITION;
        if (doitEtreVisible !== this.visible()) {
          this.visible.set(doitEtreVisible);
        }
      };
      surDefilement();
      window.addEventListener('scroll', surDefilement, { passive: true });
      destroyRef.onDestroy(() => window.removeEventListener('scroll', surDefilement));
    });
  }

  protected remonter(): void {
    // Un défilement animé est agréable, mais c'est exactement le mouvement que
    // `prefers-reduced-motion` demande d'éviter.
    const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: mouvementReduit ? 'auto' : 'smooth' });
  }
}
