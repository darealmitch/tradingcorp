import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { GOOGLE_OAUTH_ACTIF } from '../../../core/auth/auth.service';
import { EssaiFacturation } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';

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
 *
 * Le seul geste de la page suit la même règle : l'essai de facturation ne
 * déclare rien, il interroge la chaîne réelle et rapporte ce qu'elle répond.
 */
@Component({
  selector: 'app-parametres',
  templateUrl: './parametres.html',
  styleUrls: ['../espace-pages.css', './parametres.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Parametres {
  private readonly finance = inject(FinanceService);

  /** Source unique : la constante qui commande l'affichage du bouton Google. */
  protected readonly googleActif = GOOGLE_OAUTH_ACTIF;

  /** Vide = l'adresse du compte connecté, que seule la fonction connaît. */
  protected readonly destinataire = signal('');
  protected readonly envoiEnCours = signal(false);
  protected readonly essai = signal<EssaiFacturation | null>(null);
  protected readonly erreurEssai = signal<string | null>(null);

  /**
   * Déclenche un envoi de bout en bout, sans vente.
   *
   * Éprouve ce qui ne se relit pas dans le code : l'adresse du vendeur, la
   * composition du PDF, la clé Brevo, l'expéditeur vérifié, la remise. Aucun
   * numéro de facture n'est consommé — la série réelle reste intacte.
   *
   * Le destinataire est libre pour pouvoir vérifier ce qu'un client reçoit
   * réellement, chez lui : une remise dépend autant du fournisseur qui la
   * reçoit (Gmail, iCloud, Outlook) que de celui qui l'émet.
   */
  protected saisirDestinataire(evenement: Event): void {
    this.destinataire.set((evenement.target as HTMLInputElement).value);
  }

  protected async essayerFacturation(): Promise<void> {
    this.envoiEnCours.set(true);
    this.essai.set(null);
    this.erreurEssai.set(null);

    const { resultat, erreur } = await this.finance.envoyerFactureEssai(this.destinataire());

    this.envoiEnCours.set(false);
    if (erreur || !resultat?.envoye) {
      this.erreurEssai.set(erreur ?? 'L’essai n’est pas parti.');
      return;
    }
    this.essai.set(resultat);
  }
}
