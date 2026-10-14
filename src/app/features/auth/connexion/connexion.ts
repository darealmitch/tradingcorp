import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService, GOOGLE_OAUTH_ACTIF } from '../../../core/auth/auth.service';
import { retourSur } from '../../../core/auth/retour';
import { Logo } from '../../../shared/ui/logo';

@Component({
  selector: 'app-connexion',
  templateUrl: './connexion.html',
  styleUrl: '../auth-forms.css',
  imports: [ReactiveFormsModule, RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Connexion {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly googleActif = GOOGLE_OAUTH_ACTIF;

  /** Destination après connexion : la page que la personne voulait ouvrir. */
  private readonly retour = retourSur(this.route.snapshot.queryParamMap.get('retour'));

  /** Lien « Créer un compte » : il garde la destination, pour l'acheteur sans compte. */
  protected readonly parametresRetour = this.retour ? { retour: this.retour } : {};

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    mdp: ['', [Validators.required]],
  });

  protected async soumettre(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const { email, mdp } = this.form.getRawValue();
    const resultat = await this.auth.connexion(email, mdp);

    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      this.chargement.set(false);
      return;
    }
    await this.router.navigateByUrl(this.retour ?? '/espace');
  }

  protected async avecGoogle(): Promise<void> {
    this.erreur.set(null);
    const resultat = await this.auth.connexionGoogle();
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Connexion Google impossible.');
    }
    // Si ok : redirection navigateur vers Google, puis retour sur /auth/callback.
  }

  protected invalide(nom: 'email' | 'mdp'): boolean {
    const ctrl = this.form.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }
}
