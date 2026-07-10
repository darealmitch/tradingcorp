import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Role } from '../auth/profil.model';
import { ProfilAdmin } from './profil-admin.model';

export interface PaiementLigne {
  id_paiement: string;
  montant_centimes: number;
  devise: string;
  statut: 'en_attente' | 'reussi' | 'rembourse' | 'echoue';
  moyen_paiement: string | null;
  reference_transaction: string;
  email: string | null;
  date_paiement: string;
}

export interface EntreeJournal {
  id_journal: string;
  action: string;
  cible: string | null;
  date_action: string;
  profils: { prenom: string; nom: string } | null;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SUPABASE);

  /** Tous les profils avec e-mail (RPC réservée aux admins — vide sinon). */
  async listerProfils(): Promise<ProfilAdmin[]> {
    const { data } = await this.supabase.rpc('lister_profils_admin');
    return (data as ProfilAdmin[] | null) ?? [];
  }

  /**
   * Change le rôle d'un profil via la fonction SQL changer_role — seule voie
   * possible, la colonne `role` n'étant plus modifiable directement.
   * Retourne un message d'erreur prêt à afficher, ou null en cas de succès.
   */
  async changerRole(idProfil: string, role: Role): Promise<string | null> {
    const { error } = await this.supabase.rpc('changer_role', {
      p_id_profil: idProfil,
      p_role: role,
    });
    if (!error) {
      return null;
    }
    return error.message.includes('propre rôle')
      ? 'Tu ne peux pas modifier ton propre rôle.'
      : 'Le changement de rôle a échoué. Réessaie.';
  }

  /** Historique complet des paiements (RLS : admin uniquement). */
  async listerPaiements(): Promise<PaiementLigne[]> {
    const { data } = await this.supabase
      .from('paiements')
      .select(
        'id_paiement, montant_centimes, devise, statut, moyen_paiement, reference_transaction, email, date_paiement',
      )
      .order('date_paiement', { ascending: false });
    return (data as PaiementLigne[] | null) ?? [];
  }

  /** Piste d'audit (RLS : admin uniquement). */
  async listerJournal(): Promise<EntreeJournal[]> {
    const { data } = await this.supabase
      .from('journal_admin')
      .select('id_journal, action, cible, date_action, profils(prenom, nom)')
      .order('date_action', { ascending: false })
      .limit(100);
    return (data as unknown as EntreeJournal[] | null) ?? [];
  }

  /** Nombre de certificats émis (lecture staff via RLS). */
  async compterCertificats(): Promise<number> {
    const { count } = await this.supabase
      .from('certificats')
      .select('id_certificat', { count: 'exact', head: true });
    return count ?? 0;
  }
}
