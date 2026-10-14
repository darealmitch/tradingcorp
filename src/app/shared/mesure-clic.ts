import { Directive, EnvironmentInjector, inject, input } from '@angular/core';
import type { BoutonMesure } from '../core/mesure/mesure.model';

/**
 * Compte les clics sur un bouton d'appel à l'action :
 * `<a appMesureClic="hero" routerLink="/inscription">`.
 *
 * Le nom du bouton est typé : un nom absent de `BOUTONS_MESURES` — donc
 * inconnu de la base, qui l'ignorerait sans rien dire — ne compile pas.
 *
 * Le service de mesure est importé au premier clic : l'en-tête, qui porte un
 * de ces boutons, fait partie du chargement initial, et ce chargement a un
 * budget. Les liens mesurés restent dans l'application : la page ne se
 * décharge pas avant que l'envoi parte.
 */
@Directive({
  selector: '[appMesureClic]',
  host: { '(click)': 'compter()' },
})
export class MesureClic {
  readonly appMesureClic = input.required<BoutonMesure>();

  /**
   * L'injecteur d'environnement, et non celui de l'élément : le bouton qui
   * mène ailleurs est détruit par la navigation qu'il déclenche, avant que
   * l'import du service ait abouti. Le service, lui, vit à la racine.
   */
  private readonly injecteur = inject(EnvironmentInjector);

  protected compter(): void {
    const bouton = this.appMesureClic();
    void import('../core/mesure/mesure.service')
      .then((m) => this.injecteur.get(m.MesureService).clic(bouton))
      .catch(() => {
        // Application fermée entre-temps : il n'y a plus rien à compter.
      });
  }
}
