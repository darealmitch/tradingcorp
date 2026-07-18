import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone } from './icone';

/**
 * Indicateur visuel de contenu verrouillé : un cadenas dans une pastille,
 * superposé au visuel d'un module / chapitre / quiz non encore débloqué.
 *
 * Purement visuel — n'altère aucune règle de déverrouillage. À afficher
 * conditionnellement (`@if (etat === 'verrouille')`) : il disparaît de lui-même
 * dès que le contenu devient accessible. Factorisé pour rester uniforme partout.
 */
@Component({
  selector: 'app-verrou',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-icone nom="cadenas" [taille]="taille()" />`,
  host: { class: 'verrou', role: 'img', 'aria-label': 'Contenu verrouillé' },
  styles: `
    :host {
      display: grid;
      place-items: center;
      width: var(--verrou-taille, 34px);
      height: var(--verrou-taille, 34px);
      border: 1px solid var(--line);
      border-radius: 999px;
      background: color-mix(in srgb, var(--surface) 82%, transparent);
      color: var(--muted);
      backdrop-filter: blur(2px);
    }
  `,
})
export class Verrou {
  readonly taille = input(16);
}
