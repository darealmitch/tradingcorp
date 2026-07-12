import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { Role } from '../../core/auth/profil.model';
import { Icone } from '../../shared/ui/icone';

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
  {
    libelle: 'Mon parcours',
    icone: 'lecture',
    lien: '/espace/parcours',
    roles: ['apprenant', 'formateur', 'admin'],
  },
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceLayout {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly notifications = inject(NotificationsService);

  protected readonly replie = signal(false);

  protected readonly elements = computed(() => {
    const role = this.auth.role();
    return ELEMENTS_NAV.filter((e) => !e.roles || (role !== null && e.roles.includes(role)));
  });

  protected basculer(): void {
    this.replie.update((valeur) => !valeur);
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
