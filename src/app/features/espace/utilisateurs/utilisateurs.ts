import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComptesService } from '../../../core/comptes/comptes.service';
import { ProfilAdmin } from '../../../core/comptes/comptes.model';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { Icone } from '../../../shared/ui/icone';

const ROLES: Role[] = ['apprenant', 'formateur', 'admin'];

@Component({
  selector: 'app-utilisateurs',
  templateUrl: './utilisateurs.html',
  styleUrls: ['../espace-pages.css', './utilisateurs.css'],
  imports: [ReactiveFormsModule, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Utilisateurs {
  private readonly comptes = inject(ComptesService);
  private readonly commerce = inject(CommerceService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLES;

  protected readonly chargement = signal(true);
  protected readonly profils = signal<ProfilAdmin[]>([]);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly enregistrement = signal(false);
  protected readonly erreur = signal<string | null>(null);

  protected readonly creationEnCours = signal(false);
  protected readonly erreurCreation = signal<string | null>(null);
  protected readonly compteCree = signal<{ email: string; motDePasse: string } | null>(null);
  protected readonly motDePasseCopie = signal(false);

  protected readonly formCreation = this.fb.group({
    prenom: [''],
    nom: [''],
    email: ['', [Validators.required, Validators.email]],
    role: ['apprenant' as 'apprenant' | 'formateur'],
    id_formation: [''],
  });

  // Correction du nom/prénom officiels (une ligne éditée à la fois).
  protected readonly correctionId = signal<string | null>(null);
  protected readonly formCorrection = this.fb.group({
    prenom: ['', [Validators.required]],
    nom: ['', [Validators.required]],
  });

  // Suppression définitive : confirmation exigée sur la ligne concernée.
  protected readonly suppressionId = signal<string | null>(null);
  protected readonly suppressionEnCours = signal(false);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [profils, formations] = await Promise.all([
      this.comptes.lister(),
      this.commerce.chargerFormations(),
    ]);
    this.profils.set(profils);
    this.formations.set(formations);
    this.chargement.set(false);
  }

  protected async creerCompte(): Promise<void> {
    if (this.formCreation.invalid) {
      this.formCreation.markAllAsTouched();
      return;
    }
    this.erreurCreation.set(null);
    this.compteCree.set(null);
    this.motDePasseCopie.set(false);
    this.creationEnCours.set(true);

    const { prenom, nom, email, role, id_formation } = this.formCreation.getRawValue();
    const resultat = await this.comptes.creer({
      email: email.trim(),
      prenom: prenom.trim(),
      nom: nom.trim(),
      role,
      id_formation: role === 'apprenant' && id_formation ? id_formation : null,
    });

    if (resultat.erreur || !resultat.motDePasse) {
      this.erreurCreation.set(resultat.erreur ?? 'La création du compte a échoué.');
    } else {
      this.compteCree.set({ email: email.trim(), motDePasse: resultat.motDePasse });
      this.formCreation.reset({
        prenom: '',
        nom: '',
        email: '',
        role: 'apprenant',
        id_formation: '',
      });
      this.profils.set(await this.comptes.lister());
    }
    this.creationEnCours.set(false);
  }

  protected async copierMotDePasse(): Promise<void> {
    const compte = this.compteCree();
    if (compte) {
      await navigator.clipboard.writeText(compte.motDePasse);
      this.motDePasseCopie.set(true);
    }
  }

  protected async changerRole(profil: ProfilAdmin, role: string): Promise<void> {
    this.erreur.set(null);
    this.enregistrement.set(true);
    const erreur = await this.comptes.changerRole(profil.id_profil, role as Role);
    if (erreur) {
      this.erreur.set(erreur);
      // Recharge pour réaligner le sélecteur sur la valeur réelle en base.
      this.profils.set(await this.comptes.lister());
    } else {
      this.profils.update((profils) =>
        profils.map((p) => (p.id_profil === profil.id_profil ? { ...p, role: role as Role } : p)),
      );
    }
    this.enregistrement.set(false);
  }

  protected async basculerTest(profil: ProfilAdmin, estTest: boolean): Promise<void> {
    this.erreur.set(null);
    this.enregistrement.set(true);
    const erreur = await this.comptes.definirCompteTest(profil.id_profil, estTest);
    if (erreur) {
      this.erreur.set(erreur);
      this.profils.set(await this.comptes.lister());
    } else {
      this.profils.update((profils) =>
        profils.map((p) => (p.id_profil === profil.id_profil ? { ...p, est_test: estTest } : p)),
      );
    }
    this.enregistrement.set(false);
  }

  protected ouvrirCorrection(profil: ProfilAdmin): void {
    this.correctionId.set(profil.id_profil);
    this.formCorrection.setValue({ prenom: profil.prenom, nom: profil.nom });
  }

  protected annulerCorrection(): void {
    this.correctionId.set(null);
  }

  protected async enregistrerCorrection(profil: ProfilAdmin): Promise<void> {
    if (this.formCorrection.invalid) {
      this.formCorrection.markAllAsTouched();
      return;
    }
    this.erreur.set(null);
    this.enregistrement.set(true);
    const { prenom, nom } = this.formCorrection.getRawValue();
    const erreur = await this.comptes.corrigerIdentite(profil.id_profil, prenom, nom);
    if (erreur) {
      this.erreur.set(erreur);
    } else {
      this.profils.update((profils) =>
        profils.map((p) =>
          p.id_profil === profil.id_profil ? { ...p, prenom: prenom.trim(), nom: nom.trim() } : p,
        ),
      );
      this.correctionId.set(null);
    }
    this.enregistrement.set(false);
  }

  /**
   * Reflet de la règle appliquée par l'Edge Function : un administrateur ne se
   * supprime que par le compte propriétaire. Purement cosmétique — c'est le
   * serveur qui tranche, l'interface évite seulement un refus prévisible.
   */
  protected peutSupprimer(profil: ProfilAdmin): boolean {
    if (profil.id_profil === this.auth.profil()?.id_profil) {
      return false;
    }
    return profil.role !== 'admin' || (this.auth.profil()?.est_proprietaire ?? false);
  }

  protected demanderSuppression(profil: ProfilAdmin): void {
    this.erreur.set(null);
    this.suppressionId.set(profil.id_profil);
  }

  protected annulerSuppression(): void {
    this.suppressionId.set(null);
  }

  /**
   * Suppression définitive du compte et de ses données liées. Le serveur reste
   * l'autorité (rôle admin, dernier administrateur, auto-suppression) : on se
   * contente de relayer son refus.
   */
  protected async confirmerSuppression(profil: ProfilAdmin): Promise<void> {
    this.erreur.set(null);
    this.suppressionEnCours.set(true);
    const erreur = await this.comptes.supprimer(profil.id_profil);
    if (erreur) {
      this.erreur.set(erreur);
      // Le refus peut venir d'un état devenu obsolète (rôle changé ailleurs).
      this.profils.set(await this.comptes.lister());
    } else {
      this.profils.update((profils) => profils.filter((p) => p.id_profil !== profil.id_profil));
    }
    this.suppressionId.set(null);
    this.suppressionEnCours.set(false);
  }

  protected inscritLe(profil: ProfilAdmin): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
      new Date(profil.date_creation),
    );
  }

  protected invalideEmail(): boolean {
    const ctrl = this.formCreation.controls.email;
    return ctrl.invalid && ctrl.touched;
  }
}
