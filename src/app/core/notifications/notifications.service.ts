import { Injectable, computed, inject, signal } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';

/**
 * `urgente` demande une action (un achat engage un client) ; `information`
 * relève du suivi, qui se lit en volume. Deux fils distincts à l'affichage.
 */
export type PrioriteNotification = 'urgente' | 'information';

export interface Notification {
  id_notification: string;
  titre: string;
  message: string | null;
  date_envoi: string;
  lue: boolean;
  priorite: PrioriteNotification;
}

interface LigneNotification {
  id_notification: string;
  titre: string;
  message: string | null;
  date_envoi: string;
  lu_le: string | null;
  priorite: PrioriteNotification;
}

/**
 * Notifications du profil connecté (table `notifications`, RLS : ses lignes
 * uniquement). Alimentée côté serveur — ex. le webhook Stripe à l'achat.
 */
/** Notifications chargées d'un coup : le volet n'en affiche jamais autant. */
const MAX_NOTIFICATIONS = 100;

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly acces = inject(AccesDonnees);

  private readonly listeSig = signal<Notification[]>([]);

  readonly liste = this.listeSig.asReadonly();
  readonly nonLues = computed(() => this.listeSig().filter((n) => !n.lue).length);

  /** Événements à traiter (achats) — mis en avant, comptés à part. */
  readonly urgentes = computed(() => this.listeSig().filter((n) => n.priorite === 'urgente'));
  readonly urgentesNonLues = computed(() => this.urgentes().filter((n) => !n.lue).length);

  /** Suivi de la plateforme : comptes créés, progression des apprenants. */
  readonly suivi = computed(() => this.listeSig().filter((n) => n.priorite !== 'urgente'));

  constructor() {
    void this.recharger();
  }

  async recharger(): Promise<void> {
    const lignes = await this.acces.lire<LigneNotification[]>(
      'lecture des notifications',
      this.acces
        .table('notifications')
        .select('id_notification, titre, message, date_envoi, lu_le, priorite')
        .order('date_envoi', { ascending: false })
        // Le volet en montre les plus récentes : au-delà, c'est de l'historique
        // que personne ne déroule, transporté à chaque ouverture (audit P-10).
        .limit(MAX_NOTIFICATIONS),
      [],
    );
    this.listeSig.set(
      lignes.map(({ lu_le, ...notification }) => ({ ...notification, lue: lu_le !== null })),
    );
  }

  /**
   * Marque une notification lue. L'affichage est mis à jour d'abord — le clic
   * doit répondre tout de suite — mais **remis à son état antérieur si
   * l'écriture échoue** : sans ce retour arrière, la pastille disparaissait de
   * l'écran et réapparaissait au rechargement suivant, sans explication.
   */
  async marquerLue(id: string): Promise<string | null> {
    const avant = this.listeSig();
    this.listeSig.update((liste) =>
      liste.map((n) => (n.id_notification === id ? { ...n, lue: true } : n)),
    );

    const erreur = await this.acces.ecrire(
      'marquage d’une notification',
      this.acces
        .table('notifications')
        .update({ lu_le: new Date().toISOString() })
        .eq('id_notification', id)
        .is('lu_le', null),
      'La notification n’a pas pu être marquée comme lue.',
    );
    if (erreur) {
      this.listeSig.set(avant);
    }
    return erreur;
  }

  async toutMarquerLues(): Promise<string | null> {
    const avant = this.listeSig();
    this.listeSig.update((liste) => liste.map((n) => ({ ...n, lue: true })));

    const erreur = await this.acces.ecrire(
      'marquage de toutes les notifications',
      this.acces
        .table('notifications')
        .update({ lu_le: new Date().toISOString() })
        .is('lu_le', null),
      'Les notifications n’ont pas pu être marquées comme lues.',
    );
    if (erreur) {
      this.listeSig.set(avant);
    }
    return erreur;
  }
}
