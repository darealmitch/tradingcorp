import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo TradingCorp recréé EN CODE (aucun PNG) : « TRADING » en métallique,
 * « CORP » au dégradé néon cyan→violet→magenta avec halo. Vectoriel par le
 * texte + les dégradés CSS → net à toute taille et parfaitement intégré au
 * thème. Réutilisable partout via `<app-logo [taille]="20" />` (taille = la
 * hauteur typographique en px ; tout le reste est proportionnel).
 *
 * Bi-thème : seul « TRADING » change (--logo-trading), car l'argenté serait
 * illisible sur fond clair. Le néon de « CORP » reste identique partout.
 *
 * Le favicon reste le PNG d'origine — ce composant ne concerne que l'UI.
 */
@Component({
  selector: 'app-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="logo" [style.font-size.px]="taille()" aria-label="TradingCorp">
    <span class="mot-trading">TRADING</span>
    <span class="mot-corp">CORP</span>
  </span>`,
  styles: `
    :host {
      display: inline-flex;
      line-height: 0;
    }

    .logo {
      align-items: baseline;
      gap: 0.32em;
      line-height: 1;
      white-space: nowrap;
      user-select: none;
    }

    .mot-trading,
    .mot-corp {
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      letter-spacing: 0.02em;
    }

    /* TRADING — métallique (dégradé vertical), display condensé. Le dégradé
       suit le thème via --logo-trading : argenté sur fond sombre, métal sombre
       sur fond clair (mêmes paliers, valeurs inversées). Voir styles.css. */
    .mot-trading {
      font-family: var(--font-title);
      font-weight: 400;
      background-image: var(--logo-trading);
    }

    /* CORP — dégradé néon de marque + halo lumineux. */
    .mot-corp {
      font-family: var(--font-title);
      font-weight: 700;
      background-image: var(--gradient);
      filter: drop-shadow(0 0 0.14em color-mix(in srgb, var(--violet) 55%, transparent));
    }
  `,
})
export class Logo {
  /** Hauteur typographique en pixels (le logo se met à l'échelle autour). */
  readonly taille = input(22);
}
