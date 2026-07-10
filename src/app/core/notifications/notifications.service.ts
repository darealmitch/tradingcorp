import { Injectable, computed, inject, signal } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

export interface Notification {
  id_notification: string;
  titre: string;
  message: string | null;
  date_envoi: string;
  lue: boolean;
}

interface LigneNotification {
  id_notification: string;
  titre: string;
  message: string | null;
  date_envoi: string;
  lu_le: string | null;
}

/**
 * Notifications du profil connecté (table `notifications`, RLS : ses lignes
 * uniquement). Alimentée côté serveur — ex. le webhook Stripe à l'achat.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly supabase = inject(SUPABASE);

  private readonly listeSig = signal<Notification[]>([]);

  readonly liste = this.listeSig.asReadonly();
  readonly nonLues = computed(() => this.listeSig().filter((n) => !n.lue).length);

  constructor() {
    void this.recharger();
  }

  async recharger(): Promise<void> {
    const { data } = await this.supabase
      .from('notifications')
      .select('id_notification, titre, message, date_envoi, lu_le')
      .order('date_envoi', { ascending: false });
    const lignes = (data as LigneNotification[] | null) ?? [];
    this.listeSig.set(
      lignes.map(({ lu_le, ...notification }) => ({ ...notification, lue: lu_le !== null })),
    );
  }

  async marquerLue(id: string): Promise<void> {
    this.listeSig.update((liste) =>
      liste.map((n) => (n.id_notification === id ? { ...n, lue: true } : n)),
    );
    await this.supabase
      .from('notifications')
      .update({ lu_le: new Date().toISOString() })
      .eq('id_notification', id)
      .is('lu_le', null);
  }

  async toutMarquerLues(): Promise<void> {
    this.listeSig.update((liste) => liste.map((n) => ({ ...n, lue: true })));
    await this.supabase
      .from('notifications')
      .update({ lu_le: new Date().toISOString() })
      .is('lu_le', null);
  }
}
