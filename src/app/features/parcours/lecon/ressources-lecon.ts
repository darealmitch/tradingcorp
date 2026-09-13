import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import { Ressource, TypeRessource } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { MediaService } from '../../../core/media/media.service';
import { AttachementHls, attacherHls, fluxHls, srcDirect } from '../../../shared/video/lecture-hls';
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
  private readonly contenu = inject(ContenuService);

  readonly ressources = input.required<Ressource[]>();

  /**
   * Vidéos hébergées par le projet : elles se lisent DANS la page, jamais par
   * un lien. Leur adresse ne figure pas dans `url` — elle est demandée signée,
   * comme celle d'un chapitre. Auparavant servies par un lien d'embed Bunny,
   * elles étaient visibles de quiconque avait l'adresse, sans compte.
   */
  protected readonly videos = computed(() =>
    this.ressources().filter((r) => r.type === 'video' && r.a_video_hebergee),
  );

  /** Adresses signées obtenues, par ressource. */
  private readonly adresses = signal<Record<string, string>>({});
  /** Demandes déjà parties — hors signal, pour ne pas relancer l'effet. */
  private readonly demandees = new Set<string>();
  private readonly lecteurs = viewChildren<ElementRef<HTMLVideoElement>>('lecteurRessource');
  private readonly attachements = new Map<string, AttachementHls>();

  constructor() {
    // Une adresse par vidéo, demandée une seule fois. L'effet ne lit que
    // `videos()` : lire `adresses()` ici le ferait se redéclencher à chaque
    // réponse, et boucler.
    effect(() => {
      for (const v of this.videos()) {
        if (!this.demandees.has(v.id_ressource)) {
          this.demandees.add(v.id_ressource);
          void this.demander(v.id_ressource);
        }
      }
    });

    // (Ré)attache hls.js dès qu'un élément et son adresse sont tous deux là.
    effect(() => void this.attacher(this.lecteurs(), this.adresses()));
    inject(DestroyRef).onDestroy(() => {
      for (const attachement of this.attachements.values()) {
        attachement.destroy();
      }
      this.attachements.clear();
    });
  }

  private async demander(idRessource: string): Promise<void> {
    const url = await this.contenu.urlVideoRessourceSignee(idRessource);
    if (url) {
      this.adresses.update((courantes) => ({ ...courantes, [idRessource]: url }));
    }
  }

  /**
   * L'appariement passe par `data-ressource` plutôt que par l'ordre de la
   * liste : un `@for` réordonné ferait sinon jouer une vidéo sous le titre
   * d'une autre.
   */
  private async attacher(
    elements: readonly ElementRef<HTMLVideoElement>[],
    adresses: Record<string, string>,
  ): Promise<void> {
    for (const element of elements) {
      const id = element.nativeElement.dataset['ressource'];
      if (!id || this.attachements.has(id)) {
        continue;
      }
      const flux = fluxHls(adresses[id] ?? null);
      if (!flux) {
        continue;
      }
      // Marqué avant l'await : deux passages de l'effet se chevaucheraient
      // sinon, et attacheraient deux instances au même élément.
      this.attachements.set(id, { destroy: () => undefined });
      const attachement = await attacherHls(flux, element.nativeElement);
      if (attachement) {
        this.attachements.set(id, attachement);
      }
    }
  }

  /** Adresse à poser sur l'attribut `src` — null quand hls.js alimente. */
  protected srcVideo(r: Ressource): string | null {
    return srcDirect(this.adresses()[r.id_ressource] ?? null);
  }

  /** La vidéo est-elle prête à être affichée ? */
  protected videoPrete(r: Ressource): boolean {
    return Boolean(this.adresses()[r.id_ressource]);
  }

  /** Ressources dont le contenu est le texte lui-même (rendu en bloc). */
  protected readonly embarquees = computed(() =>
    this.ressources().filter((r) => r.type === 'documentation' || r.type === 'code'),
  );

  /** Ressources qui pointent vers un média ou une page (rendues en liste). */
  protected readonly liens = computed(() =>
    this.ressources().filter(
      (r) =>
        r.type !== 'documentation' &&
        r.type !== 'code' &&
        !(r.type === 'video' && r.a_video_hebergee),
    ),
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
