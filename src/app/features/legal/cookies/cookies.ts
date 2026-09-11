import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentementService } from '../../../core/consentement/consentement.service';

@Component({
  selector: 'app-cookies',
  templateUrl: './cookies.html',
  styleUrls: ['../legal.css'],
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cookies {
  /** Le choix se modifie depuis la page même qui l'explique. */
  protected readonly consentement = inject(ConsentementService);
}
