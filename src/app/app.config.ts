import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withInMemoryScrolling } from '@angular/router';

import { ConsentementService } from './core/consentement/consentement.service';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      // Défilement vers les ancres (#section) même en changeant de page.
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
    ),
    provideHttpClient(withFetch()),
    // Le gestionnaire de consentement démarre avec l'application, sans attendre
    // qu'un écran l'injecte : la bannière doit pouvoir s'afficher dès la
    // première page, quelle qu'elle soit.
    provideAppInitializer(() => {
      inject(ConsentementService);
    }),
  ],
};
