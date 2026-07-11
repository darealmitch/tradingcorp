import { Injectable, inject } from '@angular/core';
import { Cloudinary } from '@cloudinary/url-gen';
import { environment } from '../../../environments/environment';
import { SUPABASE } from '../supabase/supabase.client';

/** Média téléversé sur Cloudinary — à stocker dans la table métier concernée. */
export interface MediaTeleverse {
  publicId: string;
  url: string;
  format: string;
  largeur: number;
  hauteur: number;
}

interface SignatureUpload {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
}

/**
 * Service officiel de gestion des médias du projet (captures, illustrations,
 * images de formation, ressources) via Cloudinary.
 *
 * Sécurité : seul le Cloud Name (public) est côté navigateur. Les uploads sont
 * signés par l'Edge Function `cloudinary-signature`, qui détient l'API Secret —
 * aucune clé secrète n'est jamais embarquée dans le build Angular.
 *
 * Les URLs / public_id retournés se stockent dans les tables métier
 * (formations, leçons, ressources…), jamais dans `profils`.
 */
@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly supabase = inject(SUPABASE);

  // Instance de livraison : construit les URLs optimisées (Cloud Name public).
  // analytics/forceVersion off → URLs canoniques, sans suffixe `_a` ni `v1`.
  private readonly cld = new Cloudinary({
    cloud: { cloudName: environment.cloudinaryCloudName },
    url: { analytics: false, forceVersion: false },
  });

  /** URL de livraison image optimisée (format & qualité automatiques). */
  url(publicId: string): string {
    return this.cld.image(publicId).addTransformation('f_auto,q_auto').toURL();
  }

  /** URL de livraison vidéo optimisée (format & qualité automatiques). */
  videoUrl(publicId: string): string {
    return this.cld.video(publicId).addTransformation('f_auto,q_auto').toURL();
  }

  /** URL de livraison d'un PDF (documents pédagogiques). */
  pdfUrl(publicId: string): string {
    return this.cld.image(publicId).toURL();
  }

  /**
   * Téléverse un média (réservé au staff). Demande une signature à l'Edge
   * Function, puis POST direct vers Cloudinary. Retourne null en cas d'échec.
   * @param dossier sous-dossier Cloudinary (ex. 'formations', 'ressources').
   */
  async televerser(fichier: File, dossier = 'tradingcorp'): Promise<MediaTeleverse | null> {
    const { data: sig, error } = await this.supabase.functions.invoke<SignatureUpload>(
      'cloudinary-signature',
      { body: { folder: dossier } },
    );
    if (error || !sig) {
      return null;
    }

    const form = new FormData();
    form.append('file', fichier);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    form.append('signature', sig.signature);

    const reponse = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    });
    if (!reponse.ok) {
      return null;
    }

    const data = (await reponse.json()) as {
      public_id: string;
      secure_url: string;
      format: string;
      width: number;
      height: number;
    };
    return {
      publicId: data.public_id,
      url: data.secure_url,
      format: data.format,
      largeur: data.width,
      hauteur: data.height,
    };
  }
}
