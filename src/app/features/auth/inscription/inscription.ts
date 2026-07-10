import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

/** Les deux champs mot de passe doivent correspondre. */
function mdpIdentiques(groupe: AbstractControl): ValidationErrors | null {
  const mdp = groupe.get('mdp')?.value;
  const confirmation = groupe.get('confirmation')?.value;
  return mdp && confirmation && mdp !== confirmation ? { mdpDifferents: true } : null;
}

@Component({
  selector: 'app-inscription',
  templateUrl: './inscription.html',
  styleUrl: '../auth-forms.css',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Inscription {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly confirmationRequise = signal(false);

  protected readonly form = this.fb.group(
    {
      prenom: ['', [Validators.required]],
      nom: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      mdp: ['', [Validators.required, Validators.minLength(8)]],
      confirmation: ['', [Validators.required]],
    },
    { validators: mdpIdentiques },
  );

  protected async soumettre(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const { prenom, nom, email, mdp } = this.form.getRawValue();
    const resultat = await this.auth.inscription(email, mdp, prenom.trim(), nom.trim());

    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      this.chargement.set(false);
      return;
    }
    if (resultat.confirmationRequise) {
      this.confirmationRequise.set(true);
      this.chargement.set(false);
      return;
    }
    await this.router.navigateByUrl('/espace');
  }

  protected async avecGoogle(): Promise<void> {
    this.erreur.set(null);
    const resultat = await this.auth.connexionGoogle();
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Connexion Google impossible.');
    }
  }

  protected invalide(nom: 'prenom' | 'nom' | 'email' | 'mdp' | 'confirmation'): boolean {
    const ctrl = this.form.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }

  protected mdpDifferents(): boolean {
    return this.form.hasError('mdpDifferents') && this.form.controls.confirmation.touched;
  }
}
