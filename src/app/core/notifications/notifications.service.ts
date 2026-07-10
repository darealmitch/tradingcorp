import { Injectable, computed, signal } from '@angular/core';

export interface Notification {
  id: number;
  titre: string;
  message: string;
  date: string;
  lue: boolean;
}

/**
 * Données simulées en attendant le branchement sur la table `notifications`
 * (l'API du service ne changera pas : seule l'origine des données bougera).
 */
const NOTIFICATIONS_DEMO: Notification[] = [
  {
    id: 1,
    titre: 'Bienvenue sur TradingCorp',
    message: 'Ton espace est prêt. Commence par découvrir ta formation.',
    date: 'il y a 2 h',
    lue: false,
  },
  {
    id: 2,
    titre: 'Nouvelle leçon disponible',
    message: '« Structure de marché : les bases » vient d’être publiée.',
    date: 'il y a 5 h',
    lue: false,
  },
  {
    id: 3,
    titre: 'Quiz à terminer',
    message: 'Le quiz « Gestion du risque » t’attend toujours.',
    date: 'hier',
    lue: true,
  },
  {
    id: 4,
    titre: 'Paiement confirmé',
    message: 'Ton accès à la formation Trader Pro est actif.',
    date: 'il y a 3 jours',
    lue: true,
  },
];

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly listeSig = signal<Notification[]>(NOTIFICATIONS_DEMO);

  readonly liste = this.listeSig.asReadonly();
  readonly nonLues = computed(() => this.listeSig().filter((n) => !n.lue).length);

  marquerLue(id: number): void {
    this.listeSig.update((liste) => liste.map((n) => (n.id === id ? { ...n, lue: true } : n)));
  }

  toutMarquerLues(): void {
    this.listeSig.update((liste) => liste.map((n) => ({ ...n, lue: true })));
  }
}
