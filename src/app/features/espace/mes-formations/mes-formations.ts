import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { ModuleParcours } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { Icone } from '../../../shared/ui/icone';
import { Verrou } from '../../../shared/ui/verrou';

@Component({
  selector: 'app-mes-formations',
  templateUrl: './mes-formations.html',
  styleUrls: ['../espace-pages.css', './mes-formations.css'],
  imports: [Icone, Verrou],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MesFormations {
  private readonly commerce = inject(CommerceService);
  private readonly contenu = inject(ContenuService);
  private readonly router = inject(Router);

  protected readonly chargement = signal(true);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly achatEnCours = signal<string | null>(null);
  protected readonly erreurAchat = signal<string | null>(null);

  /** Modules du parcours (états serveur) — accès direct aux chapitres. */
  protected readonly modules = signal<ModuleParcours[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [formations, inscriptions, parcours] = await Promise.all([
      this.commerce.chargerFormations(),
      this.commerce.chargerInscriptions(),
      this.contenu.chargerParcours(),
    ]);
    this.formations.set(formations);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.modules.set(parcours?.inscrit ? parcours.modules : []);
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

  /** Ouvre l'introduction d'un module — jamais un module verrouillé. */
  protected async ouvrirModule(m: ModuleParcours): Promise<void> {
    if (m.etat === 'verrouille') {
      return;
    }
    await this.router.navigate(['/espace/parcours', m.id_section]);
  }

  protected numero(m: ModuleParcours): string {
    return String(m.position).padStart(2, '0');
  }
}
