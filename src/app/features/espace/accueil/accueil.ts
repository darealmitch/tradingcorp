import {
  ChangeDetectionStrategy,
  Component,
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
import { LeconResume, ProgressionResume } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import {
  ApprenantSuivi,
  CertificatEmis,
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

interface StatsApprenant {
  progression: ProgressionResume;
  prochaines: LeconResume[];
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

  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly apprenant = signal<StatsApprenant | null>(null);
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
      // Au retour de Stripe, le webhook peut mettre quelques secondes à
      // enregistrer l'inscription : on revérifie une fois.
      if (attendreWebhook) {
        setTimeout(() => void this.chargerApprenant(), 2500);
      }
    } else if (role === 'formateur') {
      await this.chargerFormateur();
    } else {
      await this.chargerAdmin();
    }
    this.chargement.set(false);
  }

  private async chargerApprenant(): Promise<void> {
    const [inscriptions, progression, prochaines] = await Promise.all([
      this.commerce.chargerInscriptions(),
      this.contenu.maProgression(),
      this.contenu.prochainesLecons(1),
    ]);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.apprenant.set({ progression, prochaines });
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
    const [paiements, profils, certificats] = await Promise.all([
      this.finance.listerPaiements(),
      this.comptes.lister(),
      this.pilotage.compterCertificats(),
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
    });
  }

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
