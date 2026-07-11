import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ContenuService, LeconResume, Module } from '../../../core/contenu/contenu.service';

@Component({
  selector: 'app-contenus',
  templateUrl: './contenus.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contenus {
  private readonly contenu = inject(ContenuService);

  protected readonly chargement = signal(true);
  protected readonly modules = signal<Module[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.modules.set(await this.contenu.chargerStructure());
    this.chargement.set(false);
  }

  protected duree(lecon: LeconResume): string {
    return lecon.duree_s ? `${Math.round(lecon.duree_s / 60)} min` : '—';
  }

  /** Médias rattachés à l'étape (référence Cloudinary présente ou non). */
  protected medias(lecon: LeconResume): string {
    const items: string[] = [];
    if (lecon.video_provider_id) {
      items.push('Vidéo');
    }
    if (lecon.pdf_public_id) {
      items.push('PDF');
    }
    return items.length ? items.join(' + ') : '—';
  }
}
