import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommerceService } from '../../core/commerce/commerce.service';

/**
 * Hauteur défilée au-delà de laquelle la barre paraît. Le hero mesure environ
 * un écran : à ce stade, ses boutons sont sortis du champ.
 */
const SEUIL_APPARITION = 600;

/**
 * Rappel d'achat posé en bas d'écran sur les pages de vente — l'accueil et
 * `/facteurs`.
 *
 * Mesurée sur un iPhone, la page d'accueil fait 16 834 px — près de vingt et un
 * écrans — et ses seuls appels à l'action se trouvent à 3 % et à 97 % du
 * défilement. Entre les deux, plus de quinze mille pixels sans aucun moyen
 * d'acheter : une visiteuse convaincue à mi-parcours n'a rien à cliquer. Le mal
 * est moindre sur grand écran, où l'en-tête reste visible, mais l'en-tête ne
 * dit pas le prix — et le prix n'est écrit nulle part ailleurs.
 *
 * Ce prix vient de la base, pas du code : la policy `formations_select_public`
 * l'ouvre aux visiteurs anonymes. Un tarif recopié en dur finirait par diverger
 * de celui que Stripe facture, et c'est la page de vente qui aurait tort.
 */
@Component({
  selector: 'app-barre-achat',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <aside class="barre-achat" aria-label="Accès à la formation">
        <div class="barre-achat-contenu">
          <p class="barre-achat-offre">
            @if (prix(); as montant) {
              <span class="barre-achat-prix">{{ montant }}</span>
            }
            <span class="barre-achat-mention">Accès à vie</span>
          </p>

          <a class="btn btn-primary barre-achat-action" routerLink="/inscription">Commencer</a>
        </div>
      </aside>
    }
  `,
  styles: `
    .barre-achat {
      position: fixed;
      inset: auto 0 0 0;
      /* Au-dessus du bouton « retour en haut » (40), sous l'en-tête et les
         superpositions du parcours. */
      z-index: 42;
      /* « env(safe-area-inset-bottom) » : sur les iPhone à barre gestuelle, sans
         ce complément le contenu se glisse sous la zone non tactile. */
      padding: 12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--line-strong);
      background: color-mix(in srgb, var(--surface) 92%, transparent);
      backdrop-filter: blur(14px);
      box-shadow: 0 -10px 30px rgb(0 0 0 / 22%);
      animation: barre-achat-entree 0.28s var(--ease-out) both;
    }

    /* Même gabarit que « .container » : sur grand écran, le prix et le bouton
       restent alignés sur le reste de la page au lieu de fuir vers les bords. */
    .barre-achat-contenu {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      width: min(100%, 1200px);
      margin-inline: auto;
    }

    .barre-achat-offre {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      line-height: 1.15;
    }

    .barre-achat-prix {
      font-family: var(--font-display);
      font-size: 1.32rem;
      font-weight: 700;
      color: var(--text);
    }

    .barre-achat-mention {
      font-size: 0.78rem;
      color: var(--muted);
    }

    /* 48 px : au-delà du minimum de 44 px recommandé pour une cible tactile, ce
       bouton étant la seule action de la barre. */
    .barre-achat-action {
      flex: 0 0 auto;
      min-height: 48px;
      padding-inline: 22px;
      white-space: nowrap;
    }

    @keyframes barre-achat-entree {
      from {
        transform: translateY(100%);
      }

      to {
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .barre-achat {
        animation: none;
      }
    }
  `,
})
export class BarreAchat {
  private readonly commerce = inject(CommerceService);

  protected readonly visible = signal(false);
  protected readonly prix = signal<string | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // `afterNextRender` : aucun accès à `window` ni au `body` avant le rendu,
    // le composant reste inoffensif au prérendu.
    afterNextRender(() => {
      const surDefilement = (): void => {
        const doitParaitre = window.scrollY > SEUIL_APPARITION;
        if (doitParaitre === this.visible()) {
          return;
        }
        this.visible.set(doitParaitre);
        // Le drapeau sert au pied de page et au bouton « retour en haut », que
        // la barre recouvrirait sinon. Voir `--hauteur-barre-achat`.
        document.body.classList.toggle('a-barre-achat', doitParaitre);
      };

      surDefilement();
      window.addEventListener('scroll', surDefilement, { passive: true });
      destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', surDefilement);
        document.body.classList.remove('a-barre-achat');
      });

      void this.chargerPrix();
    });
  }

  private async chargerPrix(): Promise<void> {
    const [formation] = await this.commerce.chargerFormations();
    if (!formation) {
      // Lecture en échec ou catalogue vide : la barre garde tout son sens sans
      // le prix. Le bouton est le seul élément dont on ne peut pas se passer.
      return;
    }

    const euros = formation.prix_centimes / 100;
    this.prix.set(
      new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: formation.devise.toUpperCase(),
        // Arrondir un prix à centimes l'afficherait plus bas qu'il n'est.
        maximumFractionDigits: Number.isInteger(euros) ? 0 : 2,
      }).format(euros),
    );
  }
}
