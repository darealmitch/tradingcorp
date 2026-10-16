import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EtapeVitrine, ModuleVitrine } from '../../core/commerce/vitrine.model';
import { compte, dureeAnnoncee, dureeCourte } from '../../core/commerce/vitrine.textes';
import { VitrineService } from '../../core/commerce/vitrine.service';
import { exposerFormation } from '../../core/seo/donnees-structurees';
import { MesureClic } from '../../shared/mesure-clic';
import { Particles } from '../../shared/particles';
import { Reveal } from '../../shared/reveal';
import { BarreAchat } from '../../shared/ui/barre-achat';

/**
 * Intitulés des modules, pour le seul cas où la vitrine n'a pas pu être lue :
 * la page montre alors la structure du programme, sans objectifs ni chiffres.
 */
const MODULES_DE_REPLI = [
  'Développement personnel',
  'Éducation financière',
  'Fiscalité',
  'Les marchés',
  'Trading',
  'Analyse fondamentale',
  'Investissement',
  'Optimisation',
];

/** La nature d'une étape, dans les mots de la page. */
const NATURES: Record<string, string> = { video: 'Vidéo', quiz: 'Quiz', article: 'Lecture' };

/**
 * La page Programme : les modules de la formation, tels qu'ils sont publiés.
 *
 * Elle s'appelait « Les 5 facteurs qui changeront votre vie » et présentait
 * cinq piliers qui ne correspondaient pas aux huit modules réels — le module
 * Trading, le plus long, n'y figurait pas —, promettait « la liberté
 * financière » et un « support 7j/7 » que rien n'établissait. Diagnostic
 * commercial du 14/10/2026 : elle décrit désormais le programme lui-même, lu
 * en base, avec ce que chaque module annonce lui-même de ses objectifs.
 *
 * La frise animée et sa mise en page sont conservées.
 */
@Component({
  selector: 'app-programme',
  templateUrl: './programme.html',
  styleUrl: './programme.css',
  imports: [RouterLink, Particles, Reveal, BarreAchat, MesureClic],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Programme {
  private readonly timeline = viewChild.required<ElementRef<HTMLElement>>('timeline');
  private readonly railPath = viewChild.required<ElementRef<SVGPathElement>>('railPath');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly vitrine = inject(VitrineService);
  protected readonly compte = compte;
  protected readonly duree = dureeAnnoncee;
  protected readonly dureeCourte = dureeCourte;

  /** Les modules publiés ; à défaut, leurs seuls intitulés. */
  protected readonly modules = computed<ModuleVitrine[]>(() => {
    const programme = this.vitrine.vitrine()?.programme ?? [];
    if (programme.length > 0) {
      return programme;
    }
    return MODULES_DE_REPLI.map((titre, i) => ({
      position: i + 1,
      titre,
      accroche: null,
      objectifs: [],
      lecons_video: 0,
      secondes_video: 0,
      quiz: 0,
      lecons_offertes: 0,
    }));
  });

  /** Les chiffres d'un module, ou null s'ils sont inconnus (repli). */
  protected chiffres(module: ModuleVitrine): string | null {
    if (module.lecons_video === 0 && module.quiz === 0) {
      return null;
    }
    const morceaux = [compte(module.lecons_video, 'leçon vidéo', 'leçons vidéo')];
    if (module.secondes_video > 0) {
      morceaux.push(dureeCourte(module.secondes_video));
    }
    if (module.quiz > 0) {
      morceaux.push(compte(module.quiz, 'quiz', 'quiz'));
    }
    return morceaux.join(' · ');
  }

  protected nature(type: string): string {
    return NATURES[type] ?? 'Étape';
  }

  /**
   * « Quiz - Éducation financière » devient « Éducation financière » : la
   * nature de l'étape est déjà écrite à côté.
   */
  protected titreEtape(etape: EtapeVitrine): string {
    return etape.type === 'quiz' ? etape.titre.replace(/^quiz\s*[-–—:]\s*/i, '') : etape.titre;
  }

  /** Un sommaire ouvert ou refermé déplace les modules suivants : la frise suit. */
  protected redessiner(): void {
    this.redessinerRail?.();
  }

  /** Recalcule le tracé de la frise ; posé une fois la frise prête. */
  private redessinerRail?: () => void;

  constructor() {
    exposerFormation();
    afterNextRender(() => this.initRail());
    // Une vitrine arrivée après l'affichage (réseau lent) change le nombre
    // de modules : la frise doit relier les nouvelles sphères.
    effect(() => {
      this.modules();
      setTimeout(() => this.redessinerRail?.());
    });
  }

  /**
   * Ruban en S reliant les sphères numérotées : le tracé est calculé à partir
   * de la position réelle des numéros, puis dessiné au fil du scroll.
   */
  private initRail(): void {
    const timeline = this.timeline().nativeElement;
    const path = this.railPath().nativeElement;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Position d'un élément relative à la timeline, via les offsets de mise en
    // page : insensible aux transforms de l'animation de révélation (translateY).
    const centerWithin = (node: HTMLElement): { x: number; y: number } => {
      let x = 0;
      let y = 0;
      let el: HTMLElement | null = node;
      while (el && el !== timeline) {
        x += el.offsetLeft;
        y += el.offsetTop;
        el = el.offsetParent as HTMLElement | null;
      }
      return { x: x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
    };

    const build = (): number => {
      const nodes = Array.from(timeline.querySelectorAll<HTMLElement>('.module-node'));
      const points = nodes.map((node) => centerWithin(node));
      if (points.length < 2) {
        return 0;
      }

      // Courbe lisse : chaque segment ondule d'un côté puis de l'autre (effet S).
      let d = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const midY = (a.y + b.y) / 2;
        const bulge = (i % 2 === 0 ? -1 : 1) * 46;
        d += ` C ${a.x + bulge} ${midY}, ${b.x + bulge} ${midY}, ${b.x} ${b.y}`;
      }
      path.setAttribute('d', d);

      const svg = path.ownerSVGElement;
      if (svg) {
        svg.setAttribute('viewBox', `0 0 ${timeline.offsetWidth} ${timeline.offsetHeight}`);
      }
      return path.getTotalLength();
    };

    let length = build();
    path.style.strokeDasharray = `${length}`;
    path.style.strokeDashoffset = reduced ? '0' : `${length}`;

    if (reduced) {
      const onResize = (): void => {
        length = build();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = '0';
      };
      window.addEventListener('resize', onResize);
      // La police Anton modifie la taille des numéros : on recalcule une fois chargée.
      void document.fonts.ready.then(onResize);
      this.redessinerRail = onResize;
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('resize', onResize);
        this.redessinerRail = undefined;
      });
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    const trigger = ScrollTrigger.create({
      trigger: timeline,
      start: 'top 72%',
      end: 'bottom 85%',
      scrub: 1,
      invalidateOnRefresh: true,
      onRefresh: () => {
        length = build();
        path.style.strokeDasharray = `${length}`;
      },
      onUpdate: (self) => {
        path.style.strokeDashoffset = `${length * (1 - self.progress)}`;
      },
    });

    // Recalcule le tracé une fois la police Anton chargée (métriques finales).
    void document.fonts.ready.then(() => ScrollTrigger.refresh());
    this.redessinerRail = () => ScrollTrigger.refresh();

    this.destroyRef.onDestroy(() => {
      trigger.kill();
      this.redessinerRail = undefined;
    });
  }
}
