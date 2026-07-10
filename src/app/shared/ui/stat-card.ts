import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone } from './icone';

/** Carte de statistique des tableaux de bord (icône, libellé, valeur, détail). */
@Component({
  selector: 'app-stat-card',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stat-tete">
      <span class="stat-icone"><app-icone [nom]="icone()" [taille]="18" /></span>
      @if (tendance()) {
        <app-icone
          class="stat-tendance"
          [class.est-baisse]="tendance() === 'baisse'"
          nom="tendance"
          [taille]="16"
        />
      }
    </div>
    <p class="stat-libelle">{{ libelle() }}</p>
    <p class="stat-valeur">{{ valeur() }}</p>
    @if (detail(); as texte) {
      <p class="stat-detail">{{ texte }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      padding: 22px 24px;
      border: 1px solid var(--line);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.03), rgba(255, 255, 255, 0));
      transition: border-color 0.2s;
    }

    :host(:hover) {
      border-color: rgba(148, 163, 220, 0.32);
    }

    .stat-tete {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 14px;
    }

    .stat-icone {
      display: grid;
      place-content: center;
      width: 38px;
      height: 38px;
      border: 1px solid var(--line);
      border-radius: 12px;
      color: var(--cyan);
      background: rgba(56, 225, 255, 0.06);
    }

    .stat-tendance {
      color: var(--up);
    }

    .stat-tendance.est-baisse {
      color: var(--down);
      transform: scaleY(-1);
    }

    .stat-libelle {
      font-size: 0.85rem;
      color: var(--muted);
    }

    .stat-valeur {
      margin-top: 4px;
      font-family: var(--font-display);
      font-size: 1.6rem;
      font-weight: 700;
    }

    .stat-detail {
      margin-top: 4px;
      font-size: 0.8rem;
      color: var(--muted);
    }
  `,
})
export class StatCard {
  readonly icone = input.required<string>();
  readonly libelle = input.required<string>();
  readonly valeur = input.required<string>();
  readonly detail = input<string>();
  readonly tendance = input<'hausse' | 'baisse' | null>(null);
}
