import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../../../environments/environment';
import { ConsentementService } from '../../../../core/consentement/consentement.service';
import { MediaService } from '../../../../core/media/media.service';
import { Reveal } from '../../../../shared/reveal';
import { Icone } from '../../../../shared/ui/icone';

/** Un chiffre-clé animé du parcours. */
interface Stat {
  target: number;
  decimals: number;
  suffix: string;
  label: string;
}

/** Une étape du parcours. */
interface Milestone {
  step: string;
  title: string;
  desc: string;
}

/**
 * Années de début du parcours — les durées affichées se recalculent chaque
 * année automatiquement. (Calé sur le récit de 2024 : « investisseur depuis
 * 6 ans, trader depuis 5 ans ». ✏️ Ajuste ces années si besoin.)
 */
const INVESTISSEMENT_DEBUT = 2018;
const TRADING_DEBUT = 2019;

/** Nombre d'années révolues depuis une année de début. */
function anneesDepuis(debut: number): number {
  return Math.max(0, new Date().getFullYear() - debut);
}

const STATS: Stat[] = [
  {
    target: anneesDepuis(INVESTISSEMENT_DEBUT),
    decimals: 0,
    suffix: ' ans',
    label: "d'investissement",
  },
  { target: anneesDepuis(TRADING_DEBUT), decimals: 0, suffix: ' ans', label: 'de trading' },
  { target: 1_000_000, decimals: 0, suffix: ' €+', label: 'générés en fonds propres' },
  { target: 200, decimals: 0, suffix: '+', label: 'élèves formés' },
];

const MILESTONES: Milestone[] = [
  {
    step: '18 ans',
    title: 'Le bac en candidat libre',
    desc: "L'école n'était pas faite pour moi. Je décroche mon bac seul, à ma façon.",
  },
  {
    step: 'Le déclic',
    title: 'Une année chez McDonald’s',
    desc: 'Derrière le comptoir, je place mes premières économies — modestement, mais je commence.',
  },
  {
    step: 'Entrepreneuriat',
    title: 'Mandataire immobilier',
    desc: 'Chez Keller Williams. Chaque commission gagnée est réinvestie sur les marchés.',
  },
  {
    step: 'Les marchés',
    title: 'Plus de 1 000 000 €',
    desc: 'Générés en fonds propres sur les marchés financiers, à force de méthode et de discipline.',
  },
  {
    step: 'Transmission',
    title: 'Formateur & fondateur',
    desc: '200+ élèves accompagnés, et Trading Corp fondée pour transmettre cette méthode.',
  },
];

/**
 * Vidéo ouverte en grand. Deux natures :
 *  - `fichier` : URL directe lisible par <video> (témoignages Cloudinary) ;
 *  - `embed`   : lecteur Bunny Stream en <iframe> (la présentation, hébergée
 *                sur Bunny — trop lourde pour le dépôt, et servie en HLS).
 */
type VideoOuverte = { type: 'fichier'; src: string } | { type: 'embed'; src: SafeResourceUrl };

/** Retours clients filmés après un entretien téléphonique avec Keryan. */
const TESTIMONIALS = [
  { pid: 'keryan-01_okdcno', alt: 'Retour client après entretien — 1' },
  { pid: 'keryan-02_nkju0c', alt: 'Retour client après entretien — 2' },
  { pid: 'keryan-03_sbfiwm', alt: 'Retour client après entretien — 3' },
];

@Component({
  selector: 'app-trainer',
  templateUrl: './trainer.html',
  styleUrl: './trainer.css',
  imports: [Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Trainer {
  private readonly portrait = viewChild.required<ElementRef<HTMLElement>>('portrait');
  /** Conteneur de la lightbox vidéo, ciblé pour y porter le focus à l'ouverture. */
  private readonly dialogue = viewChild<ElementRef<HTMLElement>>('dialogue');
  private readonly statEls = viewChildren<ElementRef<HTMLElement>>('statValue');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly media = inject(MediaService);
  protected readonly stats = STATS;
  protected readonly milestones = MILESTONES;
  // URLs Cloudinary résolues une fois via MediaService (source unique).
  protected readonly testimonials = TESTIMONIALS.map((t) => ({
    ...t,
    url: this.media.videoUrl(t.pid),
  }));

  /** Valeurs affichées des compteurs (formatées). */
  protected readonly values = signal(STATS.map(() => '0'));

  /** Vidéo ouverte en grand (null = lightbox fermée). */
  protected readonly activeVideo = signal<VideoOuverte | null>(null);

  /**
   * Lecteur Bunny de la vidéo de présentation. L'URL d'embed est assainie une
   * fois : Angular refuse toute URL non explicitement approuvée dans un iframe.
   */
  private readonly presentationEmbed: SafeResourceUrl = inject(
    DomSanitizer,
  ).bypassSecurityTrustResourceUrl(`${environment.bunnyPresentationVideoUrl}?autoplay=true`);

  /** Élément déclencheur, re-focalisé à la fermeture. */
  private lastTrigger: HTMLElement | null = null;

  private readonly consentement = inject(ConsentementService);

  /**
   * Quelqu'un a demandé la vidéo sans avoir encore donné son accord. On retient
   * l'intention : dès que l'accord arrive, la lecture part toute seule, sans
   * obliger à recliquer.
   */
  private readonly attenteAccord = signal(false);

  /**
   * Le gestionnaire de consentement s'est prononcé et ne répond pas : ni accord
   * ni refus possible, donc lecture impossible. Distinct d'un simple refus, qui
   * lui se corrige en rouvrant les préférences.
   */
  protected readonly lecteurBloque = computed(
    () => this.consentement.pret() && !this.consentement.disponible(),
  );

  constructor() {
    // L'accord arrive après coup : la vidéo demandée s'ouvre alors d'elle-même.
    effect(() => {
      if (this.attenteAccord() && this.consentement.lecteurVideoAutorise()) {
        this.attenteAccord.set(false);
        this.ouvrirLecteur();
      }
    });

    afterNextRender(() => {
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.initCounters(reduced);
      if (!reduced) {
        this.initParallax();
      }
    });
    this.destroyRef.onDestroy(() => (document.body.style.overflow = ''));
  }

  /** Ouvre un témoignage (fichier vidéo direct) et fige le défilement. */
  protected openVideo(src: string, event: Event): void {
    this.ouvrir({ type: 'fichier', src }, event);
  }

  /**
   * Ouvre la vidéo de présentation (lecteur Bunny en iframe).
   *
   * Contrairement aux témoignages — de simples fichiers lus par `<video>` — le
   * lecteur Bunny dépose deux cookies sur le terminal du visiteur
   * (`plyr--lib-759` pour les préférences de lecture, `cache-sprite-plyr` pour
   * le cache des icônes). Ils exigent donc un consentement préalable, et c'est
   * Didomi qui le détient.
   *
   * Trois cas, et un seul ouvre l'iframe :
   *   • accord donné      → lecture ;
   *   • accord pas encore donné (refus ou absence de réponse) → on rouvre les
   *     préférences, et la lecture partira dès que l'accord arrivera ;
   *   • gestionnaire injoignable → rien, et on le dit.
   *
   * Dans les deux derniers cas l'iframe n'est pas construite : rien n'est
   * chargé, rien n'est déposé.
   */
  protected openPresentation(event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    // On va chercher la réponse au lieu d'attendre qu'elle vienne : c'est ici,
    // et seulement ici, qu'elle décide d'un dépôt.
    this.consentement.rafraichir();

    if (this.consentement.lecteurVideoAutorise()) {
      this.ouvrirLecteur();
      return;
    }
    if (this.lecteurBloque()) {
      return;
    }
    this.attenteAccord.set(true);
    this.consentement.ouvrirPreferences();
  }

  /** Construit enfin l'iframe — appelé une fois l'accord acquis, jamais avant. */
  private ouvrirLecteur(): void {
    this.activeVideo.set({ type: 'embed', src: this.presentationEmbed });
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.dialogue()?.nativeElement.focus({ preventScroll: true }));
  }

  private ouvrir(video: VideoOuverte, event: Event): void {
    this.lastTrigger = event.currentTarget as HTMLElement;
    this.activeVideo.set(video);
    document.body.style.overflow = 'hidden';
    // Remplace `autofocus` (déconseillé) : focus posé après rendu effectif.
    setTimeout(() => this.dialogue()?.nativeElement.focus({ preventScroll: true }));
  }

  /**
   * Ferme si le clic vient du fond et non du contenu. Évite de poser un
   * gestionnaire sur le conteneur interne, qui en ferait un faux élément
   * interactif (non focusable et sans équivalent clavier).
   */
  protected fermerSiFond(evenement: MouseEvent): void {
    if (evenement.target === evenement.currentTarget) {
      this.closeVideo();
    }
  }

  /** Ferme la vidéo (l'élément est détruit → lecture arrêtée) et restaure le focus. */
  protected closeVideo(): void {
    if (!this.activeVideo()) {
      return;
    }
    this.activeVideo.set(null);
    document.body.style.overflow = '';
    this.lastTrigger?.focus({ preventScroll: true });
    this.lastTrigger = null;
  }

  /** Compteurs animés au premier passage dans le viewport. */
  private initCounters(reduced: boolean): void {
    if (reduced) {
      this.values.set(STATS.map((s) => this.format(s.target, s.decimals)));
      return;
    }

    this.statEls().forEach((ref, index) => {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            observer.disconnect();
            this.runCounter(index);
          }
        },
        { threshold: 0.5 },
      );
      observer.observe(ref.nativeElement);
      this.destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  private runCounter(index: number): void {
    const stat = STATS[index];
    const duration = 1600;
    const start = performance.now();
    let raf = 0;

    const frame = (now: number): void => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = this.format(stat.target * eased, stat.decimals);
      this.values.update((values) => values.map((v, i) => (i === index ? current : v)));
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      }
    };

    raf = requestAnimationFrame(frame);
    this.destroyRef.onDestroy(() => cancelAnimationFrame(raf));
  }

  private format(value: number, decimals: number): string {
    return value.toLocaleString('fr-FR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  /** Parallaxe douce du portrait selon la position de défilement. */
  private initParallax(): void {
    const portrait = this.portrait().nativeElement;
    let ticking = false;

    const apply = (): void => {
      ticking = false;
      const rect = portrait.getBoundingClientRect();
      // Décalage relatif au centre du viewport : négatif au-dessus, positif en dessous.
      const delta = (rect.top + rect.height / 2 - window.innerHeight / 2) / window.innerHeight;
      portrait.style.transform = `translateY(${delta * -26}px)`;
    };

    const onScroll = (): void => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(apply);
      }
    };

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    this.destroyRef.onDestroy(() => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    });
  }
}
