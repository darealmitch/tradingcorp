import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ContenuService } from '../../../core/contenu/contenu.service';
import {
  LeconResume,
  Module,
  RessourceResume,
  TypeRessource,
} from '../../../core/contenu/apprentissage.model';

/**
 * Hébergeurs officiels du projet. Une vidéo servie depuis un autre domaine est
 * un provisoire — typiquement le `BigBuckBunny.mp4` que `seed_chapitres.sql`
 * pose sur chaque chapitre pour que le parcours soit navigable avant tournage.
 */
const HEBERGEURS_PROJET = ['b-cdn.net', 'mediadelivery.net', 'res.cloudinary.com'];

/** Libellés compacts : la colonne Médias est étroite. */
const TYPES_COURTS: Record<TypeRessource, string> = {
  pdf: 'PDF',
  audio: 'Audio',
  video: 'Vidéo',
  fichier: 'Fichier',
  lien: 'Lien',
  documentation: 'Doc',
  code: 'Code',
  partenaire: 'Partenaire',
};

@Component({
  selector: 'app-contenus',
  templateUrl: './contenus.html',
  styleUrls: ['../espace-pages.css', './contenus.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contenus {
  private readonly contenu = inject(ContenuService);

  protected readonly chargement = signal(true);
  protected readonly modules = signal<Module[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.modules.set(await this.contenu.chargerStructure());
    this.chargement.set(false);
  }

  /**
   * Durée exacte, secondes comprises. L'arrondi à la minute précédent
   * (`Math.round`) faisait passer 767 s pour « 13 min » alors que la vidéo dure
   * 12 min 47 s : dans un back-office qui sert à contrôler le contenu, la durée
   * affichée doit être celle de la vidéo, pas une approximation.
   */
  protected duree(lecon: LeconResume): string {
    const total = lecon.duree_s;
    if (!total) {
      return '—';
    }
    const heures = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secondes = total % 60;

    const parties: string[] = [];
    if (heures) {
      parties.push(`${heures} h`);
    }
    // Deux chiffres toujours (« 02 min », « 02 s »), pas seulement pour les
    // secondes : sinon « 1 h 2 min 05 s » et « 1 h 02 min 5 s » cohabitent
    // selon la vidéo, une incohérence visuelle sans raison.
    if (minutes) {
      parties.push(`${String(minutes).padStart(2, '0')} min`);
    }
    // Les secondes ne sont tues que si elles sont nulles ET qu'autre chose
    // s'affiche déjà — une durée de 0 s n'existe pas, mais 5 min pile si.
    if (secondes || parties.length === 0) {
      parties.push(`${String(secondes).padStart(2, '0')} s`);
    }
    return parties.join(' ');
  }

  /**
   * Contenu porté par l'étape elle-même, rendu comme les ressources : une
   * pastille par élément. Le texte gris précédent opposait deux traitements
   * visuels à une même information, ce qui rendait la colonne illisible.
   *
   * Le tiret n'est plus produit ici : la cellule n'affiche « aucun média » que
   * si l'étape n'a NI contenu propre NI ressource complémentaire — sinon on
   * annonçait « — » juste au-dessus d'une pastille.
   */
  protected mediasPropres(lecon: LeconResume): { libelle: string; provisoire: boolean }[] {
    const items: { libelle: string; provisoire: boolean }[] = [];
    // Mêmes sources que le lecteur (`videoUrl()`) : `video_url` prime et suffit
    // à elle seule. Ne tester que `video_provider_id` faisait passer pour vides
    // les chapitres servis par une URL Bunny directe.
    if (lecon.video_url || lecon.video_provider_id) {
      items.push({ libelle: 'Vidéo', provisoire: !this.videoDefinitive(lecon) });
    }
    if (lecon.pdf_public_id) {
      items.push({ libelle: 'PDF', provisoire: false });
    }
    // Un chapitre quiz porte ses questions, pas un fichier : sans pastille il
    // tombait dans le tiret, comme s'il était vide.
    if (lecon.type === 'quiz') {
      items.push({ libelle: 'Quiz', provisoire: false });
    }
    return items;
  }

  /**
   * Une vidéo n'est définitive que servie par un hébergeur du projet. Sans ce
   * contrôle, le placeholder de démonstration passait pour un contenu en ligne :
   * le tableau affichait « tout est prêt » alors que la formation attendait
   * encore ses tournages.
   */
  private videoDefinitive(lecon: LeconResume): boolean {
    if (!lecon.video_url) {
      // Pas d'URL : la vidéo vient de Cloudinary via son public_id.
      return Boolean(lecon.video_provider_id);
    }
    return HEBERGEURS_PROJET.some((hote) => lecon.video_url!.includes(hote));
  }

  /** Vrai quand l'étape ne porte strictement aucun média, ressources comprises. */
  protected sansMedia(lecon: LeconResume): boolean {
    return this.mediasPropres(lecon).length === 0 && this.ressources(lecon).length === 0;
  }

  protected ressources(lecon: LeconResume): RessourceResume[] {
    return lecon.ressources ?? [];
  }

  /** Libellé court du type, pour la pastille de la colonne Médias. */
  protected typeRessource(r: RessourceResume): string {
    return TYPES_COURTS[r.type] ?? r.type;
  }

  /**
   * Une ressource est exploitable dès qu'elle a une source. Sans source, elle
   * attend son fichier : la pastille le signale au lieu de laisser croire que
   * la ressource est en ligne.
   */
  protected estPrete(r: RessourceResume): boolean {
    return Boolean(r.cloudinary_public_id || r.url || r.contenu);
  }

  protected etatRessource(r: RessourceResume): string {
    if (!this.estPrete(r)) {
      return 'Fichier attendu';
    }
    return r.est_active ? 'En ligne' : 'Désactivée';
  }
}
