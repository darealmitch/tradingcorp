import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { EntreeJournal } from './audit.model';

/**
 * Piste d'audit des actions d'administration.
 *
 * Lecture seule côté client : les entrées sont écrites par les fonctions SQL
 * `SECURITY DEFINER` et les Edge Functions, jamais depuis le navigateur — une
 * piste d'audit que son sujet pourrait amender ne vaudrait rien.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly supabase = inject(SUPABASE);

  /** Cent dernières actions, de la plus récente à la plus ancienne (RLS : admin). */
  async listerJournal(): Promise<EntreeJournal[]> {
    const { data } = await this.supabase
      .from('journal_admin')
      .select('id_journal, action, cible, date_action, auteur, profils(prenom, nom)')
      .order('date_action', { ascending: false })
      .limit(100);
    return (data as unknown as EntreeJournal[] | null) ?? [];
  }
}
