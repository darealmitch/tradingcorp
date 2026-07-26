import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NotificationsService } from '../../../core/notifications/notifications.service';
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

  protected readonly suiviNonLues = computed(
    () => this.notifications.suivi().filter((n) => !n.lue).length,
  );

  protected dateEnvoi(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}
