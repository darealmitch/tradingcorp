import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Logo } from '../../../shared/ui/logo';

/**
 * Demande de réinitialisation du mot de passe.
 *
 * Cet écran manquait : la page de connexion ne proposait que « se connecter »,
 * « continuer avec Google » et « créer un compte ». Quelqu'un qui avait oublié
 * son mot de passe n'avait aucune issue — il ne pouvait pas non plus se
 * réinscrire, son adresse étant déjà prise.
 */
@Component({
  selector: 'app-mot-de-passe-oublie',
  templateUrl: './mot-de-passe-oublie.html',
  styleUrl: '../auth-forms.css',
  imports: [ReactiveFormsModule, RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MotDePasseOublie {
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoye = signal(false);

  protected readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async soumettre(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const resultat = await this.auth.demanderReinitialisation(this.form.getRawValue().email);
    this.chargement.set(false);

    // Une panne d'envoi se dit ; l'inexistence d'un compte, non. Supabase rend
    // d'ailleurs le même succès dans les deux cas, et c'est volontaire de sa
    // part comme de la nôtre : un écran qui distinguerait « adresse inconnue »
    // de « e-mail envoyé » offrirait à qui veut la liste des clients — il
    // suffirait d'essayer des adresses. Le message ci-dessous ne dit donc rien
    // de plus que ce que l'utilisateur légitime a besoin de savoir.
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      return;
    }
    this.envoye.set(true);
  }

  protected invalide(): boolean {
    const ctrl = this.form.controls.email;
    return ctrl.invalid && ctrl.touched;
  }
}
