import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
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
  private readonly acces = inject(AccesDonnees);

  /** Cent dernières actions, de la plus récente à la plus ancienne (RLS : admin). */
  async listerJournal(): Promise<EntreeJournal[]> {
    return this.acces.lire<EntreeJournal[]>(
      'lecture du journal d’administration',
      this.acces
        .table('journal_admin')
        .select('id_journal, action, cible, date_action, auteur, profils(prenom, nom)')
        .order('date_action', { ascending: false })
        .limit(100),
      [],
    );
  }
}
