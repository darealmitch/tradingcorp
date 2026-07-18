import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AdminService, PaiementLigne, compteDansCa } from '../../../core/admin/admin.service';
import { ProfilAdmin } from '../../../core/admin/profil-admin.model';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommerceService } from '../../../core/commerce/commerce.service';
import {
  ContenuService,
  InscriptionRecente,
  LeconResume,
  ProgressionResume,
} from '../../../core/contenu/contenu.service';
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
  private readonly moderation = inject(ModerationService);
  private readonly adminService = inject(AdminService);

  protected readonly auth = inject(AuthService);

  protected readonly chargement = signal(true);
  protected readonly retourAchat = signal<'succes' | 'annule' | null>(null);

  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly apprenant = signal<StatsApprenant | null>(null);
  protected readonly formateur = signal<StatsFormateur | null>(null);
  protected readonly admin = signal<StatsAdmin | null>(null);

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
        this.contenu.compterApprenants(),
        this.contenu.compterLecons(),
        this.moderation.compterCommentairesEnAttente(),
        this.moderation.noteMoyenne(),
        this.moderation.commentairesEnAttente(),
        this.contenu.inscriptionsRecentes(4),
      ]);
    this.formateur.set({
      apprenants,
      lecons,
      commentairesEnAttente,
      noteMoyenne,
      commentaires: commentaires.slice(0, 3),
      inscriptions,
    });
  }

  private async chargerAdmin(): Promise<void> {
    const [paiements, profils, certificats] = await Promise.all([
      this.adminService.listerPaiements(),
      this.adminService.listerProfils(),
      this.adminService.compterCertificats(),
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
      apprenants: profils.filter((p) => p.role === 'apprenant' && !p.est_test).length,
      certificats,
      paiements: paiements.slice(0, 4),
      nouveauxComptes: profils
        .filter((p) => !p.est_test)
        .sort((a, b) => b.date_creation.localeCompare(a.date_creation))
        .slice(0, 4),
    });
  }

  // ===== Aides d'affichage =====

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
