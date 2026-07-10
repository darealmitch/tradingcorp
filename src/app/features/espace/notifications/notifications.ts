import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

  protected dateEnvoi(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  }
}
