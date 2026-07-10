import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { SUPABASE } from '../supabase/supabase.client';

const TAILLE_AVATAR = 400;

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

  /**
   * Redimensionne l'image côté client (carré WebP ~400px), la téléverse dans
   * avatars/{uid}/avatar.webp et pointe profils.avatar_url dessus.
   * Retourne un message d'erreur prêt à afficher, ou null en cas de succès.
   */
  async televerserAvatar(fichier: File): Promise<string | null> {
    const id = this.auth.profil()?.id_profil;
    if (!id) {
      return 'Session expirée. Reconnecte-toi.';
    }
    if (!fichier.type.startsWith('image/')) {
      return 'Choisis un fichier image.';
    }

    let image: Blob;
    try {
      image = await this.redimensionner(fichier);
    } catch {
      return "L'image n'a pas pu être traitée.";
    }

    const chemin = `${id}/avatar.webp`;
    const { error: erreurUpload } = await this.supabase.storage
      .from('avatars')
      .upload(chemin, image, { upsert: true, contentType: 'image/webp' });
    if (erreurUpload) {
      return 'Le téléversement a échoué. Réessaie.';
    }

    const { data } = this.supabase.storage.from('avatars').getPublicUrl(chemin);
    // Suffixe anti-cache : le chemin est réutilisé à chaque changement d'avatar.
    const url = `${data.publicUrl}?v=${Date.now()}`;
    const { error } = await this.supabase
      .from('profils')
      .update({ avatar_url: url })
      .eq('id_profil', id);
    if (error) {
      return "L'avatar a été envoyé mais le profil n'a pas pu être mis à jour.";
    }
    await this.auth.rechargerProfil();
    return null;
  }

  /** Recadrage carré centré + export WebP via canvas — aucune dépendance. */
  private redimensionner(fichier: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(image.src);
        const cote = Math.min(image.width, image.height);
        const canvas = document.createElement('canvas');
        canvas.width = TAILLE_AVATAR;
        canvas.height = TAILLE_AVATAR;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas indisponible'));
          return;
        }
        const dx = (image.width - cote) / 2;
        const dy = (image.height - cote) / 2;
        ctx.drawImage(image, dx, dy, cote, cote, 0, 0, TAILLE_AVATAR, TAILLE_AVATAR);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('encodage impossible'))),
          'image/webp',
          0.85,
        );
      };
      image.onerror = () => {
        URL.revokeObjectURL(image.src);
        reject(new Error('image illisible'));
      };
      image.src = URL.createObjectURL(fichier);
    });
  }
}
