import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { LONGUEUR_MAX_CONTENU } from '../../../core/communaute/communaute.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { EchangePrive } from '../../../core/moderation/echanges';
import {
  AvisEnAttente,
  CommentaireModere,
  DecisionModeration,
  EtatModeration,
  ModerationService,
} from '../../../core/moderation/moderation.service';
import { Icone } from '../../../shared/ui/icone';

/** Les onglets, dans l'ordre où l'équipe les parcourt. */
export type Onglet = 'a-moderer' | 'prives' | 'publies' | 'rejetes';

const ONGLETS: readonly { id: Onglet; libelle: string }[] = [
  { id: 'a-moderer', libelle: 'À modérer' },
  { id: 'prives', libelle: 'Échanges privés' },
  { id: 'publies', libelle: 'Publiés' },
  { id: 'rejetes', libelle: 'Rejetés' },
];

const ETAT_DE_L_ONGLET: Record<Exclude<Onglet, 'prives'>, EtatModeration> = {
  'a-moderer': 'attente',
  publies: 'publies',
  rejetes: 'rejetes',
};

const VIDE: Record<Onglet, string> = {
  'a-moderer':
    'Aucun commentaire à modérer. Ils arriveront ici quand les apprenants commenteront les leçons.',
  prives:
    "Aucun échange privé. Pour en ouvrir un, réponds en privé sous le message d'un élève, ou rends son message privé.",
  publies: 'Aucun commentaire publié pour l’instant.',
  rejetes: 'Aucun commentaire rejeté.',
};

/** Une décision proposée sur un commentaire, selon son état et son auteur. */
interface Action {
  decision: DecisionModeration | 'supprimer';
  libelle: string;
  /** Rejeter, supprimer : présentés comme des actions qui retirent. */
  retrait?: boolean;
}

/** Ce qu'on dit après coup, et où retrouver le message : sa nouvelle place. */
interface Suite {
  texte: string;
  onglet: Onglet | null;
}

const SUITE_DE: Record<DecisionModeration, Suite> = {
  approuver: { texte: 'Message publié : tu le retrouves dans l’onglet', onglet: 'publies' },
  rejeter: { texte: 'Message rejeté : il reste dans l’onglet', onglet: 'rejetes' },
  rendre_prive: { texte: 'Échange rendu privé : tu le retrouves dans l’onglet', onglet: 'prives' },
  rendre_public: {
    texte: 'Message rendu public : tu le retrouves dans l’onglet',
    onglet: 'publies',
  },
};

/** Les plus récents seulement — même borne que le service. */
const MAX_PAR_ONGLET = 100;

function lireOnglet(valeur: string | null): Onglet {
  return ONGLETS.find((o) => o.id === valeur)?.id ?? 'a-moderer';
}

/**
 * Modération des commentaires et des avis.
 *
 * Un commentaire approuvé ou rejeté ne disparaissait que de la file
 * d'attente : aucun écran ne permettait plus de le retrouver. Chaque état a
 * désormais son onglet, mémorisé dans l'adresse — on y revient avec le bouton
 * « précédent » depuis la leçon — et chaque décision dit où le message est
 * passé.
 */
@Component({
  selector: 'app-moderation',
  templateUrl: './moderation.html',
  styleUrls: ['../espace-pages.css', './moderation.css'],
  imports: [FormsModule, Icone, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Moderation {
  private readonly moderation = inject(ModerationService);
  private readonly communaute = inject(CommunauteService);
  private readonly auth = inject(AuthService);

  protected readonly onglets = ONGLETS;
  protected readonly onglet = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((p) => lireOnglet(p.get('onglet')))),
    { initialValue: lireOnglet(null) },
  );
  protected readonly compteurs = this.moderation.compteurs;
  /** La suppression définitive est un acte d'administrateur. */
  protected readonly estAdmin = computed(() => this.auth.role() === 'admin');

  protected readonly chargement = signal(true);
  protected readonly commentaires = signal<CommentaireModere[]>([]);
  protected readonly echanges = signal<EchangePrive<CommentaireModere>[]>([]);
  protected readonly avis = signal<AvisEnAttente[]>([]);
  protected readonly avisCharges = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly suite = signal<Suite | null>(null);
  protected readonly traitement = signal(false);
  /** Message dont la suppression définitive attend une confirmation. */
  protected readonly suppressionId = signal<string | null>(null);

  /** Réponse privée en cours, depuis l'onglet des échanges. */
  protected readonly repondA = signal<string | null>(null);
  protected readonly texteReponse = signal('');

  protected readonly maxLongueur = LONGUEUR_MAX_CONTENU;
  protected readonly maxParOnglet = MAX_PAR_ONGLET;

  constructor() {
    void this.chargerAvis();
    effect(() => {
      const onglet = this.onglet();
      untracked(() => void this.chargerOnglet(onglet));
    });
  }

  private async chargerOnglet(onglet: Onglet): Promise<void> {
    this.chargement.set(true);
    this.suppressionId.set(null);
    this.repondA.set(null);
    if (onglet === 'prives') {
      this.echanges.set(await this.moderation.echangesPrives());
    } else {
      this.commentaires.set(await this.moderation.commentairesParEtat(ETAT_DE_L_ONGLET[onglet]));
    }
    this.chargement.set(false);
    // La pastille de la navigation suit ce qu'on vient de voir.
    void this.moderation.rafraichirCompteurs();
  }

  private async chargerAvis(): Promise<void> {
    this.avis.set(await this.moderation.avisEnAttente());
    this.avisCharges.set(true);
  }

  protected libelleOnglet(onglet: Onglet): string {
    return ONGLETS.find((o) => o.id === onglet)?.libelle ?? '';
  }

  protected compte(onglet: Onglet): number {
    const c = this.compteurs();
    return onglet === 'a-moderer' ? c.enAttente : onglet === 'prives' ? c.aRepondre : 0;
  }

  protected messageVide(): string {
    return VIDE[this.onglet()];
  }

  /**
   * Les décisions qui ont un sens pour ce commentaire — les mêmes règles que
   * `moderer_commentaire`, pour ne proposer que ce que le serveur acceptera.
   */
  protected actions(c: CommentaireModere): Action[] {
    if (c.par_equipe) {
      // Réponse de l'équipe : publiée d'office, seule sa visibilité change.
      const parent = c.parent;
      if (c.est_prive && parent && !parent.est_prive && parent.statut === 'approuve') {
        return [{ decision: 'rendre_public', libelle: 'Rendre public' }];
      }
      if (!c.est_prive && parent?.profils?.role === 'apprenant') {
        return [{ decision: 'rendre_prive', libelle: 'Rendre privé' }];
      }
      return [];
    }
    if (c.est_prive && c.id_parent !== null) {
      // Écrit en privé par un élève : on y répond, on ne le publie pas.
      return [];
    }

    const actions: Action[] = [];
    if (c.statut !== 'approuve') {
      actions.push({
        decision: 'approuver',
        libelle: c.statut === 'rejete' ? 'Republier' : 'Approuver',
      });
    }
    if (c.id_parent === null && c.profils?.role === 'apprenant') {
      actions.push(
        c.est_prive
          ? { decision: 'rendre_public', libelle: 'Rendre public' }
          : { decision: 'rendre_prive', libelle: 'Rendre privé' },
      );
    }
    if (c.statut !== 'rejete') {
      actions.push({ decision: 'rejeter', libelle: 'Rejeter', retrait: true });
    } else if (this.estAdmin()) {
      actions.push({ decision: 'supprimer', libelle: 'Supprimer définitivement', retrait: true });
    }
    return actions;
  }

  /** Une réponse privée de l'équipe peut devenir publique si son fil l'est. */
  protected peutRendrePublic(
    message: CommentaireModere,
    echange: EchangePrive<CommentaireModere>,
  ): boolean {
    return (
      message.par_equipe &&
      message.est_prive &&
      !echange.filPrive &&
      echange.fil.statut === 'approuve'
    );
  }

  protected async decider(c: CommentaireModere, action: Action): Promise<void> {
    if (action.decision === 'supprimer') {
      this.suppressionId.set(c.id_commentaire);
      return;
    }
    const decision = action.decision;
    await this.executer(
      () => this.moderation.modererCommentaire(c.id_commentaire, decision),
      SUITE_DE[decision],
    );
  }

  protected async rendrePublic(c: CommentaireModere): Promise<void> {
    await this.decider(c, { decision: 'rendre_public', libelle: 'Rendre public' });
  }

  protected async confirmerSuppression(c: CommentaireModere): Promise<void> {
    await this.executer(() => this.moderation.supprimerDefinitivement(c.id_commentaire), {
      texte:
        'Message supprimé définitivement, avec ses réponses. L’action est inscrite au journal.',
      onglet: null,
    });
  }

  protected basculerReponse(idFil: string): void {
    this.repondA.set(this.repondA() === idFil ? null : idFil);
    this.texteReponse.set('');
  }

  protected async repondre(echange: EchangePrive<CommentaireModere>): Promise<void> {
    const contenu = this.texteReponse().trim();
    if (!contenu || this.traitement()) {
      return;
    }
    await this.executer(
      () => this.communaute.repondreEnEquipe(echange.fil.id_commentaire, contenu, true),
      {
        texte: 'Réponse privée envoyée : l’élève en est prévenu par une notification.',
        onglet: null,
      },
    );
  }

  /** Toute décision : l'exécuter, dire où en est le message, recharger l'onglet. */
  private async executer(operation: () => Promise<string | null>, suite: Suite): Promise<void> {
    this.erreur.set(null);
    this.suite.set(null);
    this.traitement.set(true);
    const erreur = await operation();
    this.traitement.set(false);
    if (erreur) {
      this.erreur.set(erreur);
    } else {
      this.suite.set(suite);
    }
    await this.chargerOnglet(this.onglet());
  }

  protected async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<void> {
    this.erreur.set(null);
    this.traitement.set(true);
    const erreur = await this.moderation.traiterAvis(id, statut);
    if (erreur) {
      this.erreur.set(erreur);
    } else {
      this.avis.update((liste) => liste.filter((a) => a.id_avis !== id));
      void this.moderation.rafraichirCompteurs();
    }
    this.traitement.set(false);
  }

  /** L'équipe signe « Équipe TradingCorp » ; on précise qui, puisque l'écran est à elle. */
  protected auteur(c: CommentaireModere): string {
    const nom = this.nomComplet(c.profils);
    return c.par_equipe ? `Équipe TradingCorp · ${nom}` : nom;
  }

  protected nomComplet(personne: { prenom: string; nom: string } | null): string {
    return personne ? `${personne.prenom} ${personne.nom}`.trim() : 'Utilisateur supprimé';
  }

  /** Le début du message auquel on répond : de quoi le reconnaître, sans tout relire. */
  protected extrait(texte: string): string {
    const propre = texte.replace(/\s+/g, ' ').trim();
    return propre.length > 140 ? `${propre.slice(0, 139)}…` : propre;
  }

  protected datePublication(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected etoiles(note: number): string {
    return '★'.repeat(note) + '☆'.repeat(5 - note);
  }
}
