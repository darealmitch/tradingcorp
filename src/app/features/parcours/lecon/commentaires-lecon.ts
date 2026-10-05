import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
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
 *
 * Un échange privé — réponses privées de l'équipe et de l'élève, ou tout un
 * fil rendu privé — se lit dans un bloc à part, teinté, qui se termine par sa
 * propre zone de réponse : l'élève doit comprendre d'un coup d'œil que
 * personne d'autre ne le lit, et pouvoir poursuivre la conversation au même
 * endroit.
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
  private readonly document = inject(DOCUMENT);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly idLecon = input.required<string>();

  protected readonly fils = signal<FilCommentaire[]>([]);
  protected readonly chargement = signal(true);
  protected readonly erreur = signal<string | null>(null);
  protected readonly envoi = signal(false);

  /** Saisie du message principal, et de la réponse en cours s'il y en a une. */
  protected readonly texte = signal('');
  protected readonly repondA = signal<string | null>(null);
  protected readonly texteReponse = signal('');
  /** La réponse en cours est privée. */
  protected readonly reponsePrivee = signal(false);

  /** Formateur ou administrateur : répond par sa propre voie, et peut le faire en privé. */
  protected readonly estEquipe = this.auth.estFormateurOuAdmin;

  protected readonly maxLongueur = LONGUEUR_MAX_CONTENU;

  /** Arrivée par un lien `#echanges` (notification, modération) : défiler une seule fois. */
  private dejaDefile = false;

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
    this.defilerSiDemande();
  }

  /**
   * Les échanges sont en bas de la leçon : arrivé par une notification, l'élève
   * devrait sinon les chercher sous la vidéo. Le routeur défile vers l'ancre à
   * l'arrivée, quand elle n'existe pas encore — d'où ce second essai, une fois
   * les messages affichés.
   */
  private defilerSiDemande(): void {
    if (this.dejaDefile || this.document.location?.hash !== '#echanges') {
      return;
    }
    this.dejaDefile = true;
    afterNextRender(
      () => this.hote.nativeElement.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      { injector: this.injector },
    );
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
    if (p) {
      return `${p.prenom} ${p.nom}`.trim();
    }
    // Un autre élève : la base rend « Prénom I. » pour les messages publiés.
    return commentaire.nom_public?.trim() || 'Un élève';
  }

  /** Pour l'équipe seulement : quel membre a signé la réponse. */
  protected signataire(commentaire: Commentaire): string | null {
    const p = commentaire.profils;
    return commentaire.par_equipe && this.estEquipe() && p ? `${p.prenom} ${p.nom}`.trim() : null;
  }

  /** Les réponses publiques du fil ; dans un fil privé, toutes passent dans l'échange. */
  protected reponsesPubliques(fil: FilCommentaire): Commentaire[] {
    return fil.message.est_prive ? [] : fil.reponses.filter((r) => !r.est_prive);
  }

  /** Les messages de l'échange privé, dans l'ordre où ils ont été écrits. */
  protected messagesPrives(fil: FilCommentaire): Commentaire[] {
    return fil.message.est_prive ? fil.reponses : fil.reponses.filter((r) => r.est_prive);
  }

  /** Un échange privé est ouvert : fil rendu privé, ou réponse privée de l'équipe. */
  protected echangeOuvert(fil: FilCommentaire): boolean {
    return fil.message.est_prive || fil.reponses.some((r) => r.est_prive && r.par_equipe);
  }

  /**
   * Le bloc privé s'affiche dès qu'il a quelque chose à montrer — ou quand
   * l'équipe s'apprête à ouvrir l'échange, pour que sa saisie y prenne place.
   */
  protected afficherEchange(fil: FilCommentaire): boolean {
    return (
      fil.message.est_prive ||
      this.messagesPrives(fil).length > 0 ||
      this.saisieOuverte(fil.message.id_commentaire, true)
    );
  }

  /**
   * Réponse publique. L'équipe ne répond publiquement que sous un message
   * publié : la base refuserait sinon, la réponse s'afficherait seule aux
   * autres élèves. Personne ne répond publiquement dans un fil privé.
   */
  protected peutRepondrePubliquement(message: Commentaire): boolean {
    if (message.est_prive) {
      return false;
    }
    return !this.estEquipe() || message.statut === 'approuve';
  }

  /**
   * Réponse privée. L'équipe, sous le message d'un élève, quel que soit son
   * statut ; l'élève, dans son propre fil, une fois l'échange ouvert par
   * l'équipe — il poursuit une conversation, il n'en ouvre pas.
   */
  protected peutRepondreEnPrive(fil: FilCommentaire): boolean {
    const message = fil.message;
    if (this.estEquipe()) {
      return !message.par_equipe && message.profils?.role === 'apprenant';
    }
    return this.estMoi(message) && this.echangeOuvert(fil);
  }

  /** « Léa » — ou « l'élève » si le prénom manque. */
  protected prenomDe(message: Commentaire): string {
    return message.profils?.prenom?.trim() || 'l’élève';
  }

  protected enAttente(commentaire: Commentaire): boolean {
    return commentaire.statut === 'en_attente';
  }

  /**
   * Rejeté par l'équipe : seuls son auteur et l'équipe le voient encore. Sans
   * mention, l'auteur le croirait publié.
   */
  protected nonPublie(commentaire: Commentaire): boolean {
    return commentaire.statut === 'rejete';
  }

  protected saisieOuverte(idCommentaire: string, privee: boolean): boolean {
    return this.repondA() === idCommentaire && this.reponsePrivee() === privee;
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
    const echec = await this.voieDEnvoi(contenu, idParent, prive);
    this.envoi.set(false);
    if (echec) {
      this.erreur.set(echec);
      return;
    }
    apres();
    await this.charger(this.idLecon());
  }

  /** Chaque auteur a sa voie : l'équipe, l'élève en privé, l'élève en public. */
  private voieDEnvoi(contenu: string, idParent: string | undefined, prive: boolean) {
    if (idParent && this.estEquipe()) {
      return this.communaute.repondreEnEquipe(idParent, contenu, prive);
    }
    if (idParent && prive) {
      return this.communaute.repondreEnPrive(idParent, contenu);
    }
    return this.communaute.publierCommentaire(this.idLecon(), contenu, idParent);
  }

  /** Ouvre ou referme la réponse ; passer de publique à privée garde le formulaire ouvert. */
  protected basculerReponse(idCommentaire: string, privee = false): void {
    const memeFormulaire = this.saisieOuverte(idCommentaire, privee);
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
