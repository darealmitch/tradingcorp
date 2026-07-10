import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApprenantSuivi, ContenuService } from '../../../core/contenu/contenu.service';
import { BarreProgression } from '../../../shared/ui/barre-progression';

@Component({
  selector: 'app-apprenants',
  templateUrl: './apprenants.html',
  styleUrl: '../espace-pages.css',
  imports: [BarreProgression],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Apprenants {
  private readonly contenu = inject(ContenuService);

  protected readonly chargement = signal(true);
  protected readonly apprenants = signal<ApprenantSuivi[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.apprenants.set(await this.contenu.suivreApprenants());
    this.chargement.set(false);
  }

  protected pourcentage(apprenant: ApprenantSuivi): number {
    return apprenant.total === 0 ? 0 : Math.round((apprenant.terminees / apprenant.total) * 100);
  }

  protected inscritLe(apprenant: ApprenantSuivi): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
      new Date(apprenant.date_creation),
    );
  }
}
