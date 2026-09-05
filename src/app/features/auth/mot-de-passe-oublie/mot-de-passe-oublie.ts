import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Logo } from '../../../shared/ui/logo';

/**
 * Demande d'un lien de récupération.
 *
 * Cet écran demandait autrefois de recopier un code à six chiffres, parce que
 * le lien d'alors ne valait que dans le navigateur ayant fait la demande — le
 * client est en `pkce`. Ce n'est plus le cas : l'e-mail porte maintenant un
 * jeton haché, valable depuis n'importe quel appareil, et le bouton mène à
 * `/recuperation`.
 *
 * Le champ « code » est donc retiré. Il réclamait ce qu'aucun e-mail n'envoyait
 * plus : le gabarit ne contient plus `{{ .Token }}`, seulement un lien. Un
 * écran qui demande un code introuvable est pire que pas d'écran du tout.
 *
 * Tout ce qui suit — date de naissance si elle manque, choix du mot de passe —
 * se passe désormais sur `/recuperation`, où le lien conduit.
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
  /** `demande` : on saisit son adresse. `envoye` : le lien est parti. */
  protected readonly etape = signal<'demande' | 'envoye'>('demande');

  protected readonly formEmail = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected async demander(): Promise<void> {
    if (this.formEmail.invalid) {
      this.formEmail.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const resultat = await this.auth.demanderReinitialisation(this.formEmail.getRawValue().email);
    this.chargement.set(false);

    // Une panne d'envoi se dit ; l'inexistence d'un compte, non. Un écran qui
    // distinguerait « adresse inconnue » de « lien envoyé » offrirait la liste
    // des clients à qui voudrait la deviner : il suffirait d'essayer des
    // adresses. On passe donc à l'étape suivante dans les deux cas.
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      return;
    }
    this.etape.set('envoye');
  }

  /** Retour à la saisie de l'adresse — typiquement une faute de frappe. */
  protected recommencer(): void {
    this.erreur.set(null);
    this.etape.set('demande');
  }

  protected emailInvalide(): boolean {
    const ctrl = this.formEmail.controls.email;
    return ctrl.invalid && ctrl.touched;
  }
}
