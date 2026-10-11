import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
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
  /** Page concernée — la leçon d'une réponse, la liste des apprenants… — ou null. */
  lien: string | null;
}

interface LigneNotification {
  id_notification: string;
  titre: string;
  message: string | null;
  date_envoi: string;
  lu_le: string | null;
  priorite: PrioriteNotification;
  lien: string | null;
}

/** Notifications chargées d'un coup : le volet n'en affiche jamais autant. */
const MAX_NOTIFICATIONS = 100;

/**
 * Écart minimal entre deux rafraîchissements au retour sur l'onglet. Revenir
 * sur un onglet déclenche souvent deux événements à la suite — l'onglet
 * redevient visible, la fenêtre reprend le focus — et un aller-retour rapide
 * entre deux onglets n'a rien pu apporter : une seule lecture suffit.
 */
export const ECART_RAFRAICHISSEMENT_MS = 5_000;

/**
 * Notifications du profil connecté (table `notifications`, RLS : ses lignes
 * uniquement). Alimentée côté serveur — ex. le webhook Stripe à l'achat.
 *
 * La liste suit le compte connecté. La déconnexion ne recharge pas la page :
 * sans cela, le compte suivant du même onglet voyait les notifications du
 * précédent, et jamais les siennes. Elle se rafraîchit aussi au retour sur
 * l'onglet : une notification arrivée pendant que l'espace restait ouvert
 * n'apparaissait qu'au rechargement de la page.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly acces = inject(AccesDonnees);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly destruction = inject(DestroyRef);

  private readonly listeSig = signal<Notification[]>([]);

  readonly liste = this.listeSig.asReadonly();
  readonly nonLues = computed(() => this.listeSig().filter((n) => !n.lue).length);

  /** Événements à traiter (achats) — mis en avant, comptés à part. */
  readonly urgentes = computed(() => this.listeSig().filter((n) => n.priorite === 'urgente'));
  readonly urgentesNonLues = computed(() => this.urgentes().filter((n) => !n.lue).length);

  /** Suivi de la plateforme : comptes créés, progression des apprenants. */
  readonly suivi = computed(() => this.listeSig().filter((n) => n.priorite !== 'urgente'));

  /**
   * Le compte et non la session : le jeton se renouvelle toutes les heures, et
   * ce renouvellement ne doit ni vider ni relire la liste.
   */
  private readonly compte = computed(() => this.auth.session()?.user.id ?? null);

  private dernierRafraichissement = 0;

  constructor() {
    // Vidée AVANT d'être relue : le compte qui arrive ne doit jamais voir,
    // même le temps d'une lecture, les notifications de celui qui part.
    effect(() => {
      const compte = this.compte();
      untracked(() => {
        this.listeSig.set([]);
        if (compte) {
          void this.recharger();
        }
      });
    });

    const auRetour = (): void => this.rafraichirAuRetour();
    const fenetre = this.document.defaultView;
    this.document.addEventListener('visibilitychange', auRetour);
    fenetre?.addEventListener('focus', auRetour);
    this.destruction.onDestroy(() => {
      this.document.removeEventListener('visibilitychange', auRetour);
      fenetre?.removeEventListener('focus', auRetour);
    });
  }

  /**
   * Relit la liste du compte connecté : à chaque changement de compte, au
   * retour sur l'onglet, et à l'ouverture de la page des notifications.
   */
  async recharger(): Promise<void> {
    const compte = this.compte();
    const lignes = await this.acces.lire<LigneNotification[] | null>(
      'lecture des notifications',
      this.acces
        .table('notifications')
        .select('id_notification, titre, message, date_envoi, lu_le, priorite, lien')
        .order('date_envoi', { ascending: false })
        // Le volet en montre les plus récentes : au-delà, c'est de l'historique
        // que personne ne déroule, transporté à chaque ouverture (audit P-10).
        .limit(MAX_NOTIFICATIONS),
      null,
    );
    // Le compte a changé pendant la lecture — déconnexion, autre compte dans
    // le même onglet : la réponse décrit les notifications d'un autre.
    if (this.compte() !== compte) {
      return;
    }
    // Lecture en échec : la liste reste celle d'avant. Un rafraîchissement
    // raté au retour sur l'onglet ne doit pas effacer les notifications.
    if (lignes === null) {
      return;
    }
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
    const compte = this.compte();
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
    this.revenirSiMemeCompte(erreur, avant, compte);
    return erreur;
  }

  async toutMarquerLues(): Promise<string | null> {
    const avant = this.listeSig();
    const compte = this.compte();
    this.listeSig.update((liste) => liste.map((n) => ({ ...n, lue: true })));

    const erreur = await this.acces.ecrire(
      'marquage de toutes les notifications',
      this.acces
        .table('notifications')
        .update({ lu_le: new Date().toISOString() })
        .is('lu_le', null),
      'Les notifications n’ont pas pu être marquées comme lues.',
    );
    this.revenirSiMemeCompte(erreur, avant, compte);
    return erreur;
  }

  /**
   * Le retour arrière d'une écriture en échec. Jamais après un changement de
   * compte : `avant` serait alors la liste d'un autre.
   */
  private revenirSiMemeCompte(
    erreur: string | null,
    avant: Notification[],
    compte: string | null,
  ): void {
    if (erreur && this.compte() === compte) {
      this.listeSig.set(avant);
    }
  }

  private rafraichirAuRetour(): void {
    const recent = Date.now() - this.dernierRafraichissement < ECART_RAFRAICHISSEMENT_MS;
    if (!this.compte() || this.document.visibilityState !== 'visible' || recent) {
      return;
    }
    this.dernierRafraichissement = Date.now();
    void this.recharger();
  }
}
