import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase.client';

@Injectable({ providedIn: 'root' })
export class ProfilService {
  private readonly supabase = inject(SUPABASE);
  private readonly auth = inject(AuthService);

  /**
   * Change le surnom via la RPC changer_surnom, qui applique la règle des
   * 30 jours côté serveur (la colonne n'est jamais modifiable directement).
   * Retourne un message d'erreur prêt à afficher, ou null en cas de succès.
   */
  async changerSurnom(surnom: string): Promise<string | null> {
    const { error } = await this.supabase.rpc('changer_surnom', { p_surnom: surnom });
    if (error) {
      const message = error.message;
      if (message.includes('récemment')) {
        return message; // Contient déjà la date de prochaine modification.
      }
      if (message.includes('vide')) {
        return 'Le surnom ne peut pas être vide.';
      }
      if (message.includes('30 caractères')) {
        return 'Le surnom ne doit pas dépasser 30 caractères.';
      }
      return 'La modification du surnom a échoué. Réessaie.';
    }
    await this.auth.rechargerProfil();
    return null;
  }
}
