import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  Notification,
  NotificationsService,
} from '../../../core/notifications/notifications.service';
import { Icone } from '../../../shared/ui/icone';

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications.html',
  styleUrls: ['../espace-pages.css', './notifications.css'],
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Notifications {
  protected readonly notifications = inject(NotificationsService);
  private readonly router = inject(Router);

  protected readonly suiviNonLues = computed(
    () => this.notifications.suivi().filter((n) => !n.lue).length,
  );

  /**
   * Un clic marque la notification comme lue et, quand elle concerne une page
   * — la leçon d'une réponse de l'équipe, la liste des apprenants —, l'ouvre :
   * c'est par là qu'un élève retrouve l'échange privé qu'on lui a adressé.
   *
   * Seuls les chemins internes sont suivis. Le lien vient de la base : il ne
   * doit jamais pouvoir mener hors du site.
   */
  protected async ouvrir(notification: Notification): Promise<void> {
    void this.notifications.marquerLue(notification.id_notification);
    const lien = notification.lien;
    if (lien?.startsWith('/') && !lien.startsWith('//')) {
      await this.router.navigateByUrl(lien);
    }
  }

  protected dateEnvoi(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}
