import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { Footer } from './layout/footer/footer';
import { Header } from './layout/header/header';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Header, Footer],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly router = inject(Router);

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
