import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { Role } from '../auth/profil.model';
import { ProfilAdmin } from './profil-admin.model';

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
}
