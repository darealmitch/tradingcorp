import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Logo TradingCorp recréé EN CODE (aucun PNG) : « TRADING » en argenté
 * métallique, « CORP » au dégradé néon cyan→violet→magenta avec halo. Vectoriel
 * par le texte + les dégradés CSS → net à toute taille et parfaitement intégré
 * au thème. Réutilisable partout via `<app-logo [taille]="20" />` (taille = la
 * hauteur typographique en px ; tout le reste est proportionnel).
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

    /* TRADING — argenté métallique (dégradé vertical), display condensé. */
    .mot-trading {
      font-family: var(--font-title);
      font-weight: 400;
      background-image: linear-gradient(180deg, #f4f6fb 4%, #c6ccda 52%, #838c9f 100%);
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
