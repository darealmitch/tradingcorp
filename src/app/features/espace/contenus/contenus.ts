import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ContenuService, LeconResume, Module } from '../../../core/contenu/contenu.service';
import { RessourceResume, TypeRessource } from '../../../core/contenu/apprentissage.model';

/** Libellés compacts : la colonne Médias est étroite. */
const TYPES_COURTS: Record<TypeRessource, string> = {
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Vidéo',
  fichier: 'Fichier',
  lien: 'Lien',
  documentation: 'Doc',
  code: 'Code',
  partenaire: 'Partenaire',
};

@Component({
  selector: 'app-contenus',
  templateUrl: './contenus.html',
  styleUrls: ['../espace-pages.css', './contenus.css'],
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

  /** Médias propres à l'étape (vidéo principale et PDF de support). */
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

  protected ressources(lecon: LeconResume): RessourceResume[] {
    return lecon.ressources ?? [];
  }

  /** Libellé court du type, pour la pastille de la colonne Médias. */
  protected typeRessource(r: RessourceResume): string {
    return TYPES_COURTS[r.type] ?? r.type;
  }

  /**
   * Une ressource est exploitable dès qu'elle a une source. Sans source, elle
   * attend son fichier : la pastille le signale au lieu de laisser croire que
   * la ressource est en ligne.
   */
  protected estPrete(r: RessourceResume): boolean {
    return Boolean(r.cloudinary_public_id || r.url || r.contenu);
  }

  protected etatRessource(r: RessourceResume): string {
    if (!this.estPrete(r)) {
      return 'Fichier attendu';
    }
    return r.est_active ? 'En ligne' : 'Désactivée';
  }
}
