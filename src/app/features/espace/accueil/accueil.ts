import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { BarreProgression } from '../../../shared/ui/barre-progression';
import { Icone } from '../../../shared/ui/icone';
import { StatCard } from '../../../shared/ui/stat-card';

/* Données simulées en attendant le branchement progressif sur Supabase
   (progression_lecons, tentatives_quiz, paiements, journal_admin…). */

const PROGRESSION_DEMO = {
  pourcentage: 35,
  leconsTerminees: 8,
  leconsTotal: 23,
  quizReussis: 1,
  quizTotal: 4,
  certificats: 0,
  derniereLecon: 'Structure de marché : lecture des ranges',
  prochaines: [
    { titre: 'Liquidité et zones de déséquilibre', duree: '18 min' },
    { titre: 'Gestion du risque : position sizing', duree: '24 min' },
    { titre: 'Quiz — Structure de marché', duree: '10 questions' },
  ],
};

const FORMATEUR_DEMO = {
  apprenants: 148,
  leconsPubliees: 23,
  commentairesEnAttente: 5,
  noteMoyenne: '4,8 / 5',
  derniersCommentaires: [
    {
      auteur: 'Lucas M.',
      lecon: 'Gestion du risque',
      extrait: 'Super clair, merci !',
      date: 'il y a 1 h',
    },
    {
      auteur: 'Sarah B.',
      lecon: 'Analyse fondamentale',
      extrait: 'Une question sur le calcul du ratio…',
      date: 'il y a 3 h',
    },
    {
      auteur: 'Karim D.',
      lecon: 'Psychologie du trading',
      extrait: 'Exactement ce qui me manquait.',
      date: 'hier',
    },
  ],
  activite: [
    {
      titre: '12 leçons terminées',
      detail: 'par les apprenants ces dernières 24 h',
      date: 'aujourd’hui',
    },
    { titre: '3 quiz réussis', detail: 'dont 2 au premier essai', date: 'aujourd’hui' },
    { titre: '5 nouveaux apprenants', detail: 'inscrits cette semaine', date: 'cette semaine' },
  ],
};

const ADMIN_DEMO = {
  caMois: '5 982 €',
  caTotal: '48 550 €',
  apprenants: 156,
  certificatsEmis: 31,
  activite: [
    {
      icone: 'paiements',
      titre: 'Paiement confirmé',
      detail: 'Formation Trader Pro — 997 €',
      date: 'il y a 12 min',
    },
    {
      icone: 'profil',
      titre: 'Nouvel utilisateur',
      detail: 'm.laurent@exemple.com a créé un compte',
      date: 'il y a 40 min',
    },
    {
      icone: 'diplome',
      titre: 'Certificat émis',
      detail: 'TC-2026-0031 — Julie R.',
      date: 'il y a 2 h',
    },
    {
      icone: 'moderation',
      titre: 'Avis en attente',
      detail: '« Formation exceptionnelle… » — 5 ★',
      date: 'il y a 4 h',
    },
  ],
  indicateurs: [
    { libelle: 'Taux de complétion', valeur: 68 },
    { libelle: 'Taux de réussite aux quiz', valeur: 81 },
    { libelle: 'Satisfaction (avis approuvés)', valeur: 94 },
  ],
};

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

  protected readonly auth = inject(AuthService);

  protected readonly progression = PROGRESSION_DEMO;
  protected readonly formateur = FORMATEUR_DEMO;
  protected readonly admin = ADMIN_DEMO;

  protected readonly chargement = signal(true);
  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly retourAchat = signal<'succes' | 'annule' | null>(null);

  protected readonly possedeFormation = computed(() => this.inscrites().size > 0);

  constructor() {
    // Retour de Stripe Checkout : l'Edge Function redirige vers /espace?achat=…
    const retour = inject(ActivatedRoute).snapshot.queryParamMap.get('achat');
    if (retour === 'succes' || retour === 'annule') {
      this.retourAchat.set(retour);
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
    void this.charger(retour === 'succes');
  }

  private async charger(attendreWebhook: boolean): Promise<void> {
    const inscriptions = await this.commerce.chargerInscriptions();
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.chargement.set(false);

    // Au retour de Stripe, le webhook peut mettre quelques secondes à
    // enregistrer l'inscription : on revérifie une fois.
    if (attendreWebhook) {
      setTimeout(() => void this.charger(false), 2500);
    }
  }
}
