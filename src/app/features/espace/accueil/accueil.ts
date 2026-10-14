import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProfilAdmin } from '../../../core/comptes/comptes.model';
import { ComptesService } from '../../../core/comptes/comptes.service';
import { PaiementLigne, compteDansCa } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommerceService } from '../../../core/commerce/commerce.service';
import {
  EtatLecon,
  LeconResume,
  ProgressionResume,
} from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import {
  ApprenantSuivi,
  CertificatEmis,
  EntonnoirConversion,
  InscriptionRecente,
} from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import {
  CommentaireEnAttente,
  ModerationService,
} from '../../../core/moderation/moderation.service';
import { BarreProgression } from '../../../shared/ui/barre-progression';
import { Icone } from '../../../shared/ui/icone';
import { StatCard } from '../../../shared/ui/stat-card';

/**
 * Retour de Stripe : l'inscription est ouverte par le webhook, qui peut
 * arriver après la personne. On revérifie à cet intervalle, ce nombre de fois
 * — une demi-minute en tout — avant de dire que c'est plus long que prévu.
 */
export const INTERVALLE_ACTIVATION_MS = 2000;
export const VERIFICATIONS_ACTIVATION = 15;

/**
 * Où en est l'accès après un paiement :
 *   • `attente` — le paiement est parti, l'inscription pas encore là ;
 *   • `ouvert`  — l'inscription est active, l'écran le dit et affiche la suite ;
 *   • `retard`  — rien après une demi-minute (paiement différé, webhook lent).
 */
export type ActivationAcces = 'attente' | 'ouvert' | 'retard';

interface StatsApprenant {
  progression: ProgressionResume;
  prochaines: LeconResume[];
}

/** Une leçon offerte, telle que le tableau de bord la présente. */
interface LeconOfferte {
  id_lecon: string;
  id_section: string;
  titre: string;
  etat: EtatLecon;
}

/**
 * Accès découverte d'un compte sans achat : ses leçons offertes, dans l'ordre
 * du parcours, et la première qui reste à suivre.
 */
interface Decouverte {
  lecons: LeconOfferte[];
  terminees: number;
  prochaine: LeconOfferte | null;
}

interface StatsFormateur {
  apprenants: number;
  apprenantsTest: number;
  lecons: number;
  commentairesEnAttente: number;
  noteMoyenne: string | null;
  commentaires: CommentaireEnAttente[];
  inscriptions: InscriptionRecente[];
}

interface StatsAdmin {
  caMois: string;
  caTotal: string;
  apprenants: number;
  apprenantsTest: number;
  certificats: number;
  paiements: PaiementLigne[];
  nouveauxComptes: ProfilAdmin[];
  /** Null si la lecture a échoué : l'écran le dit, au lieu d'afficher des zéros. */
  entonnoir: EntonnoirConversion | null;
}

/** Une étape de l'entonnoir, telle que le tableau de bord la montre. */
export interface EtapeEntonnoir {
  libelle: string;
  valeur: number;
}

/**
 * Les étapes, dans l'ordre du parcours d'un visiteur. Les vues et les clics
 * sont des événements, pas des personnes : un visiteur qui revient trois fois
 * compte trois vues. Les comptes et paiements, eux, sont des personnes et des
 * ventes réelles.
 */
export function etapesEntonnoir(e: EntonnoirConversion): EtapeEntonnoir[] {
  return [
    { libelle: 'Vues de l’accueil', valeur: e.vues_accueil },
    { libelle: 'Vues de la page Programme', valeur: e.vues_programme },
    { libelle: 'Clics sur « Commencer » ou « Acheter »', valeur: e.clics },
    { libelle: 'Vues de l’inscription', valeur: e.vues_inscription },
    { libelle: 'Comptes ouverts', valeur: e.comptes_crees },
    { libelle: 'Vues de l’écran d’achat', valeur: e.vues_achat },
    { libelle: 'Paiements commencés', valeur: e.debuts_paiement },
    { libelle: 'Paiements encaissés', valeur: e.paiements },
  ];
}

/** « 4,2 % », ou null quand le dénominateur est nul — un taux sur zéro ne dit rien. */
export function taux(numerateur: number, denominateur: number): string | null {
  if (denominateur <= 0) {
    return null;
  }
  return `${((numerateur / denominateur) * 100).toLocaleString('fr-FR', {
    maximumFractionDigits: 1,
  })}\u00a0%`;
}

@Component({
  selector: 'app-accueil',
  templateUrl: './accueil.html',
  styleUrls: ['../espace-pages.css', './accueil.css'],
  imports: [RouterLink, Icone, StatCard, BarreProgression],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Accueil {
  private readonly router = inject(Router);
  private readonly commerce = inject(CommerceService);
  private readonly contenu = inject(ContenuService);
  // Le tableau de bord est le seul écran à croiser les deux domaines : la
  // progression de l'utilisateur courant, et — pour le staff — les chiffres
  // de la plateforme. D'où deux services, et non un service élargi.
  private readonly pilotage = inject(PilotageService);
  private readonly moderation = inject(ModerationService);
  private readonly comptes = inject(ComptesService);
  private readonly finance = inject(FinanceService);

  protected readonly auth = inject(AuthService);

  protected readonly chargement = signal(true);
  protected readonly retourAchat = signal<'succes' | 'annule' | null>(null);
  protected readonly activation = signal<ActivationAcces | null>(null);

  /** La page a été quittée : le suivi de l'activation s'arrête là. */
  private detruit = false;

  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly apprenant = signal<StatsApprenant | null>(null);
  /** Leçons offertes d'un compte sans achat — null s'il n'y en a aucune. */
  protected readonly decouverte = signal<Decouverte | null>(null);
  protected readonly formateur = signal<StatsFormateur | null>(null);
  protected readonly admin = signal<StatsAdmin | null>(null);

  /**
   * Aperçu déplié sous les indicateurs, ou aucun.
   *
   * Un seul à la fois : deux panneaux ouverts repousseraient le reste du
   * tableau de bord hors de l'écran, et l'aperçu cesserait d'être un aperçu.
   */
  protected readonly apercu = signal<'apprenants' | 'certificats' | null>(null);
  protected readonly apprenantsSuivis = signal<ApprenantSuivi[] | null>(null);
  protected readonly certificatsEmis = signal<CertificatEmis[] | null>(null);
  protected readonly apercuEnCours = signal(false);

  protected readonly possedeFormation = computed(() => this.inscrites().size > 0);

  private roleCharge: Role | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => (this.detruit = true));

    // Retour de Stripe Checkout : l'Edge Function redirige vers /espace?achat=…
    const retour = inject(ActivatedRoute).snapshot.queryParamMap.get('achat');
    if (retour === 'succes' || retour === 'annule') {
      this.retourAchat.set(retour);
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    // Le rôle arrive avec le chargement du profil : on charge le tableau de
    // bord correspondant dès qu'il est connu, une seule fois.
    effect(() => {
      const role = this.auth.role();
      if (role && this.roleCharge !== role) {
        this.roleCharge = role;
        void this.charger(role, retour === 'succes');
      }
    });
  }

  private async charger(role: Role, attendreWebhook: boolean): Promise<void> {
    if (role === 'apprenant') {
      await this.chargerApprenant();
      if (attendreWebhook) {
        void this.suivreActivation();
      }
    } else if (role === 'formateur') {
      await this.chargerFormateur();
    } else {
      await this.chargerAdmin();
    }
    this.chargement.set(false);
  }

  /**
   * Au retour de Stripe, l'accès s'ouvre quand le webhook a enregistré
   * l'inscription — souvent avant que la page ne s'affiche, parfois quelques
   * secondes après, beaucoup plus tard pour un paiement différé.
   *
   * L'écran annonçait « Paiement confirmé » et ne revérifiait qu'une fois, au
   * bout de 2,5 s : passé ce délai, l'élève qui venait de payer retombait sur
   * l'encart « Débloque ta formation », sans un mot d'explication. Il suit
   * maintenant l'ouverture, et dit ce qu'il en est à chaque étape.
   */
  private async suivreActivation(): Promise<void> {
    if (this.possedeFormation()) {
      this.activation.set('ouvert');
      return;
    }
    this.activation.set('attente');
    for (let i = 0; i < VERIFICATIONS_ACTIVATION; i++) {
      await new Promise((resoudre) => setTimeout(resoudre, INTERVALLE_ACTIVATION_MS));
      if (this.detruit) {
        return;
      }
      const inscriptions = await this.commerce.chargerInscriptions();
      if (inscriptions.length > 0) {
        await this.chargerApprenant();
        this.activation.set('ouvert');
        return;
      }
    }
    this.activation.set('retard');
  }

  private async chargerApprenant(): Promise<void> {
    const [inscriptions, progression, prochaines] = await Promise.all([
      this.commerce.chargerInscriptions(),
      this.contenu.maProgression(),
      this.contenu.prochainesLecons(1),
    ]);
    // Sans achat, le tableau de bord présente les leçons offertes, comme il
    // présente « Reprendre » à un inscrit. Chargées AVANT de poser l'état
    // apprenant : l'écran ne doit pas afficher d'abord le seul encart d'achat,
    // puis sauter quand les leçons offertes arrivent.
    const decouverte = inscriptions.length === 0 ? await this.chargerDecouverte() : null;
    this.decouverte.set(decouverte);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.apprenant.set({ progression, prochaines });
  }

  /**
   * Les leçons offertes à ce compte, avec leur état. La base en est seule
   * juge : `etats_modules` dit quels modules en contiennent, `etats_lecons`
   * marque chacune d'elles (`offerte`). L'écran ne recalcule rien.
   */
  private async chargerDecouverte(): Promise<Decouverte | null> {
    const parcours = await this.contenu.chargerParcours();
    const modules = (parcours?.modules ?? []).filter((m) => m.lecons_offertes > 0);
    if (modules.length === 0) {
      return null;
    }
    const etapes = await Promise.all(modules.map((m) => this.contenu.etatsLecons(m.id_section)));
    const lecons = modules.flatMap((m, i) =>
      etapes[i]
        .filter((e) => e.offerte && e.type !== 'intro')
        .map((e) => ({
          id_lecon: e.id_lecon,
          id_section: m.id_section,
          titre: e.titre,
          etat: e.etat,
        })),
    );
    if (lecons.length === 0) {
      return null;
    }
    return {
      lecons,
      terminees: lecons.filter((l) => l.etat === 'termine').length,
      prochaine: lecons.find((l) => l.etat !== 'termine') ?? null,
    };
  }

  private async chargerFormateur(): Promise<void> {
    const [apprenants, lecons, commentairesEnAttente, noteMoyenne, commentaires, inscriptions] =
      await Promise.all([
        this.pilotage.compterApprenants(),
        this.pilotage.compterLecons(),
        this.moderation.compterCommentairesEnAttente(),
        this.moderation.noteMoyenne(),
        this.moderation.commentairesEnAttente(),
        this.pilotage.inscriptionsRecentes(4),
      ]);
    this.formateur.set({
      apprenants: apprenants.total,
      apprenantsTest: apprenants.test,
      lecons,
      commentairesEnAttente,
      noteMoyenne,
      commentaires: commentaires.slice(0, 3),
      inscriptions,
    });
  }

  private async chargerAdmin(): Promise<void> {
    const [paiements, profils, certificats, entonnoir] = await Promise.all([
      this.finance.listerPaiements(),
      this.comptes.lister(),
      this.pilotage.compterCertificats(),
      this.pilotage.entonnoirConversion(30),
    ]);
    // Seuls les paiements réels d'apprenants comptent (ni test, ni staff).
    const reels = paiements.filter(compteDansCa);
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);
    const caMois = reels
      .filter((p) => new Date(p.date_paiement) >= debutMois)
      .reduce((somme, p) => somme + p.montant_centimes, 0);
    const caTotal = reels.reduce((somme, p) => somme + p.montant_centimes, 0);

    this.admin.set({
      caMois: this.euros(caMois),
      caTotal: this.euros(caTotal),
      apprenants: profils.filter((p) => p.role === 'apprenant').length,
      apprenantsTest: profils.filter((p) => p.role === 'apprenant' && p.est_test).length,
      certificats,
      paiements: paiements.slice(0, 4),
      nouveauxComptes: profils
        .filter((p) => !p.est_test)
        .sort((a, b) => b.date_creation.localeCompare(a.date_creation))
        .slice(0, 4),
      entonnoir,
    });
  }

  protected readonly etapesEntonnoir = etapesEntonnoir;
  protected readonly taux = taux;

  /**
   * Mention discrète sous le nombre d'apprenants, ou rien s'il n'y a aucun
   * compte de démonstration.
   *
   * Le `detail` de la carte existe déjà et sert exactement à cela : préciser
   * un chiffre sans lui ajouter d'ornement. Un badge ou une couleur sur une
   * tuile de statistique attirerait l'œil plus que le chiffre lui-même.
   */
  protected mentionTest(nombre: number): string | null {
    if (nombre === 0) {
      return null;
    }
    return nombre === 1 ? 'dont 1 compte de test' : `dont ${nombre} comptes de test`;
  }

  // ===== Aides d'affichage =====

  /**
   * Ouvre ou referme un aperçu, en ne chargeant ses données qu'au premier
   * dépliement : la plupart des visites du tableau de bord n'en ouvriront
   * aucun, et ces lectures n'ont pas à peser sur le temps d'affichage.
   */
  protected async basculerApercu(lequel: 'apprenants' | 'certificats'): Promise<void> {
    if (this.apercu() === lequel) {
      this.apercu.set(null);
      return;
    }
    this.apercu.set(lequel);

    const dejaCharge =
      lequel === 'apprenants' ? this.apprenantsSuivis() !== null : this.certificatsEmis() !== null;
    if (dejaCharge) {
      return;
    }

    this.apercuEnCours.set(true);
    if (lequel === 'apprenants') {
      // Exactement la lecture de la page Apprenants : même service, même
      // modèle. L'aperçu montre le début de ce que la page détaille.
      this.apprenantsSuivis.set(await this.pilotage.suivreApprenants());
    } else {
      this.certificatsEmis.set(await this.pilotage.certificatsEmis(5));
    }
    this.apercuEnCours.set(false);
  }

  /** Titulaire d'un certificat, ou la mention du compte disparu. */
  protected titulaire(certificat: CertificatEmis): string {
    const p = certificat.profils;
    return p ? `${p.prenom} ${p.nom}`.trim() : 'Compte supprimé';
  }

  protected euros(centimes: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
    }).format(centimes / 100);
  }

  /** Rang de la leçon parmi les leçons offertes : « Leçon offerte 2 sur 3 ». */
  protected rangOffert(offre: Decouverte, lecon: LeconOfferte): number {
    return offre.lecons.indexOf(lecon) + 1;
  }

  /** « Commencer » tant que rien n'est entamé ; « Reprendre » ensuite. */
  protected actionOfferte(offre: Decouverte, lecon: LeconOfferte): string {
    return offre.terminees === 0 && lecon.etat === 'debloque' ? 'Commencer' : 'Reprendre';
  }

  protected pourcentageOffert(offre: Decouverte): number {
    return Math.round((offre.terminees / offre.lecons.length) * 100);
  }

  protected pourcentage(progression: ProgressionResume): number {
    return progression.total === 0
      ? 0
      : Math.round((progression.terminees / progression.total) * 100);
  }

  /**
   * Cible de « Reprendre » : la page du module pour une introduction (le lecteur
   * ne rend pas ce type), la leçon elle-même sinon.
   */
  protected lienReprise(lecon: LeconResume): unknown[] {
    return lecon.type === 'intro'
      ? ['/parcours', lecon.id_section]
      : ['/parcours', lecon.id_section, 'lecon', lecon.id_lecon];
  }

  protected nomComplet(personne: { prenom: string; nom: string } | null): string {
    return personne ? `${personne.prenom} ${personne.nom}`.trim() : 'Utilisateur supprimé';
  }

  protected dateCourte(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
  }

  protected statutPaiement(paiement: PaiementLigne): string {
    const libelles: Record<PaiementLigne['statut'], string> = {
      en_attente: 'En attente',
      reussi: 'Réussi',
      rembourse: 'Remboursé',
      echoue: 'Échoué',
    };
    return libelles[paiement.statut];
  }
}
