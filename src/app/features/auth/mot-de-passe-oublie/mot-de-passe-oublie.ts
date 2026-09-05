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
  /**
   * `demande` : on saisit son adresse. `code` : on saisit le code reçu.
   * `finalisation` : on choisit son mot de passe — précédé de la date de
   * naissance quand le profil l'ignore.
   */
  protected readonly etape = signal<'demande' | 'code' | 'finalisation'>('demande');

  /**
   * Vrai quand le profil rattaché au code n'a pas de date de naissance. Le cas
   * vient des comptes nés d'une connexion Google et des anciens élèves repris
   * de Wix, dont l'export n'en portait aucune. La récupération n'est alors pas
   * finie tant que la date n'est pas donnée : la formation s'adresse à des
   * adultes, et le serveur refuse tout profil de moins de dix-huit ans.
   */
  protected readonly dateNaissanceRequise = signal(false);

  protected readonly formEmail = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly formCode = this.fb.group({
    // Six chiffres : la longueur exacte qu'envoie Supabase. La contrainte est
    // ici pour éviter un aller-retour serveur sur une saisie tronquée, pas
    // pour valider quoi que ce soit — c'est le serveur qui juge le code.
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  protected readonly formFinalisation = this.fb.group(
    {
      dateNaissance: [''],
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

  protected async validerCode(): Promise<void> {
    if (this.formCode.invalid) {
      this.formCode.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const resultat = await this.auth.verifierCodeReinitialisation(
      this.formEmail.getRawValue().email,
      this.formCode.getRawValue().code,
    );
    this.chargement.set(false);
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      return;
    }

    // Le code a ouvert la session : le profil est lisible, on sait donc s'il
    // manque la date de naissance. Le staff en est dispensé — la règle des
    // dix-huit ans vise les apprenants.
    const profil = this.auth.profil();
    const requise = !!profil && profil.role === 'apprenant' && !profil.date_naissance;
    this.dateNaissanceRequise.set(requise);
    if (requise) {
      this.formFinalisation.controls.dateNaissance.setValidators([Validators.required]);
      this.formFinalisation.controls.dateNaissance.updateValueAndValidity();
    }
    this.etape.set('finalisation');
  }

  protected async finaliser(): Promise<void> {
    if (this.formFinalisation.invalid) {
      this.formFinalisation.markAllAsTouched();
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);

    const { dateNaissance, mdp } = this.formFinalisation.getRawValue();

    // La date d'abord : le mot de passe est le dernier geste, celui qui clôt la
    // récupération. Poser l'inverse laisserait un compte utilisable sans que la
    // majorité ait été établie.
    if (this.dateNaissanceRequise()) {
      const date = await this.auth.definirDateNaissance(dateNaissance);
      if (!date.ok) {
        this.erreur.set(date.erreur ?? 'Une erreur est survenue.');
        this.chargement.set(false);
        return;
      }
    }

    const resultat = await this.auth.definirNouveauMotDePasse(mdp);
    if (!resultat.ok) {
      this.erreur.set(resultat.erreur ?? 'Une erreur est survenue.');
      this.chargement.set(false);
      return;
    }
    // Le code avait déjà ouvert une session : la personne est connectée.
    await this.router.navigateByUrl('/espace');
  }

  /** Retour à la saisie de l'adresse — typiquement une faute de frappe. */
  protected recommencer(): void {
    this.erreur.set(null);
    this.formCode.reset();
    this.formFinalisation.reset();
    this.dateNaissanceRequise.set(false);
    this.etape.set('demande');
  }

  /** Bornes du sélecteur de date : dix-huit ans révolus, et rien d'invraisemblable. */
  protected readonly maxNaissance = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  protected readonly minNaissance = '1900-01-01';

  protected emailInvalide(): boolean {
    const ctrl = this.formEmail.controls.email;
    return ctrl.invalid && ctrl.touched;
  }

  protected codeInvalide(): boolean {
    const ctrl = this.formCode.controls.code;
    return ctrl.invalid && ctrl.touched;
  }

  protected invalide(nom: 'dateNaissance' | 'mdp' | 'confirmation'): boolean {
    const ctrl = this.formFinalisation.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }

  protected mdpDifferents(): boolean {
    return (
      this.formFinalisation.hasError('mdpDifferents') &&
      this.formFinalisation.controls.confirmation.touched
    );
  }
}
