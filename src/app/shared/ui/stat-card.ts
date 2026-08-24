import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Icone } from './icone';

/**
 * Carte de statistique des tableaux de bord (icône, libellé, valeur, détail).
 *
 * Certaines cartes ouvrent un aperçu : `cliquable` les rend actionnables au
 * clavier comme à la souris et émet `activer`. Les autres restent de simples
 * indicateurs — une carte qui réagit au survol sans rien faire au clic est un
 * faux bouton, plus déroutant qu'utile.
 */
@Component({
  selector: 'app-stat-card',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.role]': "cliquable() ? 'button' : null",
    '[attr.tabindex]': 'cliquable() ? 0 : null',
    '[attr.aria-expanded]': 'cliquable() ? ouvert() : null',
    '[class.est-cliquable]': 'cliquable()',
    '[class.est-ouvert]': 'ouvert()',
    '(click)': 'cliquable() && activer.emit()',
    '(keydown.enter)': 'cliquable() && activer.emit()',
    '(keydown.space)': 'cliquable() && activer.emit()',
  },
  template: `
    <div class="stat-tete">
      <span class="stat-icone"><app-icone [nom]="icone()" [taille]="18" /></span>
    </div>
    <p class="stat-libelle">{{ libelle() }}</p>
    <p class="stat-valeur">{{ valeur() }}</p>
    @if (detail(); as texte) {
      <p class="stat-detail">{{ texte }}</p>
    }
    @if (cliquable()) {
      <p class="stat-action">{{ ouvert() ? 'Masquer' : 'Voir' }}</p>
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

    :host(.est-cliquable) {
      cursor: pointer;
    }

    :host(.est-cliquable:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 2px;
    }

    :host(.est-ouvert) {
      border-color: var(--accent);
    }

    .stat-action {
      margin-top: 10px;
      font-size: 0.78rem;
      color: var(--accent);
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
      color: var(--accent);
      background: color-mix(in srgb, var(--accent-etat) 7%, transparent);
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
  readonly detail = input<string | null>(null);
  /** Rend la carte actionnable — elle ouvre alors un aperçu. */
  readonly cliquable = input(false);
  /** Aperçu actuellement déplié, pour l'état visuel et `aria-expanded`. */
  readonly ouvert = input(false);
  readonly activer = output<void>();
}
