import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { LeconEtape, LeconJouable } from '../../../core/contenu/apprentissage.model';
import { AuthService } from '../../../core/auth/auth.service';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { MediaService } from '../../../core/media/media.service';
import { Icone } from '../../../shared/ui/icone';
import { QuizLecon } from './quiz-lecon';
import { CommentairesLecon } from './commentaires-lecon';
import { RessourcesLecon } from './ressources-lecon';

/**
 * Couverture de marque, servie depuis `public/`.
 *
 * Chemin RELATIF, sans barre oblique initiale : il se résout contre le
 * `<base href>` du document. En production le site vit sous un sous-chemin
 * (`ng build --base-href /tradingcorp/`, cf. `.github/workflows/ci.yml`) ;
 * un chemin absolu viserait la racine du domaine et renverrait 404 — l'erreur
 * ne se voit pas en local, où la base vaut « / ».
 *
 * Casse à respecter au caractère près : macOS l'ignore, pas un serveur Linux.
 */
const POSTER_PAR_DEFAUT = 'tradingCorp.png';

@Component({
  selector: 'app-lecon-player',
  templateUrl: './lecon-player.html',
  styleUrl: './lecon-player.css',
  imports: [RouterLink, Icone, QuizLecon, RessourcesLecon, CommentairesLecon],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LeconPlayer {
  private readonly contenu = inject(ContenuService);
  private readonly auth = inject(AuthService);
  protected readonly media = inject(MediaService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly lecteur = viewChild<ElementRef<HTMLVideoElement>>('lecteur');

  protected readonly chargement = signal(true);
  protected readonly lecon = signal<LeconJouable | null>(null);
  protected readonly etapes = signal<LeconEtape[]>([]);
  protected readonly avertissement = signal<string | null>(null);

  /**
   * Lecteur HLS attaché à la balise <video>. `hls.js` alimente l'élément par
   * MediaSource Extensions : la balise reste la source de vérité, donc
   * `timeupdate`, `ended`, `currentTime` — et avec eux la reprise, l'anti-avance
   * et le déverrouillage du PDF/quiz — fonctionnent exactement comme en MP4.
   */
  private hls: { destroy(): void } | null = null;
  /** Invalide un attachement HLS dont la leçon a changé pendant le chargement. */
  private generationHls = 0;

  /**
   * La lecture a démarré au moins une fois sur ce chapitre : masque la pastille
   * de lecture posée par-dessus la couverture. Passe aussi à vrai si la lecture
   * est lancée par les contrôles natifs (événement `play`).
   */
  protected readonly lectureCommencee = signal(false);

  /** La vidéo courante vient d'atteindre sa fin dans cette session. */
  protected readonly videoFinie = signal(false);
  protected readonly validation = signal(false);
  /** Point le plus avancé réellement visionné (anti-avance au 1er visionnage). */
  private tempsMax = 0;

  protected idSection = '';

  private readonly typesLabel: Record<LeconJouable['type'], string> = {
    intro: 'Introduction',
    article: 'Article',
    video: 'Vidéo',
    quiz: 'Quiz',
  };

  constructor() {
    // Réagit aux changements d'URL (étape suivante, timeline, retour
    // navigateur) : le composant est réutilisé par le routeur, le rechargement
    // doit donc suivre les paramètres — jamais d'état périmé.
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => void this.charger(params.get('id'), params.get('idLecon')));

    // (Ré)attache le flux HLS à chaque changement de chapitre. Le composant est
    // réutilisé par le routeur : sans détachement, l'instance précédente
    // continuerait de bufferiser en fond.
    effect(() => void this.attacherHls(this.lecon(), this.lecteur()?.nativeElement));
    inject(DestroyRef).onDestroy(() => this.detacherHls());
  }

  /**
   * Charge `hls.js` à la demande — import dynamique, pour que la bibliothèque
   * (~40 Ko) reste hors du bundle des chapitres servis en MP4.
   */
  private async attacherHls(
    l: LeconJouable | null,
    el: HTMLVideoElement | undefined,
  ): Promise<void> {
    const generation = ++this.generationHls;
    this.detacherHls();

    const source = l ? this.urlHls(l) : null;
    if (!source || !el) {
      return;
    }

    const { default: Hls } = await import('hls.js');
    // Le chapitre a pu changer pendant le chargement du module.
    if (generation !== this.generationHls || !Hls.isSupported()) {
      return;
    }
    const hls = new Hls({ enableWorker: true });
    hls.loadSource(source);
    hls.attachMedia(el);
    this.hls = hls;
  }

  private detacherHls(): void {
    this.hls?.destroy();
    this.hls = null;
  }

  protected typeLabel(l: LeconJouable): string {
    return this.typesLabel[l.type];
  }

  private async charger(idSection: string | null, idLecon: string | null): Promise<void> {
    if (!idSection || !idLecon) {
      this.chargement.set(false);
      return;
    }
    this.chargement.set(true);
    this.idSection = idSection;
    this.videoFinie.set(false);
    this.lectureCommencee.set(false);
    this.tempsMax = 0;

    const [lecon, etapes] = await Promise.all([
      this.contenu.chargerLeconJouable(idLecon),
      this.contenu.etatsLecons(idSection),
    ]);

    // L'introduction n'est pas un chapitre du lecteur : elle vit sur la page
    // du module. Aucun lien n'y mène ; garde défensif si l'URL est forcée.
    if (lecon?.type === 'intro') {
      await this.router.navigate(['/parcours', idSection]);
      return;
    }

    this.lecon.set(lecon);
    // La timeline ne montre que les chapitres jouables (l'intro est exclue).
    this.etapes.set(etapes.filter((e) => e.type !== 'intro'));
    this.chargement.set(false);
  }

  /**
   * URL de lecture, hébergeur agnostique : une URL externe (Bunny/MP4/HLS
   * direct) est prioritaire ; à défaut on retombe sur Cloudinary. Aucune
   * dépendance à un hébergeur particulier.
   */
  protected videoUrl(l: LeconJouable): string | null {
    if (l.video_url) {
      return l.video_url;
    }
    if (l.video_provider === 'cloudinary' && l.video_provider_id) {
      return this.media.videoUrl(l.video_provider_id);
    }
    return null;
  }

  /**
   * Flux HLS à confier à `hls.js`, ou null si la lecture native suffit.
   * Safari lit le HLS nativement : inutile d'y charger la bibliothèque.
   */
  private urlHls(l: LeconJouable): string | null {
    const url = this.videoUrl(l);
    if (!url?.includes('.m3u8')) {
      return null;
    }
    const natif = document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
    return natif ? null : url;
  }

  /**
   * Image de couverture, affichée tant que la première image n'est pas
   * décodée. Une couverture de marque par défaut, surchargeable par vidéo via
   * `video_metadata.poster` — le champ était déjà prévu pour cela, inutile
   * d'ajouter une colonne.
   */
  protected poster(l: LeconJouable): string {
    const propre = l.video_metadata?.['poster'];
    return typeof propre === 'string' && propre ? propre : POSTER_PAR_DEFAUT;
  }

  /**
   * Source posée directement sur la balise : MP4, ou HLS là où le navigateur
   * le lit seul. Null quand `hls.js` prend la main — c'est lui qui alimente
   * alors l'élément, et un `src` concurrent ferait échouer la lecture.
   */
  protected srcDirect(l: LeconJouable): string | null {
    return this.urlHls(l) ? null : this.videoUrl(l);
  }

  protected videoNonSupportee(l: LeconJouable): boolean {
    return !this.videoUrl(l) && !!l.video_provider_id;
  }

  protected pdfUrl(l: LeconJouable): string | null {
    return l.pdf_public_id ? this.media.pdfUrl(l.pdf_public_id) : null;
  }

  /** Paragraphes d'un chapitre article (séparés par une ligne vide). */
  protected paragraphes(l: LeconJouable): string[] {
    return (l.contenu ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  /** Recharge le chapitre courant + la timeline (après une validation). */
  private async rafraichir(idLecon: string): Promise<void> {
    const [maj, etapes] = await Promise.all([
      this.contenu.chargerLeconJouable(idLecon),
      this.contenu.etatsLecons(this.idSection),
    ]);
    this.lecon.set(maj);
    this.etapes.set(etapes);
  }

  /** Valide un chapitre article (« marquer comme lu »). */
  protected async terminerArticle(): Promise<void> {
    const l = this.lecon();
    if (!l || l.terminee_le) {
      return;
    }
    const refus = await this.contenu.terminerLecon(l.id_lecon);
    if (refus) {
      this.signaler(refus, 5000);
      return;
    }
    await this.rafraichir(l.id_lecon);
  }

  /** Lance la lecture depuis la pastille posée sur la couverture. */
  protected demarrerLecture(): void {
    this.lectureCommencee.set(true);
    void this.lecteur()?.nativeElement.play();
  }

  /** Reprise : position enregistrée au chargement du lecteur natif. */
  protected reprendre(l: LeconJouable): void {
    const el = this.lecteur()?.nativeElement;
    if (el && l.position_video_s > 0) {
      el.currentTime = l.position_video_s;
    }
    // La reprise fait déjà foi comme point le plus avancé déjà visionné.
    this.tempsMax = Math.max(this.tempsMax, l.position_video_s);
  }

  /**
   * Avance vidéo libre : leçon déjà validée, OU compte de test (recette sans
   * simuler la progression — mêmes accès élargis que côté serveur).
   */
  private avanceLibre(l: LeconJouable): boolean {
    return !!l.terminee_le || this.auth.estCompteTest();
  }

  protected sauverPosition(): void {
    const el = this.lecteur()?.nativeElement;
    const l = this.lecon();
    if (!el || !l) {
      return;
    }
    // Progression naturelle : on repousse le point le plus avancé visionné.
    if (el.currentTime <= this.tempsMax + 1) {
      this.tempsMax = Math.max(this.tempsMax, el.currentTime);
    }
    void this.contenu.enregistrerPosition(l.id_lecon, el.currentTime);
  }

  /**
   * Premier visionnage : empêche d'avancer au-delà du point réellement atteint.
   * Le retour en arrière reste libre, comme l'avance une fois la leçon validée.
   *
   * Garde d'ERGONOMIE, pas de sécurité : il retire la tentation de glisser
   * jusqu'à la fin, rien de plus. Le signal envoyé au serveur reste écrit par
   * le client, et un appel direct à l'API contourne ce garde sans effort —
   * c'est assumé (voir 20260718100000_validation_video).
   */
  protected surSeek(): void {
    const el = this.lecteur()?.nativeElement;
    const l = this.lecon();
    if (!el || !l || this.avanceLibre(l)) {
      return;
    }
    if (el.currentTime > this.tempsMax + 0.5) {
      el.currentTime = this.tempsMax;
    }
  }

  /**
   * Fin réelle de la vidéo : on mémorise l'atteinte de la fin (active le bouton
   * de validation) et on persiste video_terminee_le (révèle le PDF, robuste au
   * rechargement). La leçon n'est PAS validée ici : c'est le bouton qui valide.
   */
  protected async videoTerminee(): Promise<void> {
    const l = this.lecon();
    if (!l || l.terminee_le) {
      return;
    }
    this.videoFinie.set(true);
    await this.contenu.marquerVideoTerminee(l.id_lecon);
    // Recharge : le serveur peut désormais révéler pdf_public_id.
    const maj = await this.contenu.chargerLeconJouable(l.id_lecon);
    if (maj) {
      this.lecon.set(maj);
    }
  }

  /**
   * Le bouton de validation n'est actif qu'une fois la vidéo réellement finie —
   * sauf pour un compte de test, qui peut valider sans visionner (recette).
   */
  protected peutValider(l: LeconJouable): boolean {
    return (
      !l.terminee_le &&
      (this.videoFinie() || l.video_terminee_le !== null || this.auth.estCompteTest())
    );
  }

  /**
   * Validation de la leçon vidéo au clic : enregistre la progression et
   * déverrouille l'étape suivante (règles serveur existantes), sans rechargement.
   */
  protected async validerLecon(): Promise<void> {
    const l = this.lecon();
    if (!l || l.terminee_le || !this.peutValider(l) || this.validation()) {
      return;
    }
    this.validation.set(true);
    // Garantit video_terminee_le côté serveur avant la validation (anti-course).
    await this.contenu.marquerVideoTerminee(l.id_lecon);
    const refus = await this.contenu.terminerLecon(l.id_lecon);
    this.validation.set(false);

    // Le serveur rédige ses refus lui-même (« Chapitre verrouillé », « La
    // vidéo doit être visionnée jusqu'à la fin ») : les afficher tels quels
    // vaut mieux que de les remplacer par une formule vague — et évite qu'un
    // clic reste sans réponse, ce qui poussait à recliquer.
    if (refus) {
      this.signaler(refus, 5000);
      return;
    }
    await this.rafraichir(l.id_lecon);
  }

  /**
   * Le quiz vient d'être réussi : on recharge la leçon et la timeline pour que
   * l'étape suivante s'ouvre. La passation elle-même ne nous regarde pas.
   */
  protected async surQuizReussi(): Promise<void> {
    const l = this.lecon();
    if (l) {
      await this.rafraichir(l.id_lecon);
    }
  }

  protected etapeSuivante(): LeconEtape | null {
    const l = this.lecon();
    if (!l) {
      return null;
    }
    const liste = this.etapes();
    const i = liste.findIndex((e) => e.id_lecon === l.id_lecon);
    return i >= 0 && i < liste.length - 1 ? liste[i + 1] : null;
  }

  /**
   * L'étape suivante ne s'ouvre que si le SERVEUR la dit accessible : pour un
   * apprenant standard elle reste 'verrouille' tant que l'étape courante n'est
   * pas validée ; démo/formateur/admin ne voient jamais 'verrouille' (RPC).
   */
  protected async allerSuivante(): Promise<void> {
    const suivante = this.etapeSuivante();
    if (!suivante || suivante.etat === 'verrouille') {
      return;
    }
    await this.router.navigate(['/parcours', this.idSection, 'lecon', suivante.id_lecon]);
  }

  /** Navigation directe sur une étape de la timeline — jamais une verrouillée. */
  protected async ouvrirEtape(e: LeconEtape): Promise<void> {
    if (e.etat === 'verrouille') {
      this.signaler('Termine les étapes précédentes pour y accéder.');
      return;
    }
    await this.router.navigate(['/parcours', this.idSection, 'lecon', e.id_lecon]);
  }

  /**
   * Affiche un message passager. Les refus du serveur restent plus longtemps
   * que les rappels d'interface : « La vidéo doit être visionnée jusqu'à la
   * fin » demande à être lu, là où « termine les étapes précédentes » ne fait
   * que confirmer ce que l'écran montre déjà.
   */
  private signaler(message: string, dureeMs = 2500): void {
    this.avertissement.set(message);
    setTimeout(() => {
      if (this.avertissement() === message) {
        this.avertissement.set(null);
      }
    }, dureeMs);
  }
}
