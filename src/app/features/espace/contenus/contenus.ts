import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { FormationStaff } from '../../../core/commerce/formation.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import {
  BilanAnnonceDecouverte,
  LeconResume,
  Module,
  RessourceResume,
  TypeRessource,
} from '../../../core/contenu/apprentissage.model';

/** « 1 compte », « 3 comptes ». */
function nombre(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

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
  private readonly commerce = inject(CommerceService);
  private readonly auth = inject(AuthService);

  protected readonly chargement = signal(true);
  protected readonly modules = signal<Module[]>([]);
  protected readonly formations = signal<FormationStaff[]>([]);

  /** Formation dont le réglage part vers le serveur — la case est figée le temps de l'aller-retour. */
  protected readonly enregistrement = signal<string | null>(null);
  protected readonly erreurReglage = signal<string | null>(null);

  /**
   * Offrir une leçon est une décision commerciale : la base la réserve aux
   * administrateurs. Un formateur voit les cases, sans pouvoir les changer.
   */
  protected readonly estAdmin = computed(() => this.auth.role() === 'admin');

  /** Leçon dont l'offre part vers le serveur — sa case est figée le temps de l'aller-retour. */
  protected readonly decouverteEnCours = signal<string | null>(null);

  // ----- Annonce des leçons offertes -----
  protected readonly annonceEnCours = signal(false);
  /** L'envoi à tous ne part qu'au second clic : il touche chaque compte sans achat. */
  protected readonly confirmationAnnonce = signal(false);
  protected readonly bilanAnnonce = signal<string | null>(null);
  protected readonly erreurAnnonce = signal<string | null>(null);

  protected readonly nombreOffertes = computed(
    () =>
      this.modules()
        .flatMap((m) => m.lecons)
        .filter((l) => l.est_decouverte).length,
  );

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [modules, formations] = await Promise.all([
      this.contenu.chargerStructure(),
      this.commerce.listerFormationsStaff(),
    ]);
    this.modules.set(modules);
    this.formations.set(formations);
    this.chargement.set(false);
  }

  /**
   * Bascule le droit au certificat d'une formation.
   *
   * L'affichage suit tout de suite, puis revient en arrière si l'écriture
   * échoue : une case qui reste cochée alors que la base dit le contraire est
   * pire que pas de case du tout — on croirait certifiante une formation qui
   * ne délivrera rien.
   */
  protected async basculerCertificat(formation: FormationStaff): Promise<void> {
    if (this.enregistrement()) {
      return;
    }
    const avant = this.formations();
    const voulu = !formation.delivre_certificat;

    this.enregistrement.set(formation.id_formation);
    this.erreurReglage.set(null);
    this.formations.update((liste) =>
      liste.map((f) =>
        f.id_formation === formation.id_formation ? { ...f, delivre_certificat: voulu } : f,
      ),
    );

    const erreur = await this.commerce.definirCertifiante(formation.id_formation, voulu);
    if (erreur) {
      this.formations.set(avant);
      this.erreurReglage.set(erreur);
    }
    this.enregistrement.set(null);
  }

  protected demanderAnnonce(): void {
    this.bilanAnnonce.set(null);
    this.erreurAnnonce.set(null);
    this.confirmationAnnonce.set(true);
  }

  protected annulerAnnonce(): void {
    this.confirmationAnnonce.set(false);
  }

  protected async confirmerAnnonce(): Promise<void> {
    await this.annoncer(false);
    this.confirmationAnnonce.set(false);
  }

  /**
   * Prévient les comptes sans achat — ou, en essai, les seuls comptes de test.
   * La base fait le tri : un compte déjà prévenu de cette sélection de leçons
   * ne reçoit rien de plus, et l'e-mail ne part qu'avec l'accord de chacun.
   */
  protected async annoncer(essai: boolean): Promise<void> {
    if (this.annonceEnCours()) {
      return;
    }
    if (essai) {
      this.confirmationAnnonce.set(false);
    }
    this.annonceEnCours.set(true);
    this.bilanAnnonce.set(null);
    this.erreurAnnonce.set(null);

    const { resultat, erreur } = await this.contenu.annoncerLeconsOffertes(essai);

    this.annonceEnCours.set(false);
    if (erreur || !resultat) {
      this.erreurAnnonce.set(erreur ?? 'L’annonce n’a pas pu partir. Réessaie.');
      return;
    }
    this.bilanAnnonce.set(this.bilan(resultat, essai));
  }

  /** Ce que l'envoi a réellement fait, chiffres à l'appui. */
  private bilan(r: BilanAnnonceDecouverte, essai: boolean): string {
    if (essai) {
      return r.notifies === 0
        ? 'Aucun compte de test : l’essai n’est parti nulle part.'
        : `Essai envoyé à ${nombre(r.notifies, 'compte de test', 'comptes de test')} : notification et e-mail.`;
    }
    if (r.notifies === 0) {
      return 'Tous les comptes sans achat avaient déjà été prévenus de ces leçons : rien n’est reparti.';
    }
    return (
      `${nombre(r.notifies, 'compte sans achat prévenu', 'comptes sans achat prévenus')} dans leur espace, ` +
      `dont ${nombre(r.par_courriel, 'par e-mail', 'par e-mail')} — seuls ceux qui ont accepté les nouveautés le reçoivent.`
    );
  }

  /** Un quiz demande une inscription : seules les vidéos et les lectures s'offrent. */
  protected peutEtreOfferte(lecon: LeconResume): boolean {
    return lecon.type === 'video' || lecon.type === 'article';
  }

  /**
   * Offre la leçon aux comptes sans achat, ou retire l'offre. Même conduite que
   * le réglage du certificat : la case suit tout de suite, puis revient en
   * arrière si l'écriture échoue — une leçon crue offerte alors qu'elle ne
   * l'est pas fausserait tout ce qu'on dirait aux prospects.
   */
  protected async basculerDecouverte(lecon: LeconResume): Promise<void> {
    if (this.decouverteEnCours() || !this.estAdmin()) {
      return;
    }
    const avant = this.modules();
    const voulu = !lecon.est_decouverte;

    this.decouverteEnCours.set(lecon.id_lecon);
    this.erreurReglage.set(null);
    this.modules.update((liste) =>
      liste.map((m) => ({
        ...m,
        lecons: m.lecons.map((l) =>
          l.id_lecon === lecon.id_lecon ? { ...l, est_decouverte: voulu } : l,
        ),
      })),
    );

    const erreur = await this.contenu.definirDecouverte(lecon.id_lecon, voulu);
    if (erreur) {
      this.modules.set(avant);
      this.erreurReglage.set(erreur);
    }
    this.decouverteEnCours.set(null);
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
    // Une adresse renseignée suffit à elle seule. Ne tester que
    // `video_provider_id` faisait passer pour vides les chapitres servis par
    // une URL Bunny directe.
    if (lecon.a_video_url || lecon.video_provider_id) {
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
   * encore ses tournages — typiquement le `BigBuckBunny.mp4` que
   * `seed_chapitres.sql` pose sur chaque chapitre avant tournage.
   *
   * Le verdict est rendu en base : l'adresse n'est plus lisible d'ici
   * (20260912103000), et la liste des hébergeurs officiels vit désormais dans
   * la définition de `video_hebergee`.
   */
  private videoDefinitive(lecon: LeconResume): boolean {
    if (!lecon.a_video_url) {
      // Pas d'adresse : la vidéo vient de Cloudinary via son public_id.
      return Boolean(lecon.video_provider_id);
    }
    return lecon.video_hebergee;
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
