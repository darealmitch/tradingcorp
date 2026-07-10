import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminService, PaiementLigne } from '../../../core/admin/admin.service';
import { StatCard } from '../../../shared/ui/stat-card';

@Component({
  selector: 'app-paiements',
  templateUrl: './paiements.html',
  styleUrl: '../espace-pages.css',
  imports: [StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Paiements {
  private readonly admin = inject(AdminService);

  protected readonly chargement = signal(true);
  protected readonly paiements = signal<PaiementLigne[]>([]);

  protected readonly caMois = computed(() => {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    return this.euros(
      this.reussis()
        .filter((p) => new Date(p.date_paiement) >= debutMois)
        .reduce((somme, p) => somme + p.montant_centimes, 0),
    );
  });

  protected readonly caTotal = computed(() =>
    this.euros(this.reussis().reduce((somme, p) => somme + p.montant_centimes, 0)),
  );

  protected readonly nbReussis = computed(
    () => `${this.reussis().length} / ${this.paiements().length}`,
  );

  protected readonly panierMoyen = computed(() => {
    const reussis = this.reussis();
    if (reussis.length === 0) {
      return '—';
    }
    const somme = reussis.reduce((total, p) => total + p.montant_centimes, 0);
    return this.euros(Math.round(somme / reussis.length));
  });

  private readonly reussis = computed(() => this.paiements().filter((p) => p.statut === 'reussi'));

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.paiements.set(await this.admin.listerPaiements());
    this.chargement.set(false);
  }

  protected euros(centimes: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(centimes / 100);
  }

  protected datePaiement(paiement: PaiementLigne): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(paiement.date_paiement),
    );
  }

  protected reference(paiement: PaiementLigne): string {
    const ref = paiement.reference_transaction;
    return ref.length > 12 ? `${ref.slice(0, 6)}…${ref.slice(-4)}` : ref;
  }
}
