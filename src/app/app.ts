import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
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
  }

  /** Le footer marketing n'a pas sa place dans les pages connectées (espace + parcours). */
  protected readonly pageInterne = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => {
        const url = evenement.urlAfterRedirects;
        return url.startsWith('/espace') || url.startsWith('/parcours');
      }),
    ),
    { initialValue: false },
  );
}
