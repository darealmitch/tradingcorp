import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/auth/auth.service';
import {
  LONGUEUR_MAX_CONTENU,
  Commentaire,
  FilCommentaire,
} from '../../../core/communaute/communaute.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { Icone } from '../../../shared/ui/icone';

/**
 * Espace d'échange d'un chapitre.
 *
 * Tout ce qui est publié passe par la modération : la RLS impose le statut
 * `en_attente` à l'insertion, et ne rend visible aux autres que l'approuvé.
 * L'auteur, lui, voit toujours son propre message — sans quoi il croirait sa
 * publication perdue et la referait.
 */
@Component({
  selector: 'app-commentaires-lecon',
  imports: [FormsModule, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './commentaires-lecon.html',
  styleUrl: './commentaires-lecon.css',
})
export class CommentairesLecon {
  private readonly communaute = inject(CommunauteService);
  private readonly auth = inject(AuthService);

  readonly idLecon = input.required<string>();

  protected readonly fils = signal<FilCommentaire[]>([]);
  protected readonly chargement = signal(true);
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoi = signal(false);

  /** Saisie du message principal, et de la réponse en cours s'il y en a une. */
  protected readonly texte = signal('');
  protected readonly repondA = signal<string | null>(null);
  protected readonly texteReponse = signal('');

  protected readonly maxLongueur = LONGUEUR_MAX_CONTENU;

  constructor() {
    // Le composant est réutilisé d'un chapitre à l'autre par le routeur : sans
    // rechargement, on afficherait les commentaires du chapitre précédent.
    effect(() => {
      const id = this.idLecon();
      void this.charger(id);
    });
  }

  private async charger(idLecon: string): Promise<void> {
    this.chargement.set(true);
    this.fils.set(await this.communaute.commentaires(idLecon));
    this.chargement.set(false);
  }

  protected estMoi(commentaire: Commentaire): boolean {
    return commentaire.id_profil === this.auth.profil()?.id_profil;
  }

  protected auteur(commentaire: Commentaire): string {
    const p = commentaire.profils;
    return p ? `${p.prenom} ${p.nom}`.trim() : 'Compte supprimé';
  }

  protected enAttente(commentaire: Commentaire): boolean {
    return commentaire.statut === 'en_attente';
  }

  protected async publier(): Promise<void> {
    const contenu = this.texte().trim();
    if (!contenu || this.envoi()) {
      return;
    }
    await this.envoyer(contenu, undefined, () => this.texte.set(''));
  }

  protected async publierReponse(idParent: string): Promise<void> {
    const contenu = this.texteReponse().trim();
    if (!contenu || this.envoi()) {
      return;
    }
    await this.envoyer(contenu, idParent, () => {
      this.texteReponse.set('');
      this.repondA.set(null);
    });
  }

  private async envoyer(
    contenu: string,
    idParent: string | undefined,
    apres: () => void,
  ): Promise<void> {
    this.envoi.set(true);
    this.erreur.set(null);
    const echec = await this.communaute.publierCommentaire(this.idLecon(), contenu, idParent);
    this.envoi.set(false);
    if (echec) {
      this.erreur.set(echec);
      return;
    }
    apres();
    await this.charger(this.idLecon());
  }

  protected basculerReponse(idCommentaire: string): void {
    this.repondA.set(this.repondA() === idCommentaire ? null : idCommentaire);
    this.texteReponse.set('');
  }

  protected async supprimer(commentaire: Commentaire): Promise<void> {
    const echec = await this.communaute.supprimerCommentaire(commentaire.id_commentaire);
    if (echec) {
      this.erreur.set(echec);
      return;
    }
    await this.charger(this.idLecon());
  }

  protected quand(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
