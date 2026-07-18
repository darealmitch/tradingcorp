import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService, GOOGLE_OAUTH_ACTIF } from '../../../core/auth/auth.service';

/** Les deux champs mot de passe doivent correspondre. */
function mdpIdentiques(groupe: AbstractControl): ValidationErrors | null {
  const mdp = groupe.get('mdp')?.value;
  const confirmation = groupe.get('confirmation')?.value;
  return mdp && confirmation && mdp !== confirmation ? { mdpDifferents: true } : null;
}

/** L'utilisateur doit avoir au moins `min` ans à la date du jour. */
function ageMinimum(min: number): (ctrl: AbstractControl) => ValidationErrors | null {
  return (ctrl) => {
    const valeur: string = ctrl.value;
    if (!valeur) {
      return null; // `required` gère l'absence de valeur.
    }
    const naissance = new Date(valeur);
    if (Number.isNaN(naissance.getTime())) {
      return { mineur: true };
    }
    const seuil = new Date();
    seuil.setFullYear(seuil.getFullYear() - min);
    return naissance.getTime() > seuil.getTime() ? { mineur: true } : null;
  };
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

  protected readonly googleActif = GOOGLE_OAUTH_ACTIF;

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly confirmationRequise = signal(false);

  protected readonly form = this.fb.group(
    {
      prenom: ['', [Validators.required]],
      nom: ['', [Validators.required]],
      dateNaissance: ['', [Validators.required, ageMinimum(18)]],
      email: ['', [Validators.required, Validators.email]],
      mdp: ['', [Validators.required, Validators.minLength(8)]],
      confirmation: ['', [Validators.required]],
    },
    { validators: mdpIdentiques },
  );

  /** Date maximale saisissable : aujourd'hui moins 18 ans (borne l'UX du champ). */
  protected readonly dateMaxMajeur = this.calculerDateMaxMajeur();

  protected async soumettre(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const { prenom, nom, dateNaissance, email, mdp } = this.form.getRawValue();
    const resultat = await this.auth.inscription(
      email,
      mdp,
      prenom.trim(),
      nom.trim(),
      dateNaissance,
    );

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

  protected invalide(
    nom: 'prenom' | 'nom' | 'dateNaissance' | 'email' | 'mdp' | 'confirmation',
  ): boolean {
    const ctrl = this.form.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }

  protected mineur(): boolean {
    const ctrl = this.form.controls.dateNaissance;
    return ctrl.hasError('mineur') && ctrl.touched;
  }

  protected mdpDifferents(): boolean {
    return this.form.hasError('mdpDifferents') && this.form.controls.confirmation.touched;
  }

  private calculerDateMaxMajeur(): string {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 18);
    return date.toISOString().slice(0, 10);
  }
}
