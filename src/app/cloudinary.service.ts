import { Injectable } from '@angular/core';
import { Cloudinary } from '@cloudinary/url-gen';
import { environment } from '../environments/environment';

/**
 * Cloudinary — médias du projet uniquement (captures, images de formation,
 * illustrations, ressources pédagogiques). Les identifiants/URLs Cloudinary
 * sont stockés dans les tables métier concernées (formations, leçons,
 * ressources…), jamais dans `profils` : le profil utilisateur ne gère aucune
 * image.
 */
@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  cld = new Cloudinary({
    cloud: {
      cloudName: environment.cloudinaryCloudName,
    },
  });
}
