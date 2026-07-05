import { l as lf, W as W$1, b as bu, P as Po } from './chunk-DaVyTOvH.js';
import {
  a as zF,
  p,
  D as De,
  R as Rl,
  z as zl,
  $ as $m,
  C as Cs,
  c as as,
  s as sD,
  Z as Zl,
  N as Nf,
  O as Ow,
  f as Rf,
  d as BE,
  k as kw,
  n as ng,
  B as Bw,
  b as Rw,
  o as og,
  x as xw,
  e as Jl,
} from './main-I7SYDKSX.js';
var I = ['timeline'],
  B = ['railPath'],
  N = (i, r) => r.id;
function Q(i, r) {
  i & 1 && (Nf(), as(0, 'svg', 27), Cs(1, 'path', 32)(2, 'path', 33), Zl());
}
function W(i, r) {
  i & 1 && (Nf(), as(0, 'svg', 27), Cs(1, 'path', 34)(2, 'path', 35), Zl());
}
function Z(i, r) {
  i & 1 && (Nf(), as(0, 'svg', 27), Cs(1, 'path', 36)(2, 'path', 37), Zl());
}
function U(i, r) {
  i & 1 && (Nf(), as(0, 'svg', 27), Cs(1, 'circle', 38)(2, 'circle', 39)(3, 'circle', 40), Zl());
}
function Y(i, r) {
  i & 1 && (Nf(), as(0, 'svg', 27), Cs(1, 'circle', 41)(2, 'path', 42)(3, 'path', 43), Zl());
}
function J(i, r) {
  if (
    (i & 1 &&
      (as(0, 'article', 19)(1, 'div', 23)(2, 'span', 24),
      sD(3),
      Zl()(),
      as(4, 'div', 25)(5, 'div', 26),
      Rw(6, Q, 3, 0, ':svg:svg', 27)(7, W, 3, 0, ':svg:svg', 27)(8, Z, 3, 0, ':svg:svg', 27)(
        9,
        U,
        4,
        0,
        ':svg:svg',
        27,
      )(10, Y, 4, 0, ':svg:svg', 27),
      Zl(),
      as(11, 'span', 28),
      sD(12),
      Zl(),
      as(13, 'h2', 29),
      sD(14),
      Zl(),
      as(15, 'p', 30),
      sD(16),
      as(17, 'span', 31),
      sD(18),
      Zl()()()()),
    i & 2)
  ) {
    let t,
      o = r.$implicit;
    (BE(3),
      og(o.id),
      BE(3),
      xw(
        (t = o.icon) === 'book'
          ? 6
          : t === 'receipt'
            ? 7
            : t === 'trend'
              ? 8
              : t === 'target'
                ? 9
                : t === 'users'
                  ? 10
                  : -1,
      ),
      BE(6),
      Jl('0', o.id, ' \u2014 Facteur'),
      BE(2),
      og(o.title),
      BE(2),
      Jl(' ', o.desc, ' '),
      BE(2),
      og(o.highlight));
  }
}
var K = [
    {
      id: 1,
      title: '\xC9ducation financi\xE8re',
      desc: 'Budg\xE9tisation, inflation, d\xE9flation, planche \xE0 billets, banque centrale, taux directeur, histoire mon\xE9taire, DeFi, cryptomonnaie, march\xE9s et NFT.',
      highlight: "Venez apprendre l'argent comme personne ne vous l'a jamais appris.",
      icon: 'book',
    },
    {
      id: 2,
      title: 'Fiscalit\xE9',
      desc: "Cr\xE9ation de soci\xE9t\xE9, d\xE9claration d'imp\xF4ts, optimisation et automatisation fiscale. On vous apprend \xE0 g\xE9rer votre paperasse sans vous prendre la t\xEAte \u2014",
      highlight: "gagner de l'argent c'est bien, le garder c'est mieux.",
      icon: 'receipt',
    },
    {
      id: 3,
      title: 'Investissement',
      desc: 'Retraite, assurance, mati\xE8res premi\xE8res, cryptomonnaie, trading, march\xE9 des actions et dividendes. On vous apprend \xE0 s\xE9curiser votre futur,',
      highlight: "jusqu'\xE0 prendre une longueur d'avance sur lui.",
      icon: 'trend',
    },
    {
      id: 4,
      title: 'D\xE9veloppement personnel',
      desc: "Gagner de l'argent ne sert \xE0 rien sans le mental pour le g\xE9rer. Ici, on parle de vrai d\xE9veloppement personnel qui",
      highlight: 'change une vie \u2014 pas de simple motivation.',
      icon: 'target',
    },
    {
      id: 5,
      title: 'Communaut\xE9',
      desc: "On ne s'arr\xEAte pas l\xE0 : au-del\xE0 d'une formation riche en contenu, vous b\xE9n\xE9ficiez d'un support 7j/7 et d'un groupe de passionn\xE9s \xE0 votre image, parce qu'",
      highlight: 'un changement de vie se fait en groupe.',
      icon: 'users',
    },
  ],
  V = class i {
    timeline = zF.required('timeline');
    railPath = zF.required('railPath');
    destroyRef = p(De);
    factors = K;
    constructor() {
      Rl(() => this.initRail());
    }
    initRail() {
      let r = this.timeline().nativeElement,
        t = this.railPath().nativeElement,
        o = matchMedia('(prefers-reduced-motion: reduce)').matches,
        q = (s) => {
          let l = 0,
            u = 0,
            d = s;
          for (; d && d !== r;) ((l += d.offsetLeft), (u += d.offsetTop), (d = d.offsetParent));
          return { x: l + s.offsetWidth / 2, y: u + s.offsetHeight / 2 };
        },
        b = () => {
          let l = Array.from(r.querySelectorAll('.factor-node')).map((f) => q(f));
          if (l.length < 2) return 0;
          let u = `M ${l[0].x} ${l[0].y}`;
          for (let f = 1; f < l.length; f++) {
            let M = l[f - 1],
              h = l[f],
              C = (M.y + h.y) / 2,
              E = (f % 2 === 0 ? -1 : 1) * 46;
            u += ` C ${M.x + E} ${C}, ${h.x + E} ${C}, ${h.x} ${h.y}`;
          }
          t.setAttribute('d', u);
          let d = t.ownerSVGElement;
          return (
            d && d.setAttribute('viewBox', `0 0 ${r.offsetWidth} ${r.offsetHeight}`),
            t.getTotalLength()
          );
        },
        m = b();
      if (((t.style.strokeDasharray = `${m}`), (t.style.strokeDashoffset = o ? '0' : `${m}`), o)) {
        let s = () => {
          ((m = b()), (t.style.strokeDasharray = `${m}`), (t.style.strokeDashoffset = '0'));
        };
        (window.addEventListener('resize', s),
          document.fonts.ready.then(s),
          this.destroyRef.onDestroy(() => window.removeEventListener('resize', s)));
        return;
      }
      lf.registerPlugin(W$1);
      let G = W$1.create({
        trigger: r,
        start: 'top 72%',
        end: 'bottom 85%',
        scrub: 1,
        invalidateOnRefresh: true,
        onRefresh: () => {
          ((m = b()), (t.style.strokeDasharray = `${m}`));
        },
        onUpdate: (s) => {
          t.style.strokeDashoffset = `${m * (1 - s.progress)}`;
        },
      });
      (document.fonts.ready.then(() => W$1.refresh()), this.destroyRef.onDestroy(() => G.kill()));
    }
    static ɵfac = function (t) {
      return new (t || i)();
    };
    static ɵcmp = zl({
      type: i,
      selectors: [['app-factors']],
      viewQuery: function (t, o) {
        (t & 1 && ng(o.timeline, I, 5)(o.railPath, B, 5), t & 2 && Bw(2));
      },
      decls: 41,
      vars: 0,
      consts: [
        ['timeline', ''],
        ['railPath', ''],
        [1, 'factors-hero'],
        [1, 'container'],
        [1, 'eyebrow'],
        [1, 'factors-title'],
        [1, 'text-gradient'],
        [1, 'factors-lead'],
        [1, 'factors-hero-actions'],
        ['routerLink', '/', 'fragment', 'commencer', 1, 'btn', 'btn-primary'],
        ['href', '#facteurs-liste', 1, 'btn', 'btn-ghost'],
        ['id', 'facteurs-liste', 1, 'section'],
        [1, 'container', 'timeline'],
        ['aria-hidden', 'true', 'preserveAspectRatio', 'none', 1, 'timeline-rail'],
        ['id', 'rail-grad', 'x1', '0', 'y1', '0', 'x2', '0', 'y2', '1'],
        ['offset', '0', 'stop-color', '#38e1ff'],
        ['offset', '0.5', 'stop-color', '#7c6cff'],
        ['offset', '1', 'stop-color', '#e14dff'],
        [
          'fill',
          'none',
          'stroke',
          'url(#rail-grad)',
          'stroke-width',
          '2.5',
          'stroke-linecap',
          'round',
          1,
          'timeline-path',
        ],
        ['appReveal', '', 1, 'factor-row'],
        [1, 'section', 'factors-cta'],
        ['appReveal', '', 1, 'cta-panel'],
        [1, 'cta-note'],
        [1, 'factor-node'],
        [1, 'factor-num', 'text-gradient'],
        [1, 'factor-card'],
        ['aria-hidden', 'true', 1, 'factor-icon'],
        [
          'viewBox',
          '0 0 24 24',
          'fill',
          'none',
          'stroke',
          'currentColor',
          'stroke-width',
          '1.7',
          'stroke-linecap',
          'round',
          'stroke-linejoin',
          'round',
        ],
        ['aria-hidden', 'true', 1, 'factor-index'],
        [1, 'factor-name'],
        [1, 'factor-desc'],
        [1, 'factor-hl'],
        ['d', 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5V5.5Z'],
        ['d', 'M4 20.5A2.5 2.5 0 0 1 6.5 18H20v3H6.5A2.5 2.5 0 0 1 4 20.5Z'],
        ['d', 'M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3Z'],
        ['d', 'M9 8h6M9 12h6'],
        ['d', 'M3 17l6-6 4 4 8-8'],
        ['d', 'M15 7h6v6'],
        ['cx', '12', 'cy', '12', 'r', '9'],
        ['cx', '12', 'cy', '12', 'r', '5'],
        ['cx', '12', 'cy', '12', 'r', '1.4'],
        ['cx', '9', 'cy', '8', 'r', '3.2'],
        ['d', 'M3.5 20a5.5 5.5 0 0 1 11 0'],
        ['d', 'M16 5.2a3.2 3.2 0 0 1 0 5.6M17.5 20a5.5 5.5 0 0 0-3-4.9'],
      ],
      template: function (t, o) {
        (t & 1 &&
          (Cs(0, 'app-particles'),
          as(1, 'section', 2)(2, 'div', 3)(3, 'span', 4),
          sD(4, 'Le programme'),
          Zl(),
          as(5, 'h1', 5),
          sD(6, ' D\xE9couvrez les 5 facteurs qui'),
          Cs(7, 'br'),
          as(8, 'span', 6),
          sD(9, 'changeront votre vie'),
          Zl()(),
          as(10, 'p', 7),
          sD(
            11,
            " Une m\xE9thode compl\xE8te, du premier euro \xE0 la libert\xE9 financi\xE8re. Cinq piliers pens\xE9s pour \xEAtre appris dans l'ordre, chacun b\xE2ti sur le pr\xE9c\xE9dent. ",
          ),
          Zl(),
          as(12, 'div', 8)(13, 'a', 9),
          sD(14, 'Rejoindre le programme'),
          Zl(),
          as(15, 'a', 10),
          sD(16, 'Voir les 5 facteurs'),
          Zl()()()(),
          as(17, 'section', 11)(18, 'div', 12, 0),
          Nf(),
          as(20, 'svg', 13)(21, 'defs')(22, 'linearGradient', 14),
          Cs(23, 'stop', 15)(24, 'stop', 16)(25, 'stop', 17),
          Zl()(),
          Cs(26, 'path', 18, 1),
          Zl(),
          Ow(28, J, 19, 6, 'article', 19, N),
          Zl()(),
          Rf(),
          as(30, 'section', 20)(31, 'div', 3)(32, 'div', 21)(33, 'h2'),
          sD(34, 'Pr\xEAt \xE0 r\xE9unir les 5\xA0facteurs\xA0?'),
          Zl(),
          as(35, 'p'),
          sD(
            36,
            " Rejoignez la formation et la communaut\xE9 qui transforment durablement votre rapport \xE0 l'argent. ",
          ),
          Zl(),
          as(37, 'a', 9),
          sD(38, 'Rejoindre le programme'),
          Zl(),
          as(39, 'span', 22),
          sD(40, 'Acc\xE8s \xE0 vie \xB7 Support 7j/7 \xB7 Communaut\xE9 active'),
          Zl()()()()),
          t & 2 && (BE(28), kw(o.factors)));
      },
      dependencies: [$m, bu, Po],
      styles: [
        '.factors-hero[_ngcontent-%COMP%]{position:relative;padding-block:160px 40px;text-align:center;overflow:hidden}.factors-hero[_ngcontent-%COMP%]:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(ellipse 50% 60% at 30% 0%,rgba(56,225,255,.1),transparent 70%),radial-gradient(ellipse 55% 60% at 78% 15%,rgba(225,77,255,.1),transparent 70%)}.factors-hero[_ngcontent-%COMP%]   .eyebrow[_ngcontent-%COMP%]{margin-bottom:20px}.factors-title[_ngcontent-%COMP%]{font-size:clamp(2.4rem,6vw,4.6rem);line-height:1.02}.factors-lead[_ngcontent-%COMP%]{max-width:620px;margin:26px auto 40px;color:var(--muted);font-size:clamp(1.05rem,1.6vw,1.2rem)}.factors-hero-actions[_ngcontent-%COMP%]{display:flex;flex-wrap:wrap;justify-content:center;gap:16px}.timeline[_ngcontent-%COMP%]{position:relative}.timeline-rail[_ngcontent-%COMP%]{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible}.factor-row[_ngcontent-%COMP%]{position:relative;display:grid;grid-template-columns:128px 1fr;gap:40px;align-items:center;padding-block:34px}.factor-node[_ngcontent-%COMP%]{position:relative;z-index:1;justify-self:center;display:grid;place-items:center;width:104px;height:104px;border-radius:50%;border:2px solid transparent;background:radial-gradient(circle at 50% 35%,rgba(255,255,255,.06),var(--surface) 70%) padding-box,var(--gradient) border-box;box-shadow:0 12px 40px #05060bb3;transition:transform .4s var(--ease-out),box-shadow .4s}.factor-row[_ngcontent-%COMP%]:hover   .factor-node[_ngcontent-%COMP%]{transform:scale(1.06);box-shadow:0 12px 40px #05060bb3,0 0 46px #7c6cff59}.factor-num[_ngcontent-%COMP%]{font-family:var(--font-title);font-size:3.2rem;line-height:1}.factor-card[_ngcontent-%COMP%]{position:relative;padding:34px 34px 36px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(180deg,#ffffff08,#fff0);transition:transform .4s var(--ease-out),border-color .4s,box-shadow .4s}.factor-card[_ngcontent-%COMP%]:before{content:"";position:absolute;left:-40px;top:50%;width:40px;height:1px;background:linear-gradient(90deg,transparent,rgba(124,108,255,.5))}.factor-row[_ngcontent-%COMP%]:hover   .factor-card[_ngcontent-%COMP%]{transform:translateY(-4px);border-color:#7c6cff73;box-shadow:0 22px 60px #05060b99}.factor-icon[_ngcontent-%COMP%]{display:grid;place-items:center;width:50px;height:50px;margin-bottom:20px;border-radius:14px;border:1px solid rgba(124,108,255,.35);background:#7c6cff1f;color:var(--cyan)}.factor-icon[_ngcontent-%COMP%]   svg[_ngcontent-%COMP%]{width:26px;height:26px}.factor-index[_ngcontent-%COMP%]{display:block;margin-bottom:8px;font-family:var(--font-display);font-size:.76rem;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--muted)}.factor-name[_ngcontent-%COMP%]{margin-bottom:14px;font-size:clamp(1.5rem,3vw,2.1rem)}.factor-desc[_ngcontent-%COMP%]{color:var(--muted);font-size:1.02rem;line-height:1.7}.factor-hl[_ngcontent-%COMP%]{font-weight:600;font-style:italic;background:var(--gradient);-webkit-background-clip:text;background-clip:text;color:transparent}.factors-cta[_ngcontent-%COMP%]   .cta-panel[_ngcontent-%COMP%]{position:relative;overflow:hidden;padding:80px 40px;border:1px solid var(--line);border-radius:24px;text-align:center;background:radial-gradient(ellipse 55% 80% at 12% 0%,rgba(56,225,255,.12),transparent 70%),radial-gradient(ellipse 55% 80% at 88% 100%,rgba(225,77,255,.12),transparent 70%),var(--surface)}.factors-cta[_ngcontent-%COMP%]   h2[_ngcontent-%COMP%]{margin-bottom:16px;font-size:clamp(1.9rem,4.4vw,3rem)}.factors-cta[_ngcontent-%COMP%]   p[_ngcontent-%COMP%]{max-width:460px;margin:0 auto 34px;color:var(--muted);font-size:1.08rem}.cta-note[_ngcontent-%COMP%]{display:block;margin-top:20px;color:var(--muted);font-size:.85rem}@media(max-width:760px){.factors-hero[_ngcontent-%COMP%]{padding-top:130px}.timeline-rail[_ngcontent-%COMP%]{display:none}.factor-row[_ngcontent-%COMP%]{grid-template-columns:1fr;justify-items:start;gap:20px;padding-block:20px}.factor-node[_ngcontent-%COMP%]{width:76px;height:76px;justify-self:start}.factor-num[_ngcontent-%COMP%]{font-size:2.3rem}.factor-card[_ngcontent-%COMP%]{padding:26px 24px 28px}.factor-card[_ngcontent-%COMP%]:before{display:none}}',
      ],
    });
  };
export { V as Factors };
