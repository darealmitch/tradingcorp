import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ComptesService } from '../../../core/comptes/comptes.service';
import { AccesFormation, ProfilAdmin } from '../../../core/comptes/comptes.model';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { Icone } from '../../../shared/ui/icone';

const ROLES: Role[] = ['apprenant', 'formateur', 'admin'];

const LIBELLES_ROLES: Record<Role, string> = {
  apprenant: 'Apprenant',
  formateur: 'Formateur',
  admin: 'Administrateur',
};

type Filtre = 'tous' | 'eleves' | 'equipe' | 'sans-acces' | 'en-attente';

/**
 * « Sans accès » et « Activation en attente » signalent ce qui attend un geste
 * de l'administrateur : leur compteur passe en ambre dès qu'il n'est pas nul.
 * C'est ainsi qu'une élève créée sans accès ne passe plus inaperçue.
 */
const FILTRES: { id: Filtre; libelle: string; signale: boolean }[] = [
  { id: 'tous', libelle: 'Tous', signale: false },
  { id: 'eleves', libelle: 'Élèves', signale: false },
  { id: 'equipe', libelle: 'Équipe', signale: false },
  { id: 'sans-acces', libelle: 'Sans accès', signale: true },
  { id: 'en-attente', libelle: 'Activation en attente', signale: true },
];

/** Durée d'affichage d'une confirmation, avant qu'elle ne s'efface d'elle-même. */
const DUREE_CONFIRMATION_MS = 6000;

/** Minuscules sans accents : « Léa » se trouve en tapant « lea ». */
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

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
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injecteur = inject(Injector);

  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLES;
  protected readonly filtres = FILTRES;

  protected readonly chargement = signal(true);
  protected readonly profils = signal<ProfilAdmin[]>([]);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly acces = signal<AccesFormation[]>([]);
  protected readonly enregistrement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly succes = signal<string | null>(null);

  protected readonly recherche = signal('');
  protected readonly filtre = signal<Filtre>('tous');

  /** Dernière ligne modifiée : elle s'éclaire un instant, là où l'on a cliqué. */
  protected readonly derniereModification = signal<string | null>(null);

  // Retrait d'un accès : confirmation exigée sur la ligne concernée.
  protected readonly retraitCle = signal<string | null>(null);

  protected readonly creationOuverte = signal(false);
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

  /** Nombre de comptes derrière chaque filtre, recalculé à chaque changement d'accès. */
  protected readonly comptesParFiltre = computed(() => {
    const profils = this.profils();
    return Object.fromEntries(
      FILTRES.map((f) => [f.id, profils.filter((p) => this.correspond(p, f.id)).length]),
    ) as Record<Filtre, number>;
  });

  /** Comptes affichés : le filtre choisi, puis la recherche sur le nom ou l'e-mail. */
  protected readonly profilsAffiches = computed(() => {
    const termes = normaliser(this.recherche().trim());
    const filtre = this.filtre();
    return this.profils().filter(
      (p) =>
        this.correspond(p, filtre) &&
        (!termes || normaliser(`${p.prenom} ${p.nom} ${p.email}`).includes(termes)),
    );
  });

  private minuterieSucces: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    void this.charger();
    inject(DestroyRef).onDestroy(() => this.arreterMinuterie());
  }

  private async charger(): Promise<void> {
    const [profils, formations, acces] = await Promise.all([
      this.comptes.lister(),
      this.commerce.chargerFormations(),
      this.comptes.listerAcces(),
    ]);
    this.profils.set(profils);
    this.formations.set(formations);
    this.acces.set(acces);
    this.chargement.set(false);
  }

  // ===== Recherche et filtres =====

  private correspond(profil: ProfilAdmin, filtre: Filtre): boolean {
    switch (filtre) {
      case 'eleves':
        return profil.role === 'apprenant';
      case 'equipe':
        return profil.role !== 'apprenant';
      case 'sans-acces':
        return profil.role === 'apprenant' && !this.aUnAcces(profil);
      case 'en-attente':
        return profil.doit_changer_mdp;
      default:
        return true;
    }
  }

  /** Un élève a accès dès qu'une formation lui est ouverte. */
  private aUnAcces(profil: ProfilAdmin): boolean {
    return this.acces().some((a) => a.id_profil === profil.id_profil && a.statut === 'active');
  }

  protected effacerFiltres(): void {
    this.recherche.set('');
    this.filtre.set('tous');
  }

  // ===== Présentation =====

  protected nomAffiche(profil: ProfilAdmin): string {
    return `${profil.prenom} ${profil.nom}`.trim() || profil.email;
  }

  protected initiales(profil: ProfilAdmin): string {
    const lettres = `${profil.prenom.trim().charAt(0)}${profil.nom.trim().charAt(0)}`;
    return (lettres || profil.email.charAt(0)).toUpperCase();
  }

  protected libelleRole(role: Role): string {
    return LIBELLES_ROLES[role] ?? role;
  }

  protected inscritLe(profil: ProfilAdmin): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
      new Date(profil.date_creation),
    );
  }

  /** Place le focus après le prochain rendu : l'élément visé n'existe pas encore. */
  private focaliser(selecteur: string): void {
    afterNextRender(() => this.hote.nativeElement.querySelector<HTMLElement>(selecteur)?.focus(), {
      injector: this.injecteur,
    });
  }

  /** Relance l'éclairage de la ligne, même si elle vient déjà d'être modifiée. */
  private marquerModifie(idProfil: string): void {
    this.derniereModification.set(null);
    afterNextRender(() => this.derniereModification.set(idProfil), { injector: this.injecteur });
  }

  private signalerSucces(message: string): void {
    this.arreterMinuterie();
    this.succes.set(message);
    this.minuterieSucces = setTimeout(() => this.succes.set(null), DUREE_CONFIRMATION_MS);
  }

  private reinitialiserRetours(): void {
    this.arreterMinuterie();
    this.erreur.set(null);
    this.succes.set(null);
  }

  private arreterMinuterie(): void {
    if (this.minuterieSucces !== null) {
      clearTimeout(this.minuterieSucces);
      this.minuterieSucces = null;
    }
  }

  // ===== Accès aux formations =====

  /** L'accès d'un élève à une formation : ouvert, retiré, ou jamais donné. */
  protected etatAcces(profil: ProfilAdmin, formation: Formation): 'active' | 'revoquee' | 'aucun' {
    return (
      this.acces().find(
        (a) => a.id_profil === profil.id_profil && a.id_formation === formation.id_formation,
      )?.statut ?? 'aucun'
    );
  }

  protected cleAcces(profil: ProfilAdmin, formation: Formation): string {
    return `${profil.id_profil}:${formation.id_formation}`;
  }

  /** La formation dont le retrait attend confirmation sur cette ligne, s'il y en a une. */
  protected formationEnRetrait(profil: ProfilAdmin): Formation | null {
    const cle = this.retraitCle();
    return cle ? (this.formations().find((f) => this.cleAcces(profil, f) === cle) ?? null) : null;
  }

  /** Donner l'accès se rattrape d'un clic : pas de confirmation. */
  protected donnerAcces(profil: ProfilAdmin, formation: Formation): Promise<void> {
    return this.definirAcces(profil, formation, true);
  }

  protected demanderRetrait(profil: ProfilAdmin, formation: Formation): void {
    this.reinitialiserRetours();
    this.suppressionId.set(null);
    this.retraitCle.set(this.cleAcces(profil, formation));
    this.focaliser('.ligne-confirmation .btn-annuler');
  }

  protected annulerRetrait(profil?: ProfilAdmin, formation?: Formation): void {
    this.retraitCle.set(null);
    if (profil && formation) {
      this.focaliser(`[data-action="retirer-${this.cleAcces(profil, formation)}"]`);
    }
  }

  protected async confirmerRetrait(profil: ProfilAdmin, formation: Formation): Promise<void> {
    await this.definirAcces(profil, formation, false);
    this.retraitCle.set(null);
  }

  private async definirAcces(
    profil: ProfilAdmin,
    formation: Formation,
    actif: boolean,
  ): Promise<void> {
    this.reinitialiserRetours();
    this.enregistrement.set(true);
    const erreur = await this.comptes.definirAcces(profil.id_profil, formation.id_formation, actif);
    if (erreur) {
      this.erreur.set(erreur);
      // L'autre administrateur a pu agir entre-temps : on se réaligne sur la base.
      this.acces.set(await this.comptes.listerAcces());
    } else {
      this.acces.update((liste) => [
        ...liste.filter(
          (a) => !(a.id_profil === profil.id_profil && a.id_formation === formation.id_formation),
        ),
        {
          id_profil: profil.id_profil,
          id_formation: formation.id_formation,
          statut: actif ? 'active' : 'revoquee',
        },
      ]);
      const nom = this.nomAffiche(profil);
      this.signalerSucces(
        actif
          ? `Accès ouvert : ${nom} peut suivre « ${formation.titre} » dès maintenant.`
          : `Accès retiré : ${nom} ne voit plus « ${formation.titre} ». Sa progression est conservée et reviendra avec l’accès.`,
      );
      this.marquerModifie(profil.id_profil);
    }
    this.enregistrement.set(false);
  }

  // ===== Création d'un compte =====

  protected ouvrirCreation(): void {
    this.creationOuverte.set(true);
    this.focaliser('#creation-prenom');
  }

  protected fermerCreation(): void {
    this.creationOuverte.set(false);
    this.erreurCreation.set(null);
    this.focaliser('.bouton-nouveau-compte');
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
      // Le formulaire se referme ; le mot de passe temporaire reste affiché
      // au-dessus de la liste, le temps de le transmettre.
      this.compteCree.set({ email: email.trim(), motDePasse: resultat.motDePasse });
      this.formCreation.reset({
        prenom: '',
        nom: '',
        email: '',
        role: 'apprenant',
        id_formation: '',
      });
      this.creationOuverte.set(false);
      this.focaliser('.compte-cree .btn-copier');
      const [profils, acces] = await Promise.all([
        this.comptes.lister(),
        this.comptes.listerAcces(),
      ]);
      this.profils.set(profils);
      this.acces.set(acces);
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

  protected masquerCompteCree(): void {
    this.compteCree.set(null);
    this.motDePasseCopie.set(false);
    this.focaliser('.bouton-nouveau-compte');
  }

  protected invalideEmail(): boolean {
    const ctrl = this.formCreation.controls.email;
    return ctrl.invalid && ctrl.touched;
  }

  // ===== Rôle, compte de test, identité =====

  protected async changerRole(profil: ProfilAdmin, role: string): Promise<void> {
    this.reinitialiserRetours();
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
      this.signalerSucces(
        `Rôle de ${this.nomAffiche(profil)} : ${this.libelleRole(role as Role)}.`,
      );
      this.marquerModifie(profil.id_profil);
    }
    this.enregistrement.set(false);
  }

  protected async basculerTest(profil: ProfilAdmin, estTest: boolean): Promise<void> {
    this.reinitialiserRetours();
    this.enregistrement.set(true);
    const erreur = await this.comptes.definirCompteTest(profil.id_profil, estTest);
    if (erreur) {
      this.erreur.set(erreur);
      this.profils.set(await this.comptes.lister());
    } else {
      this.profils.update((profils) =>
        profils.map((p) => (p.id_profil === profil.id_profil ? { ...p, est_test: estTest } : p)),
      );
      this.signalerSucces(
        estTest
          ? `${this.nomAffiche(profil)} est désormais un compte de test.`
          : `${this.nomAffiche(profil)} n’est plus un compte de test.`,
      );
      this.marquerModifie(profil.id_profil);
    }
    this.enregistrement.set(false);
  }

  protected ouvrirCorrection(profil: ProfilAdmin): void {
    this.correctionId.set(profil.id_profil);
    this.formCorrection.setValue({ prenom: profil.prenom, nom: profil.nom });
    this.focaliser('.correction input');
  }

  protected annulerCorrection(profil?: ProfilAdmin): void {
    this.correctionId.set(null);
    if (profil) {
      this.focaliser(`[data-action="corriger-${profil.id_profil}"]`);
    }
  }

  protected async enregistrerCorrection(profil: ProfilAdmin): Promise<void> {
    if (this.formCorrection.invalid) {
      this.formCorrection.markAllAsTouched();
      return;
    }
    this.reinitialiserRetours();
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
      this.signalerSucces(`Nom corrigé : ${prenom.trim()} ${nom.trim()}.`);
      this.marquerModifie(profil.id_profil);
    }
    this.enregistrement.set(false);
  }

  // ===== Suppression =====

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
    this.reinitialiserRetours();
    this.retraitCle.set(null);
    this.suppressionId.set(profil.id_profil);
    this.focaliser('.ligne-confirmation .btn-annuler');
  }

  protected annulerSuppression(profil?: ProfilAdmin): void {
    this.suppressionId.set(null);
    if (profil) {
      this.focaliser(`[data-action="supprimer-${profil.id_profil}"]`);
    }
  }

  /**
   * Suppression définitive du compte et de ses données liées. Le serveur reste
   * l'autorité (rôle admin, dernier administrateur, auto-suppression) : on se
   * contente de relayer son refus.
   */
  protected async confirmerSuppression(profil: ProfilAdmin): Promise<void> {
    this.reinitialiserRetours();
    this.suppressionEnCours.set(true);
    const erreur = await this.comptes.supprimer(profil.id_profil);
    if (erreur) {
      this.erreur.set(erreur);
      // Le refus peut venir d'un état devenu obsolète (rôle changé ailleurs).
      this.profils.set(await this.comptes.lister());
    } else {
      this.profils.update((profils) => profils.filter((p) => p.id_profil !== profil.id_profil));
      this.signalerSucces(`Compte de ${this.nomAffiche(profil)} supprimé.`);
    }
    this.suppressionId.set(null);
    this.suppressionEnCours.set(false);
  }
}
