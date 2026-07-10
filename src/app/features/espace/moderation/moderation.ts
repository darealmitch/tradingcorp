import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  AvisEnAttente,
  CommentaireEnAttente,
  ModerationService,
} from '../../../core/moderation/moderation.service';
import { Icone } from '../../../shared/ui/icone';

@Component({
  selector: 'app-moderation',
  templateUrl: './moderation.html',
  styleUrls: ['../espace-pages.css', './moderation.css'],
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Moderation {
  private readonly moderation = inject(ModerationService);

  protected readonly chargement = signal(true);
  protected readonly commentaires = signal<CommentaireEnAttente[]>([]);
  protected readonly avis = signal<AvisEnAttente[]>([]);
  protected readonly erreur = signal<string | null>(null);
  protected readonly traitement = signal(false);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [commentaires, avis] = await Promise.all([
      this.moderation.commentairesEnAttente(),
      this.moderation.avisEnAttente(),
    ]);
    this.commentaires.set(commentaires);
    this.avis.set(avis);
    this.chargement.set(false);
  }

  protected async traiterCommentaire(id: string, statut: 'approuve' | 'rejete'): Promise<void> {
    this.erreur.set(null);
    this.traitement.set(true);
    const erreur = await this.moderation.traiterCommentaire(id, statut);
    if (erreur) {
      this.erreur.set(erreur);
    } else {
      this.commentaires.update((liste) => liste.filter((c) => c.id_commentaire !== id));
    }
    this.traitement.set(false);
  }

  protected async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<void> {
    this.erreur.set(null);
    this.traitement.set(true);
    const erreur = await this.moderation.traiterAvis(id, statut);
    if (erreur) {
      this.erreur.set(erreur);
    } else {
      this.avis.update((liste) => liste.filter((a) => a.id_avis !== id));
    }
    this.traitement.set(false);
  }

  protected nomComplet(personne: { prenom: string; nom: string } | null): string {
    return personne ? `${personne.prenom} ${personne.nom}`.trim() : 'Utilisateur supprimé';
  }

  protected datePublication(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected etoiles(note: number): string {
    return '★'.repeat(note) + '☆'.repeat(5 - note);
  }
}
