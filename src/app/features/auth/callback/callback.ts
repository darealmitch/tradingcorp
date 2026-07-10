import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Point de retour OAuth (Google, flux PKCE) : le client Supabase échange
 * automatiquement le `?code=` de l'URL contre une session ; cette page
 * attend son apparition puis redirige.
 */
@Component({
  selector: 'app-callback',
  template: `
    <div class="callback">
      <p>Connexion en cours…</p>
    </div>
  `,
  styles: [
    `
      .callback {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100svh;
        color: var(--muted);
        font-family: var(--font-display);
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Callback {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    void this.finaliser();
  }

  private async finaliser(): Promise<void> {
    const connecte = await this.auth.attendreSession(8000);
    if (connecte) {
      await this.auth.assurerProfil();
      await this.router.navigateByUrl('/espace');
    } else {
      await this.router.navigate(['/connexion'], {
        queryParams: { erreur: 'oauth' },
      });
    }
  }
}
