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
import { VerrouDefilement } from '../../core/defilement/verrou-defilement';

/**
 * La barre paraît quand un écran entier a été laissé derrière soi, et non à une
 * hauteur fixe : mesuré sur le site, le hero fait 752 px sur un iPhone et
 * 840 px sur un écran de bureau, ses boutons descendant jusqu'à 622 et 672 px.
 * Un seuil constant de 600 px la faisait donc surgir alors qu'un appel à
 * l'action était encore visible — à 22 px près sur mobile, en plein geste.
 * `innerHeight` dépasse le hero dans les deux cas et s'adapte à l'appareil.
 */
const seuilApparition = (): number => window.innerHeight;

/**
 * Elle ne se retire qu'en deçà d'une fraction de ce seuil. Sans cet écart, un
 * aller-retour de quatre pixels suffisait à la faire clignoter — et le
 * défilement par inertie, comme le rebond élastique d'iOS, traverse sans cesse
 * un point unique.
 */
const FRACTION_DISPARITION = 0.6;

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
    <aside class="barre-achat" [class.est-visible]="visible()" aria-label="Accès à la formation">
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
  `,
  styles: `
    /*
     * Masquée, la barre reste dans le DOM : une animation d'entrée n'a pas
     * d'équivalent en sortie, un élément retiré du DOM disparaissant d'un coup.
     * « visibility » la retire du parcours de tabulation et de l'arbre
     * d'accessibilité, et son changement est retardé jusqu'à la fin du
     * glissement pour ne pas l'escamoter à mi-course.
     */
    .barre-achat {
      position: fixed;
      inset: auto 0 0 0;
      transform: translateY(14px);
      opacity: 0;
      visibility: hidden;
      transition:
        transform 0.32s var(--ease-out),
        opacity 0.26s ease,
        visibility 0s linear 0.32s;
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
    }

    .barre-achat.est-visible {
      transform: translateY(0);
      opacity: 1;
      visibility: visible;
      transition:
        transform 0.32s var(--ease-out),
        opacity 0.22s ease,
        visibility 0s;
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

    @media (prefers-reduced-motion: reduce) {
      .barre-achat,
      .barre-achat.est-visible {
        transition: none;
      }
    }
  `,
})
export class BarreAchat {
  private readonly commerce = inject(CommerceService);
  private readonly verrou = inject(VerrouDefilement);

  protected readonly visible = signal(false);
  protected readonly prix = signal<string | null>(null);

  constructor() {
    const destroyRef = inject(DestroyRef);

    // `afterNextRender` : aucun accès à `window` ni au `body` avant le rendu,
    // le composant reste inoffensif au prérendu.
    afterNextRender(() => {
      // La marge basse est posée une fois pour toutes, dès le montage, et non
      // au moment où la barre paraît : la faire naître et mourir au fil du
      // défilement déplaçait la page de 76 px sous le doigt, à l'instant même
      // où la barre glissait — deux mouvements pour un seul geste. Elle ne
      // coûte rien tant qu'on n'est pas au bas de la page, et le bouton
      // « retour en haut » partage le même seuil d'apparition.
      document.body.classList.add('a-barre-achat');

      const surDefilement = (): void => {
        // Page figée derrière le menu mobile : `scrollY` retombe à zéro sans
        // que rien n'ait bougé. Sans cette garde, la barre se rétracterait à
        // l'ouverture du menu pour reparaître en glissant à la fermeture.
        if (this.verrou.estVerrouille()) {
          return;
        }
        const y = window.scrollY;
        const apparition = seuilApparition();
        const dejaVisible = this.visible();
        // Deux seuils selon l'état courant : c'est ce qui empêche l'oscillation.
        const doitParaitre = dejaVisible ? y > apparition * FRACTION_DISPARITION : y > apparition;
        if (doitParaitre !== dejaVisible) {
          this.visible.set(doitParaitre);
        }
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
