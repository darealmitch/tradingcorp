import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AccesDonnees } from '../../core/supabase/acces-donnees';
import { Icone } from './icone';

/**
 * Bandeau « données indisponibles ».
 *
 * Une lecture qui échoue rend une liste vide ou un zéro : à l'écran, une
 * plateforme en panne ressemble alors trait pour trait à une plateforme vide.
 * Un tableau de bord affichant « 0 apprenant » est le cas le plus trompeur —
 * il a l'air de fonctionner.
 *
 * Ce bandeau lève l'ambiguïté d'un seul endroit, pour tous les écrans : dès
 * qu'une lecture a échoué dans la session, il dit que ce qui est affiché est
 * peut-être incomplet, et propose de recharger. Il ne remplace pas les
 * messages d'action (« la modération a échoué ») qui, eux, sont rendus au
 * point où l'utilisateur a cliqué.
 */
@Component({
  selector: 'app-bandeau-incident',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (acces.lectureEnEchec()) {
      <div class="bandeau-incident" role="status">
        <app-icone nom="alerte" [taille]="18" />
        <p>Certaines données n’ont pas pu être chargées. Ce qui s’affiche peut être incomplet.</p>
        <button type="button" (click)="recharger()">Recharger</button>
      </div>
    }
  `,
  styles: `
    .bandeau-incident {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      z-index: 60;
      display: flex;
      align-items: center;
      gap: 12px;
      max-width: 640px;
      margin: 0 auto;
      padding: 12px 16px;
      border: 1px solid rgba(255, 92, 122, 0.45);
      border-radius: 14px;
      background: var(--surface);
      box-shadow: var(--shadow);
      color: var(--text);
    }

    .bandeau-incident app-icone {
      color: var(--down-text);
      flex: none;
    }

    .bandeau-incident p {
      margin: 0;
      flex: 1;
      font-size: 0.9rem;
    }

    .bandeau-incident button {
      flex: none;
      padding: 7px 14px;
      border: 1px solid var(--line-strong);
      border-radius: 999px;
      background: transparent;
      color: var(--text);
      font: inherit;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .bandeau-incident button:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .bandeau-incident button:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }

    /* Le bouton « retour en haut » occupe déjà le coin inférieur droit : sur
       petit écran, le bandeau passe au-dessus plutôt que dessous. */
    @media (max-width: 640px) {
      .bandeau-incident {
        bottom: 74px;
        flex-wrap: wrap;
      }
    }
  `,
})
export class BandeauIncident {
  protected readonly acces = inject(AccesDonnees);

  /**
   * Rechargement complet plutôt que nouvelle tentative ciblée : l'incident
   * peut venir de n'importe laquelle des lectures de la page, et rejouer
   * seulement la dernière laisserait les autres dans leur état dégradé.
   */
  protected recharger(): void {
    location.reload();
  }
}
