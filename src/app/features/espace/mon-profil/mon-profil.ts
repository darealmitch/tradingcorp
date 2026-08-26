import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { DonneesPersonnellesService } from '../../../core/donnees-personnelles/donnees-personnelles.service';

/**
 * Espace personnel — et point d'exercice des droits RGPD.
 *
 * La page ne proposait qu'une déconnexion : aucun des droits des articles 15 à
 * 22 n'était exerçable sans écrire à un administrateur (audit RGPD §3.3). Elle
 * porte désormais les trois qui s'automatisent sans risque — accès et
 * portabilité, rectification, effacement.
 *
 * La suppression demande une confirmation explicite plutôt qu'un `confirm()` :
 * l'action est irréversible et déclenchée par la personne elle-même, elle doit
 * être délibérée. Limitation et opposition restent traitées sur demande, par
 * l'adresse indiquée dans la politique de confidentialité.
 */
@Component({
  selector: 'app-mon-profil',
  templateUrl: './mon-profil.html',
  styleUrls: ['../espace-pages.css', './mon-profil.css'],
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonProfil {
  private readonly router = inject(Router);
  private readonly donnees = inject(DonneesPersonnellesService);

  protected readonly auth = inject(AuthService);

  // ----- Rectification -----
  protected readonly editionOuverte = signal(false);
  protected readonly prenomSaisi = signal('');
  protected readonly nomSaisi = signal('');
  protected readonly enregistrement = signal(false);
  protected readonly messageIdentite = signal<string | null>(null);
  protected readonly identiteEnregistree = signal(false);

  // ----- Export -----
  protected readonly exportEnCours = signal(false);
  protected readonly messageExport = signal<string | null>(null);

  // ----- Suppression -----
  protected readonly suppressionDemandee = signal(false);
  protected readonly suppressionEnCours = signal(false);
  protected readonly messageSuppression = signal<string | null>(null);

  protected membreDepuis(): string {
    const date = this.auth.profil()?.date_creation;
    if (!date) {
      return '—';
    }
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(date));
  }

  protected ouvrirEdition(): void {
    const profil = this.auth.profil();
    this.prenomSaisi.set(profil?.prenom ?? '');
    this.nomSaisi.set(profil?.nom ?? '');
    this.messageIdentite.set(null);
    this.identiteEnregistree.set(false);
    this.editionOuverte.set(true);
  }

  protected annulerEdition(): void {
    this.editionOuverte.set(false);
    this.messageIdentite.set(null);
  }

  protected async enregistrerIdentite(): Promise<void> {
    this.enregistrement.set(true);
    this.messageIdentite.set(null);

    const erreur = await this.donnees.corrigerMonIdentite(this.prenomSaisi(), this.nomSaisi());

    this.enregistrement.set(false);
    if (erreur) {
      this.messageIdentite.set(erreur);
      return;
    }

    // Le profil vit dans un signal partagé : le relire évite que l'écran
    // affiche l'ancienne identité jusqu'au prochain chargement. `AuthService`
    // expose déjà exactement ce rechargement — inutile d'en écrire un second.
    await this.auth.rechargerProfil();
    this.editionOuverte.set(false);
    this.identiteEnregistree.set(true);
  }

  protected async telechargerMesDonnees(): Promise<void> {
    this.exportEnCours.set(true);
    this.messageExport.set(null);

    const donnees = await this.donnees.mesDonnees();

    this.exportEnCours.set(false);
    if (!donnees) {
      this.messageExport.set('L’export n’a pas pu être généré. Réessaie dans un instant.');
      return;
    }
    this.donnees.telecharger(donnees);
  }

  protected async confirmerSuppression(): Promise<void> {
    this.suppressionEnCours.set(true);
    this.messageSuppression.set(null);

    const erreur = await this.donnees.supprimerMonCompte();

    if (erreur) {
      this.suppressionEnCours.set(false);
      this.messageSuppression.set(erreur);
      return;
    }

    // Le compte n'existe plus : la session en cours ne pointe sur rien. On la
    // ferme avant de renvoyer sur l'accueil, sinon les gardes de route
    // s'appuieraient sur un jeton devenu orphelin.
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
