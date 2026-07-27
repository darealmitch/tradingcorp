import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Ressource, TypeRessource } from '../../../core/contenu/apprentissage.model';
import { MediaService } from '../../../core/media/media.service';
import { Icone } from '../../../shared/ui/icone';

/** Présentation d'un type : icône, libellé de catégorie, intitulé de l'action. */
interface Presentation {
  icone: string;
  categorie: string;
  action: string;
}

const PRESENTATIONS: Record<TypeRessource, Presentation> = {
  pdf: { icone: 'lecture', categorie: 'Document', action: 'Ouvrir le PDF' },
  audio: { icone: 'lecture', categorie: 'Livre audio', action: 'Écouter' },
  video: { icone: 'formation', categorie: 'Vidéo', action: 'Regarder' },
  fichier: { icone: 'liste', categorie: 'Téléchargement', action: 'Télécharger' },
  lien: { icone: 'fleche', categorie: 'Lien', action: 'Ouvrir' },
  documentation: { icone: 'liste', categorie: 'Documentation', action: '' },
  code: { icone: 'contenus', categorie: 'Exemple de code', action: '' },
  partenaire: { icone: 'etoile', categorie: 'Partenaire', action: "S'inscrire" },
};

/**
 * Ressources complémentaires d'une leçon.
 *
 * L'affichage suit le TYPE de la ressource, pas sa source : un PDF Cloudinary
 * et un fichier distant se présentent pareil, tandis qu'un bloc de code et un
 * lien partenaire n'ont rien à voir. Les ressources inactives ou appartenant à
 * une leçon verrouillée ne parviennent jamais ici — la RLS les a écartées.
 */
@Component({
  selector: 'app-ressources-lecon',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ressources-lecon.html',
  styleUrl: './ressources-lecon.css',
})
export class RessourcesLecon {
  private readonly media = inject(MediaService);

  readonly ressources = input.required<Ressource[]>();

  /** Ressources dont le contenu est le texte lui-même (rendu en bloc). */
  protected readonly embarquees = computed(() =>
    this.ressources().filter((r) => r.type === 'documentation' || r.type === 'code'),
  );

  /** Ressources qui pointent vers un média ou une page (rendues en liste). */
  protected readonly liens = computed(() =>
    this.ressources().filter((r) => r.type !== 'documentation' && r.type !== 'code'),
  );

  protected presentation(r: Ressource): Presentation {
    return PRESENTATIONS[r.type] ?? PRESENTATIONS.fichier;
  }

  /**
   * URL de consultation. `url` prime : c'est la source des liens externes et
   * des vidéos Bunny. Cloudinary prend le relais pour les fichiers téléversés,
   * en livraison vidéo ou document selon le type.
   */
  protected href(r: Ressource): string | null {
    if (r.url) {
      return r.url;
    }
    if (r.cloudinary_public_id) {
      return r.type === 'video' || r.type === 'audio'
        ? this.media.videoUrl(r.cloudinary_public_id)
        : this.media.pdfUrl(r.cloudinary_public_id);
    }
    return r.chemin_storage;
  }

  /** Un lien sortant s'ouvre dans un nouvel onglet, pas un fichier du cours. */
  protected estExterne(r: Ressource): boolean {
    return r.type === 'lien' || r.type === 'partenaire';
  }

  protected poids(r: Ressource): string | null {
    if (!r.taille) {
      return null;
    }
    const mo = r.taille / 1024 / 1024;
    return mo >= 1 ? `${mo.toFixed(1)} Mo` : `${Math.round(r.taille / 1024)} Ko`;
  }
}
