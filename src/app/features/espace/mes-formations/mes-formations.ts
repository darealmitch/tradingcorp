import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';

@Component({
  selector: 'app-mes-formations',
  templateUrl: './mes-formations.html',
  styleUrls: ['../espace-pages.css', './mes-formations.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MesFormations {
  private readonly commerce = inject(CommerceService);

  protected readonly chargement = signal(true);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly achatEnCours = signal<string | null>(null);
  protected readonly erreurAchat = signal<string | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [formations, inscriptions] = await Promise.all([
      this.commerce.chargerFormations(),
      this.commerce.chargerInscriptions(),
    ]);
    this.formations.set(formations);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.chargement.set(false);
  }

  protected async acheter(formation: Formation): Promise<void> {
    this.erreurAchat.set(null);
    this.achatEnCours.set(formation.id_formation);
    const erreur = await this.commerce.lancerCheckout(formation.id_formation);
    if (erreur) {
      this.erreurAchat.set(erreur);
      this.achatEnCours.set(null);
    }
    // Sinon on laisse le bouton désactivé : la page part vers Stripe.
  }

  protected prix(formation: Formation): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: formation.devise.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(formation.prix_centimes / 100);
  }
}
