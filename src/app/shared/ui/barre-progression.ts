import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Barre de progression horizontale (0–100). */
@Component({
  selector: 'app-barre-progression',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rail">
      <div class="part" [style.width.%]="valeur()"></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .rail {
      height: 6px;
      border-radius: 999px;
      background: rgba(148, 163, 220, 0.14);
      overflow: hidden;
    }

    .part {
      height: 100%;
      border-radius: inherit;
      background: var(--gradient);
      transition: width 0.5s var(--ease-out);
    }
  `,
})
export class BarreProgression {
  readonly valeur = input.required<number>();
}
