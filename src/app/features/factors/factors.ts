import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Particles } from '../../shared/particles';
import { Reveal } from '../../shared/reveal';

/** Un facteur du programme : numéro, titre, description et phrase mise en avant. */
interface Factor {
  id: number;
  title: string;
  desc: string;
  highlight: string;
  icon: string;
}

/** ✏️ Contenu des 5 facteurs — seul endroit à éditer pour le texte. */
const FACTORS: Factor[] = [
  {
    id: 1,
    title: 'Éducation financière',
    desc: 'Budgétisation, inflation, déflation, planche à billets, banque centrale, taux directeur, histoire monétaire, DeFi, cryptomonnaie, marchés et NFT.',
    highlight: "Venez apprendre l'argent comme personne ne vous l'a jamais appris.",
    icon: 'book',
  },
  {
    id: 2,
    title: 'Fiscalité',
    desc: "Création de société, déclaration d'impôts, optimisation et automatisation fiscale. On vous apprend à gérer votre paperasse sans vous prendre la tête —",
    highlight: "gagner de l'argent c'est bien, le garder c'est mieux.",
    icon: 'receipt',
  },
  {
    id: 3,
    title: 'Investissement',
    desc: 'Retraite, assurance, matières premières, cryptomonnaie, trading, marché des actions et dividendes. On vous apprend à sécuriser votre futur,',
    highlight: "jusqu'à prendre une longueur d'avance sur lui.",
    icon: 'trend',
  },
  {
    id: 4,
    title: 'Développement personnel',
    desc: "Gagner de l'argent ne sert à rien sans le mental pour le gérer. Ici, on parle de vrai développement personnel qui",
    highlight: 'change une vie — pas de simple motivation.',
    icon: 'target',
  },
  {
    id: 5,
    title: 'Communauté',
    desc: "On ne s'arrête pas là : au-delà d'une formation riche en contenu, vous bénéficiez d'un support 7j/7 et d'un groupe de passionnés à votre image, parce qu'",
    highlight: 'un changement de vie se fait en groupe.',
    icon: 'users',
  },
];

@Component({
  selector: 'app-factors',
  templateUrl: './factors.html',
  styleUrl: './factors.css',
  imports: [RouterLink, Particles, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Factors {
  private readonly timeline = viewChild.required<ElementRef<HTMLElement>>('timeline');
  private readonly railPath = viewChild.required<ElementRef<SVGPathElement>>('railPath');
  private readonly destroyRef = inject(DestroyRef);

  protected readonly factors = FACTORS;

  constructor() {
    afterNextRender(() => this.initRail());
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
      const nodes = Array.from(timeline.querySelectorAll<HTMLElement>('.factor-node'));
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
      this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
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

    this.destroyRef.onDestroy(() => trigger.kill());
  }
}
