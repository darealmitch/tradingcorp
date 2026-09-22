import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { FactureEmise, compteEnFacturation, cumulAnnee } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';
import { StatCard } from '../../../shared/ui/stat-card';

/**
 * Les factures émises, vues depuis la comptabilité.
 *
 * La question posée est celle du vendeur : « qu'ai-je facturé, à qui, et la
 * numérotation est-elle continue ? ». L'acheteur, lui, n'a pas d'écran : il
 * reçoit sa facture jointe à la confirmation de commande (22/09/2026).
 *
 * Ce n'est pas cette page qui protège quoi que ce soit. Le droit vient de
 * `factures_select_titulaire` (20260914100000) : un formateur qui forcerait
 * l'URL n'obtiendrait que ses propres factures, la garde de route lui
 * épargnant seulement une page vide et trompeuse.
 */
@Component({
  selector: 'app-facturation',
  templateUrl: './facturation.html',
  styleUrl: '../espace-pages.css',
  imports: [StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Facturation {
  private readonly finance = inject(FinanceService);
  // Le téléchargement passe par la même Edge Function que côté apprenant :
  // `generer-facture` établit le droit sous RLS avant de signer une URL de dix
  // minutes. Une seconde implémentation « pour l'admin » serait une seconde
  // règle d'accès à tenir à jour.
  private readonly commerce = inject(CommerceService);

  protected readonly chargement = signal(true);
  protected readonly factures = signal<FactureEmise[]>([]);
  protected readonly preparation = signal<string | null>(null);
  protected readonly erreur = signal<string | null>(null);

  protected readonly annee = new Date().getFullYear();

  /** Ventes réelles : le mode test Stripe n'a jamais encaissé un centime. */
  private readonly reelles = computed(() => this.factures().filter(compteEnFacturation));

  protected readonly cumul = computed(() => this.euros(cumulAnnee(this.reelles(), this.annee)));

  protected readonly comptabilisees = computed(
    () => `${this.reelles().length} / ${this.factures().length}`,
  );

  protected readonly exclues = computed(() => this.factures().length - this.reelles().length);

  /**
   * Le numéro le plus récemment attribué.
   *
   * Affiché parce que la numérotation doit être continue et sans rupture
   * (art. 242 nonies A, annexe II du CGI) : c'est le repère qui permet de
   * constater d'un coup d'œil qu'aucun numéro n'a été sauté.
   */
  protected readonly dernierNumero = computed(() => this.factures()[0]?.numero ?? '—');

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.factures.set(await this.finance.listerFactures());
    this.chargement.set(false);
  }

  protected async telecharger(facture: FactureEmise): Promise<void> {
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

  protected estReelle(facture: FactureEmise): boolean {
    return compteEnFacturation(facture);
  }

  /** Le nom figé à la vente, à défaut l'adresse, à défaut rien d'exploitable. */
  protected client(facture: FactureEmise): string {
    return facture.client_nom ?? facture.client_email ?? '—';
  }

  protected euros(centimes: number): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(
      centimes / 100,
    );
  }

  protected montant(facture: FactureEmise): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: facture.devise.toUpperCase(),
    }).format(facture.montant_centimes / 100);
  }

  protected date(facture: FactureEmise): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
      new Date(facture.date_emission),
    );
  }
}
