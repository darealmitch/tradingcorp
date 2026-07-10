import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminService } from '../../../core/admin/admin.service';
import { ProfilAdmin } from '../../../core/admin/profil-admin.model';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';

const ROLES: Role[] = ['apprenant', 'formateur', 'admin'];

@Component({
  selector: 'app-utilisateurs',
  templateUrl: './utilisateurs.html',
  styleUrls: ['../espace-pages.css', './utilisateurs.css'],
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Utilisateurs {
  private readonly admin = inject(AdminService);
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

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [profils, formations] = await Promise.all([
      this.admin.listerProfils(),
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
    const resultat = await this.admin.creerCompte({
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
      this.profils.set(await this.admin.listerProfils());
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
    const erreur = await this.admin.changerRole(profil.id_profil, role as Role);
    if (erreur) {
      this.erreur.set(erreur);
      // Recharge pour réaligner le sélecteur sur la valeur réelle en base.
      this.profils.set(await this.admin.listerProfils());
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
    const erreur = await this.admin.definirCompteTest(profil.id_profil, estTest);
    if (erreur) {
      this.erreur.set(erreur);
      this.profils.set(await this.admin.listerProfils());
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
    const erreur = await this.admin.corrigerIdentite(profil.id_profil, prenom, nom);
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
