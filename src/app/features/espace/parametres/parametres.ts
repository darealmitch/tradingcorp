import { ChangeDetectionStrategy, Component } from '@angular/core';
import { GOOGLE_OAUTH_ACTIF } from '../../../core/auth/auth.service';

/**
 * Réglages de la plateforme, en lecture seule.
 *
 * La page n'affiche que ce dont l'application connaît l'état par elle-même.
 * Elle annonçait auparavant des réglages d'infrastructure qu'elle ne lit nulle
 * part — « inscriptions ouvertes », « confirmation d'e-mail désactivée (dev) »
 * — écrits en dur : ils seraient restés identiques quoi qu'on change côté
 * Supabase, et l'un d'eux affichait une mention de développement à
 * l'administrateur. Un réglage affiché sans être lu vaut moins que pas de
 * réglage du tout : il donne à croire qu'on l'a vérifié.
 */
@Component({
  selector: 'app-parametres',
  templateUrl: './parametres.html',
  styleUrls: ['../espace-pages.css', './parametres.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Parametres {
  /** Source unique : la constante qui commande l'affichage du bouton Google. */
  protected readonly googleActif = GOOGLE_OAUTH_ACTIF;
}
