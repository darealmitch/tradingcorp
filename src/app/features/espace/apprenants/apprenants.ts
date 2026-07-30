import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ApprenantSuivi } from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import { BarreProgression } from '../../../shared/ui/barre-progression';

@Component({
  selector: 'app-apprenants',
  templateUrl: './apprenants.html',
  styleUrl: '../espace-pages.css',
  imports: [BarreProgression],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Apprenants {
  private readonly pilotage = inject(PilotageService);

  protected readonly chargement = signal(true);
  protected readonly apprenants = signal<ApprenantSuivi[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.apprenants.set(await this.pilotage.suivreApprenants());
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
