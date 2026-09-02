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
import { Logo } from '../../../shared/ui/logo';

/** Les deux champs mot de passe doivent correspondre. */
function mdpIdentiques(groupe: AbstractControl): ValidationErrors | null {
  const mdp = groupe.get('mdp')?.value;
  const confirmation = groupe.get('confirmation')?.value;
  return mdp && confirmation && mdp !== confirmation ? { mdpDifferents: true } : null;
}

/**
 * Réinitialisation du mot de passe, en deux temps sur le même écran.
 *
 * Cet écran manquait : la page de connexion ne proposait que « se connecter »,
 * « continuer avec Google » et « créer un compte ». Quelqu'un qui avait oublié
 * son mot de passe n'avait aucune issue — il ne pouvait pas non plus se
 * réinscrire, son adresse étant déjà prise.
 *
 * UN CODE, PAS UN LIEN. Le client Supabase est en `pkce` : le lien d'un e-mail
 * de réinitialisation ne vaut que dans le navigateur qui a fait la demande.
 * Demander depuis son ordinateur et ouvrir l'e-mail sur son téléphone — le
 * geste le plus courant qui soit — menait à un lien mort. Le code se recopie,
 * et tout se termine dans l'onglet resté ouvert.
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
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  /** `demande` : on saisit son adresse. `code` : on saisit le code reçu. */
  protected readonly etape = signal<'demande' | 'code'>('demande');

  protected readonly formEmail = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly formCode = this.fb.group(
    {
      // Six chiffres : la longueur exacte qu'envoie Supabase. La contrainte est
      // ici pour éviter un aller-retour serveur sur une saisie tronquée, pas
      // pour valider quoi que ce soit — c'est le serveur qui juge le code.
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      mdp: ['', [Validators.required, Validators.minLength(8)]],
      confirmation: ['', [Validators.required]],
    },
    { validators: mdpIdentiques },
  );

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
    // distinguerait « adresse inconnue » de « code envoyé » offrirait la liste
    // des clients à qui voudrait la deviner : il suffirait d'essayer des
    // adresses. On passe donc à l'étape suivante dans les deux cas.
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      return;
    }
    this.etape.set('code');
  }

  protected async valider(): Promise<void> {
    if (this.formCode.invalid) {
      this.formCode.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const { code, mdp } = this.formCode.getRawValue();
    const resultat = await this.auth.reinitialiserMotDePasse(
      this.formEmail.getRawValue().email,
      code,
      mdp,
    );
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      this.chargement.set(false);
      return;
    }
    // Le code a ouvert une session : la personne est déjà connectée.
    await this.router.navigateByUrl('/espace');
  }

  /** Retour à la saisie de l'adresse — typiquement une faute de frappe. */
  protected recommencer(): void {
    this.erreur.set(null);
    this.formCode.reset();
    this.etape.set('demande');
  }

  protected emailInvalide(): boolean {
    const ctrl = this.formEmail.controls.email;
    return ctrl.invalid && ctrl.touched;
  }

  protected invalide(nom: 'code' | 'mdp' | 'confirmation'): boolean {
    const ctrl = this.formCode.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }

  protected mdpDifferents(): boolean {
    return this.formCode.hasError('mdpDifferents') && this.formCode.controls.confirmation.touched;
  }
}
