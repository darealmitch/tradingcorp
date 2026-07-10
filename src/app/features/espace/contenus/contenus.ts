import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ContenuService,
  LeconResume,
  SectionAvecLecons,
} from '../../../core/contenu/contenu.service';

@Component({
  selector: 'app-contenus',
  templateUrl: './contenus.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contenus {
  private readonly contenu = inject(ContenuService);

  protected readonly chargement = signal(true);
  protected readonly sections = signal<SectionAvecLecons[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.sections.set(await this.contenu.chargerStructure());
    this.chargement.set(false);
  }

  protected duree(lecon: LeconResume): string {
    return lecon.duree_s ? `${Math.round(lecon.duree_s / 60)} min` : '—';
  }
}
