import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { Logo } from '../../../shared/ui/logo';

/** Les deux champs mot de passe doivent correspondre. */
function mdpIdentiques(groupe: AbstractControl): ValidationErrors | null {
  const mdp = groupe.get('mdp')?.value;
  const confirmation = groupe.get('confirmation')?.value;
  return mdp && confirmation && mdp !== confirmation ? { mdpDifferents: true } : null;
}

@Component({
  selector: 'app-nouveau-mdp',
  templateUrl: './nouveau-mdp.html',
  styleUrl: '../auth-forms.css',
  imports: [ReactiveFormsModule, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NouveauMdp {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);

  /**
   * Vrai quand la venue ici est imposée (mot de passe temporaire posé par un
   * administrateur), faux quand elle vient d'une réinitialisation demandée.
   * Ne change que le texte : le geste et sa vérification sont les mêmes.
   */
  protected readonly changementImpose = computed(() => !!this.auth.profil()?.doit_changer_mdp);

  /**
   * Vrai quand le profil ignore sa date de naissance. Le cas vient des comptes
   * nés d'une connexion Google et des anciens élèves repris de Wix, dont
   * l'export n'en portait aucune. La récupération n'est pas finie tant qu'elle
   * n'est pas donnée : la formation s'adresse à des adultes, et le serveur
   * refuse tout profil de moins de dix-huit ans.
   */
  protected readonly dateNaissanceRequise = computed(() => {
    const profil = this.auth.profil();
    return !!profil && profil.role === 'apprenant' && !profil.date_naissance;
  });

  /** Bornes du sélecteur : dix-huit ans révolus, et rien d'invraisemblable. */
  protected readonly maxNaissance = new Date(Date.now() - 18 * 365.25 * 24 * 3600 * 1000)
    .toISOString()
    .slice(0, 10);
  protected readonly minNaissance = '1900-01-01';

  protected readonly form = this.fb.group(
    {
      dateNaissance: [''],
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
    const { dateNaissance, mdp } = this.form.getRawValue();
    if (this.dateNaissanceRequise() && !dateNaissance) {
      this.erreur.set('Renseigne ta date de naissance pour continuer.');
      return;
    }

    this.chargement.set(true);
    this.erreur.set(null);

    // La date d'abord : le mot de passe est le dernier geste, celui qui clôt la
    // récupération. L'inverse laisserait un compte utilisable sans que la
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
    await this.router.navigateByUrl('/espace');
  }

  protected invalide(nom: 'dateNaissance' | 'mdp' | 'confirmation'): boolean {
    const ctrl = this.form.controls[nom];
    return ctrl.invalid && ctrl.touched;
  }

  protected mdpDifferents(): boolean {
    return this.form.hasError('mdpDifferents') && this.form.controls.confirmation.touched;
  }
}
