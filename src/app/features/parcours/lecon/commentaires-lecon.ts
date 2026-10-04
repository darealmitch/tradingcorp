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
  /** La réponse en cours est privée (équipe seulement). */
  protected readonly reponsePrivee = signal(false);

  /** Formateur ou administrateur : répond par sa propre voie, et peut le faire en privé. */
  protected readonly estEquipe = this.auth.estFormateurOuAdmin;

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
    // Avant la jointure : un élève ne lit pas le profil d'un membre de
    // l'équipe, `profils` lui reviendrait vide et il lirait « Compte supprimé ».
    if (commentaire.par_equipe) {
      return 'Équipe TradingCorp';
    }
    const p = commentaire.profils;
    return p ? `${p.prenom} ${p.nom}`.trim() : 'Compte supprimé';
  }

  /** Pour l'équipe seulement : quel membre a signé la réponse. */
  protected signataire(commentaire: Commentaire): string | null {
    const p = commentaire.profils;
    return commentaire.par_equipe && this.estEquipe() && p ? `${p.prenom} ${p.nom}`.trim() : null;
  }

  /**
   * L'équipe ne répond publiquement que sous un message publié : la base
   * refuserait sinon, la réponse s'afficherait seule aux autres élèves.
   * L'élève, lui, garde son bouton tel qu'avant.
   */
  protected peutRepondrePubliquement(message: Commentaire): boolean {
    return !this.estEquipe() || message.statut === 'approuve';
  }

  /** Réponse privée : par l'équipe, sous le message d'un élève, quel que soit son statut. */
  protected peutRepondreEnPrive(message: Commentaire): boolean {
    return this.estEquipe() && !message.par_equipe && message.profils?.role === 'apprenant';
  }

  /** « Léa » — ou « l'élève » si le prénom manque. */
  protected prenomDe(message: Commentaire): string {
    return message.profils?.prenom?.trim() || 'l’élève';
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
    await this.envoyer(
      contenu,
      idParent,
      () => {
        this.texteReponse.set('');
        this.repondA.set(null);
      },
      this.reponsePrivee(),
    );
  }

  private async envoyer(
    contenu: string,
    idParent: string | undefined,
    apres: () => void,
    prive = false,
  ): Promise<void> {
    this.envoi.set(true);
    this.erreur.set(null);
    const echec =
      idParent && this.estEquipe()
        ? await this.communaute.repondreEnEquipe(idParent, contenu, prive)
        : await this.communaute.publierCommentaire(this.idLecon(), contenu, idParent);
    this.envoi.set(false);
    if (echec) {
      this.erreur.set(echec);
      return;
    }
    apres();
    await this.charger(this.idLecon());
  }

  /** Ouvre ou referme la réponse ; passer de publique à privée garde le formulaire ouvert. */
  protected basculerReponse(idCommentaire: string, privee = false): void {
    const memeFormulaire = this.repondA() === idCommentaire && this.reponsePrivee() === privee;
    this.repondA.set(memeFormulaire ? null : idCommentaire);
    this.reponsePrivee.set(privee);
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
