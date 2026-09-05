import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommerceService } from '../../../core/commerce/commerce.service';

/**
 * Hauteur défilée au-delà de laquelle la barre paraît. Le hero mesure environ
 * un écran : à ce stade, ses deux boutons sont sortis du champ.
 */
const SEUIL_APPARITION = 600;

/**
 * Rappel d'achat posé en bas d'écran, sur mobile seulement.
 *
 * Mesurée sur un iPhone, la page d'accueil fait 16 834 px — près de vingt et un
 * écrans — et ses seuls appels à l'action se trouvent à 3 % et à 97 % du
 * défilement. Entre les deux, plus de quinze mille pixels sans aucun moyen
 * d'acheter : une visiteuse convaincue à mi-parcours n'a rien à cliquer.
 *
 * Le prix vient de la base plutôt que du code — la policy
 * `formations_select_public` l'ouvre aux visiteurs anonymes. Un tarif recopié
 * en dur finirait par diverger de celui que Stripe facture, et c'est la page
 * de vente qui aurait tort.
 */
@Component({
  selector: 'app-barre-achat',
  templateUrl: './barre-achat.html',
  styleUrl: './barre-achat.css',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
