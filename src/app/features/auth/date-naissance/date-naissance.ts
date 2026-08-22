import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Logo } from '../../../shared/ui/logo';

/**
 * Réclame la date de naissance aux comptes qui n'en ont pas — en pratique ceux
 * créés par connexion Google, qui n'ont jamais traversé le formulaire
 * d'inscription. Tant qu'elle manque, `dateNaissanceGuard` ramène ici.
 *
 * La validation de majorité affichée sous le champ n'est qu'un confort : la
 * règle qui fait foi est celle de la RPC `definir_date_naissance`, côté
 * serveur, et le message d'erreur remonté vient d'elle.
 */
@Component({
  selector: 'app-date-naissance',
  templateUrl: './date-naissance.html',
  styleUrl: '../auth-forms.css',
  imports: [ReactiveFormsModule, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DateNaissance {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);

  /** Borne haute du sélecteur : aujourd'hui, pour écarter les dates futures. */
  protected readonly maximum = new Date().toISOString().slice(0, 10);

  protected readonly form = this.fb.group({
    date: ['', [Validators.required]],
  });

  protected async soumettre(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const resultat = await this.auth.definirDateNaissance(this.form.getRawValue().date);
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      this.chargement.set(false);
      return;
    }
    await this.router.navigateByUrl('/espace');
  }

  protected invalide(): boolean {
    const ctrl = this.form.controls.date;
    return ctrl.invalid && ctrl.touched;
  }

  /** Déconnexion : seule porte de sortie pour qui ne veut pas la renseigner. */
  protected async quitter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
