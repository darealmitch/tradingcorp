import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Facture } from '../../../core/commerce/facture.model';
import { Icone } from '../../../shared/ui/icone';

/**
 * Les factures de l'apprenant.
 *
 * Cet écran ne remplit aucune obligation : la facture est envoyée par e-mail au
 * moment du paiement, avec la confirmation de commande, et c'est cet envoi qui
 * satisfait l'article L221-13 du Code de la consommation. Ce qu'on ajoute ici,
 * c'est de pouvoir la retrouver sans fouiller sa boîte mail — un an plus tard,
 * le message aura disparu, pas le document.
 */
@Component({
  selector: 'app-mes-factures',
  templateUrl: './mes-factures.html',
  styleUrls: ['../espace-pages.css'],
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MesFactures {
  private readonly commerce = inject(CommerceService);

  protected readonly factures = signal<Facture[]>([]);
  protected readonly chargement = signal(true);
  /** Facture dont le lien est en cours de préparation — désactive son bouton. */
  protected readonly preparation = signal<string | null>(null);
  protected readonly erreur = signal<string | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.factures.set(await this.commerce.chargerFactures());
    this.chargement.set(false);
  }

  /**
   * Ouvre la facture dans un nouvel onglet.
   *
   * Nouvel onglet et non téléchargement forcé : le lien signé expire au bout de
   * dix minutes, et un onglet laisse à l'apprenant le choix de lire ou
   * d'enregistrer.
   */
  protected async telecharger(facture: Facture): Promise<void> {
    this.preparation.set(facture.id_facture);
    this.erreur.set(null);

    const { url, erreur } = await this.commerce.lienFacture(facture.id_facture);

    this.preparation.set(null);
    if (erreur || !url) {
      this.erreur.set(erreur ?? 'Cette facture est indisponible.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  /** 99700 → « 997,00 € ». Le montant est stocké en centimes. */
  protected montant(facture: Facture): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: facture.devise.toUpperCase(),
    }).format(facture.montant_centimes / 100);
  }

  /** Une facture se date au jour, pas à l'heure. */
  protected date(facture: Facture): string {
    return new Date(facture.date_emission).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
