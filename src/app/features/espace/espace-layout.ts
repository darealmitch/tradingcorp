import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { Role } from '../../core/auth/profil.model';
import { Icone } from '../../shared/ui/icone';
import { Logo } from '../../shared/ui/logo';

interface ElementNav {
  libelle: string;
  icone: string;
  lien: string;
  /** Correspondance exacte pour l'état actif (nécessaire pour la racine). */
  exact?: boolean;
  /** Absent = visible pour tous les rôles. */
  roles?: Role[];
}

const ELEMENTS_NAV: ElementNav[] = [
  { libelle: 'Tableau de bord', icone: 'maison', lien: '/espace', exact: true },
  { libelle: 'Ma formation', icone: 'formation', lien: '/espace/formations', roles: ['apprenant'] },
  {
    libelle: 'Contenus',
    icone: 'contenus',
    lien: '/espace/contenus',
    roles: ['formateur', 'admin'],
  },
  {
    libelle: 'Apprenants',
    icone: 'apprenants',
    lien: '/espace/apprenants',
    roles: ['formateur', 'admin'],
  },
  {
    libelle: 'Modération',
    icone: 'moderation',
    lien: '/espace/moderation',
    roles: ['formateur', 'admin'],
  },
  { libelle: 'Utilisateurs', icone: 'profil', lien: '/espace/utilisateurs', roles: ['admin'] },
  { libelle: 'Paiements', icone: 'paiements', lien: '/espace/paiements', roles: ['admin'] },
  { libelle: 'Journal', icone: 'journal', lien: '/espace/journal', roles: ['admin'] },
  { libelle: 'Paramètres', icone: 'parametres', lien: '/espace/parametres', roles: ['admin'] },
];

@Component({
  selector: 'app-espace-layout',
  templateUrl: './espace-layout.html',
  styleUrl: './espace-layout.css',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceLayout {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationsService);

  /** Latérale réduite à ses icônes — réglage volontaire, sur grand écran. */
  protected readonly replie = signal(false);

  /**
   * Tiroir ouvert sur mobile. Sous 720 px la latérale sort du flux : la garder
   * ne serait-ce qu'en icônes ne laissait que ~267 px de contenu sur un
   * téléphone courant, trop peu pour des pages d'administration.
   */
  protected readonly tiroirOuvert = signal(false);

  protected readonly elements = computed(() => {
    const role = this.auth.role();
    return ELEMENTS_NAV.filter((e) => !e.roles || (role !== null && e.roles.includes(role)));
  });

  constructor() {
    // Naviguer referme le tiroir : sans cela il masquerait la page qu'on vient
    // justement de demander.
    this.router.events
      .pipe(
        filter((evenement) => evenement instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.tiroirOuvert.set(false));
  }

  protected basculer(): void {
    this.replie.update((valeur) => !valeur);
  }

  /** Échap referme le tiroir, quel que soit l'élément qui a le focus. */
  @HostListener('document:keydown.escape')
  protected fermerAuClavier(): void {
    this.fermerTiroir();
  }

  protected basculerTiroir(): void {
    this.tiroirOuvert.update((ouvert) => !ouvert);
  }

  protected fermerTiroir(): void {
    this.tiroirOuvert.set(false);
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
