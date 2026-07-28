import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ContenuService, LeconResume, Module } from '../../../core/contenu/contenu.service';
import { RessourceResume, TypeRessource } from '../../../core/contenu/apprentissage.model';

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

  protected duree(lecon: LeconResume): string {
    return lecon.duree_s ? `${Math.round(lecon.duree_s / 60)} min` : '—';
  }

  /**
   * Médias propres à l'étape (vidéo principale et PDF de support), ou null
   * quand il n'y en a aucun. Le tiret n'est plus rendu ici : la cellule ne doit
   * afficher « aucun média » que si l'étape n'a NI média propre NI ressource
   * complémentaire — sinon on annonçait « — » juste au-dessus d'une pastille.
   */
  /**
   * Médias propres à l'étape, rendus comme les ressources : une pastille par
   * média présent. Un média rattaché est par nature en ligne — donc toujours
   * vert. Le texte gris précédent opposait deux traitements visuels à une même
   * information, ce qui rendait la colonne illisible d'un coup d'œil.
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
