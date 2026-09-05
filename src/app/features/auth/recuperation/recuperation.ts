import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Logo } from '../../../shared/ui/logo';

/**
 * Porte d'entrée du lien reçu par e-mail.
 *
 * Le bouton du message mène ici — sur TradingCorp — et non chez Supabase :
 * `…supabase.co/auth/v1/verify?token=…&type=recovery&redirect_to=…` s'affichait
 * au survol, apparaissait en clair dans le repli textuel du message, et donnait
 * à un e-mail de récupération l'allure d'un lien douteux.
 *
 * Surtout, ce lien-là ne marchait pas. En mode `pkce`, l'adresse produite par
 * `resetPasswordForEmail` n'a de sens que dans le navigateur ayant fait la
 * demande, qui y a déposé un secret. Pour un ancien élève dont l'administrateur
 * déclenche l'envoi, ce secret n'existe nulle part : selon le cas, le lien ne
 * menait à rien ou retombait sur l'accueil sans session.
 *
 * Ici, le jeton haché suffit — il vaut depuis n'importe quel appareil. La
 * session ouverte, on passe le relais à l'écran de choix du mot de passe.
 */
@Component({
  selector: 'app-recuperation',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: '../auth-forms.css',
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <app-logo class="auth-logo" [taille]="26" />

        @if (erreur(); as message) {
          <h1 class="auth-title">Ce lien n'est plus valable</h1>
          <p class="form-erreur" role="alert">{{ message }}</p>
          <p class="auth-sub">
            Les liens de récupération expirent au bout d'une heure et ne servent qu'une fois.
            Demandes-en un nouveau, il arrivera dans la minute.
          </p>
          <a class="btn btn-primary auth-submit" routerLink="/mot-de-passe-oublie">
            Recevoir un nouveau lien
          </a>
        } @else {
          <h1 class="auth-title">Récupération de ton compte</h1>
          <p class="auth-sub">Un instant, nous vérifions ton lien…</p>
        }
      </div>
    </div>
  `,
})
export class Recuperation {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly erreur = signal<string | null>(null);

  constructor() {
    void this.verifier();
  }

  private async verifier(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const jeton = params.get('token_hash');
    const type = params.get('type') ?? 'recovery';

    if (!jeton) {
      this.erreur.set('Ce lien est incomplet.');
      return;
    }

    const resultat = await this.auth.ouvrirSessionDepuisLien(jeton, type);
    if (!resultat.ok) {
      // Le serveur répond « Email link is invalid or has expired » — exact, mais
      // en anglais et sans issue. La cause importe peu ici : lien périmé, déjà
      // utilisé ou tronqué, le geste à faire est le même.
      this.erreur.set('Ce lien a expiré ou a déjà été utilisé.');
      return;
    }

    // La session est ouverte : le choix du mot de passe se fait sur l'écran
    // prévu pour cela, le même que pour un changement imposé.
    await this.router.navigateByUrl('/nouveau-mot-de-passe');
  }
}
