import { ChangeDetectionStrategy, Component, DestroyRef, Injector, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { PresenceService } from './core/presence/presence.service';
import { UrlCanoniqueService } from './core/seo/url-canonique.service';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';
import { BandeauIncident } from './shared/ui/bandeau-incident';
import { RetourHaut } from './shared/ui/retour-haut';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer, RetourHaut, BandeauIncident],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);

  constructor() {
    // La même application est publiée à trois adresses ; cette balise dit
    // laquelle fait foi. Démarré ici plutôt que dans le service lui-même :
    // injecter un service pour son seul effet de bord se lit mal, et se
    // supprime par mégarde au premier nettoyage d'imports.
    inject(UrlCanoniqueService).demarrer();
    // Le signal de présence des élèves, pour l'écran « Connectés » : ici et
    // non dans l'espace, car le lecteur de leçons vit hors de son gabarit.
    inject(PresenceService).demarrer();
    // Vues des pages de vente, comptées sans cookie ni identifiant. Importée
    // à la demande : le chargement initial a un budget, et la mesure peut
    // attendre — `demarrer` compte aussi la page déjà affichée.
    const injecteur = inject(Injector);
    let detruite = false;
    inject(DestroyRef).onDestroy(() => (detruite = true));
    // L'adresse d'arrivée est lue MAINTENANT : quand le service sera chargé,
    // une redirection de route peut en avoir effacé les paramètres de campagne.
    const arrivee = { recherche: location.search, referent: document.referrer };
    void import('./core/mesure/mesure.service').then((m) => {
      if (!detruite) {
        injecteur.get(m.MesureService).demarrer(arrivee);
      }
    });
    // La description de chaque page pour les moteurs de recherche : à la
    // demande elle aussi, ses textes n'ont rien à faire dans le chargement
    // initial.
    void import('./core/seo/description-page.service').then((m) => {
      if (!detruite) {
        injecteur.get(m.DescriptionPageService).demarrer();
      }
    });
  }

  /**
   * Le footer marketing n'a pas sa place dans les pages connectées (espace +
   * parcours).
   *
   * `null` tant que la première navigation n'est pas terminée : le footer
   * attend la page. Il s'affichait sinon seul en haut de l'écran pendant le
   * chargement de l'accueil, puis la page le repoussait d'un coup vers le bas
   * — le premier écran d'un visiteur mobile était le pied de page, et ce saut
   * suffisait à porter le décalage de mise en page (CLS) mesuré à 1,0.
   */
  protected readonly pageInterne = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => {
        const url = evenement.urlAfterRedirects;
        return url.startsWith('/espace') || url.startsWith('/parcours');
      }),
    ),
    { initialValue: null },
  );
}
