import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ConsentementService } from '../../core/consentement/consentement.service';
import { Logo } from '../../shared/ui/logo';

@Component({
  selector: 'app-footer',
  templateUrl: './footer.html',
  styleUrl: './footer.css',
  imports: [RouterLink, Logo],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Footer {
  protected readonly year = new Date().getFullYear();

  /**
   * Point d'entrée du retrait, joignable depuis toutes les pages.
   *
   * Retirer son accord doit être aussi simple que de le donner (RGPD art. 7.3).
   * Le lien n'apparaît que si le gestionnaire répond : proposer un bouton qui
   * n'ouvre rien serait pire que de ne rien proposer.
   */
  protected readonly consentement = inject(ConsentementService);
}
