import { Injectable, inject } from '@angular/core';
import { Cloudinary } from '@cloudinary/url-gen';
import { environment } from '../../../environments/environment';
import { AccesDonnees } from '../supabase/acces-donnees';

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
  allowedFormats: string;
  maxOctets: number;
}

/** Catégories téléversables — doivent correspondre à `cloudinary-signature`. */
export type CategorieMedia = 'image' | 'document' | 'audio';

/**
 * Types MIME acceptés par catégorie. Ce contrôle est un CONFORT : il évite un
 * aller-retour inutile et donne un message clair. La contrainte opposable est
 * `allowed_formats`, signée par l'Edge Function et appliquée par Cloudinary —
 * un fichier renommé passe ici mais sera rejeté là-bas.
 */
const MIME_ATTENDUS: Record<CategorieMedia, RegExp> = {
  image: /^image\/(jpeg|png|webp|avif)$/,
  document: /^application\/pdf$/,
  audio: /^audio\/(mpeg|mp4|x-m4a|wav|wave|x-wav)$/,
};

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
  private readonly acces = inject(AccesDonnees);

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
   *
   * Les deux étapes peuvent échouer séparément et pour des raisons distinctes
   * (refus de signature, rejet de Cloudinary) : chacune laisse donc sa propre
   * trace, faute de quoi un téléversement raté ne dit pas où il a buté.
   *
   * @param dossier sous-dossier Cloudinary (ex. 'formations', 'ressources').
   * @param categorie détermine les formats acceptés et la taille maximale.
   */
  async televerser(
    fichier: File,
    dossier = 'tradingcorp',
    categorie: CategorieMedia = 'image',
  ): Promise<MediaTeleverse | null> {
    if (!MIME_ATTENDUS[categorie].test(fichier.type)) {
      console.error(`[TradingCorp] téléversement refusé — type de fichier non autorisé`);
      return null;
    }

    const { donnees: sig } = await this.acces.invoquer<SignatureUpload>(
      'signature de téléversement',
      'cloudinary-signature',
      { folder: dossier, categorie },
    );
    if (!sig) {
      return null;
    }

    // Contrôle de taille fait APRÈS la signature : la borne vient du serveur,
    // pas d'une constante du bundle qu'il suffirait de recompiler.
    if (fichier.size > sig.maxOctets) {
      console.error(
        `[TradingCorp] téléversement refusé — fichier trop volumineux ` +
          `(${Math.round(fichier.size / 1024 / 1024)} Mo, maximum ${Math.round(sig.maxOctets / 1024 / 1024)} Mo)`,
      );
      return null;
    }

    const form = new FormData();
    form.append('file', fichier);
    form.append('api_key', sig.apiKey);
    form.append('timestamp', String(sig.timestamp));
    form.append('folder', sig.folder);
    // Doit être renvoyé à l'identique : la signature couvre ce paramètre, donc
    // l'omettre ou le modifier fait rejeter l'upload par Cloudinary.
    form.append('allowed_formats', sig.allowedFormats);
    form.append('signature', sig.signature);

    const reponse = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/auto/upload`, {
      method: 'POST',
      body: form,
    }).catch(() => null);
    if (!reponse?.ok) {
      // Cloudinary est hors du périmètre d'`AccesDonnees` (ce n'est pas
      // Supabase), mais son échec doit laisser la même trace que les autres.
      console.error(
        `[TradingCorp] téléversement Cloudinary — ${reponse ? `HTTP ${reponse.status}` : 'réseau injoignable'}`,
      );
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
