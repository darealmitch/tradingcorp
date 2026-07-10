import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { CommerceService } from '../../core/commerce/commerce.service';
import { Formation } from '../../core/commerce/formation.model';

@Component({
  selector: 'app-espace',
  templateUrl: './espace.html',
  styleUrl: './espace.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Espace {
  private readonly router = inject(Router);
  private readonly commerce = inject(CommerceService);

  protected readonly auth = inject(AuthService);

  protected readonly chargement = signal(true);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly achatEnCours = signal<string | null>(null);
  protected readonly erreurAchat = signal<string | null>(null);
  protected readonly retourAchat = signal<'succes' | 'annule' | null>(null);

  constructor() {
    const retour = inject(ActivatedRoute).snapshot.queryParamMap.get('achat');
    if (retour === 'succes' || retour === 'annule') {
      this.retourAchat.set(retour);
      // Nettoie l'URL : un rechargement ne doit pas réafficher la bannière.
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
    void this.charger(retour === 'succes');
  }

  private async charger(attendreWebhook: boolean): Promise<void> {
    const [formations, inscriptions] = await Promise.all([
      this.commerce.chargerFormations(),
      this.commerce.chargerInscriptions(),
    ]);
    this.formations.set(formations);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.chargement.set(false);

    // Au retour de Stripe, le webhook peut mettre quelques secondes à
    // enregistrer l'inscription : on revérifie une fois.
    if (attendreWebhook) {
      setTimeout(() => void this.rechargerInscriptions(), 2500);
    }
  }

  private async rechargerInscriptions(): Promise<void> {
    const inscriptions = await this.commerce.chargerInscriptions();
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
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

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
