import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Reveal } from '../../../shared/reveal';

/** Scène d'introduction : titre de la formation + parallax de fond au scroll. */
@Component({
  selector: 'app-parcours-hero',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hero" #hero>
      <div class="hero-fond" #fond aria-hidden="true"></div>
      <div class="hero-inner">
        <span class="eyebrow" appReveal>{{ titre() }}</span>
        <h1 appReveal revealDelay="80">
          Un parcours <span class="text-gradient">progressif</span>,<br />
          conçu pour te faire avancer
        </h1>
        <p class="hero-sous" appReveal revealDelay="160">
          {{ total() }} modules à débloquer l'un après l'autre. Chaque étape validée ouvre la
          suivante.
        </p>
      </div>
      <span class="hero-scroll" aria-hidden="true"></span>
    </section>
  `,
  styles: `
    .hero {
      position: relative;
      min-height: 100svh;
      display: grid;
      place-content: center;
      text-align: center;
      overflow: hidden;
    }
    .hero-fond {
      position: absolute;
      inset: -20% 0 0;
      background:
        radial-gradient(circle at 30% 20%, rgba(56, 225, 255, 0.16), transparent 45%),
        radial-gradient(circle at 72% 60%, rgba(225, 77, 255, 0.14), transparent 48%);
      pointer-events: none;
    }
    .hero-inner {
      position: relative;
      max-width: 720px;
      padding: 0 24px;
    }
    .hero h1 {
      margin-top: 10px;
      font-size: clamp(2rem, 6vw, 3.6rem);
      line-height: 1.05;
    }
    .hero-sous {
      max-width: 520px;
      margin: 20px auto 0;
      color: var(--muted);
      font-size: 1.02rem;
    }
    .hero-scroll {
      position: absolute;
      bottom: 40px;
      left: 50%;
      width: 26px;
      height: 42px;
      transform: translateX(-50%);
      border: 2px solid var(--line);
      border-radius: 999px;
    }
    .hero-scroll::after {
      content: '';
      position: absolute;
      top: 8px;
      left: 50%;
      width: 4px;
      height: 8px;
      transform: translateX(-50%);
      border-radius: 999px;
      background: var(--muted);
      animation: hero-scroll 1.6s ease-in-out infinite;
    }
    @keyframes hero-scroll {
      0% {
        opacity: 0;
        transform: translate(-50%, 0);
      }
      40% {
        opacity: 1;
      }
      80% {
        opacity: 0;
        transform: translate(-50%, 14px);
      }
      100% {
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .hero-scroll::after {
        animation: none;
      }
    }
  `,
})
export class ParcoursHero {
  readonly titre = input.required<string>();
  readonly total = input.required<number>();

  private readonly hero = viewChild.required<ElementRef<HTMLElement>>('hero');
  private readonly fond = viewChild.required<ElementRef<HTMLElement>>('fond');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }
      gsap.registerPlugin(ScrollTrigger);
      const tween = gsap.to(this.fond().nativeElement, {
        yPercent: 22,
        ease: 'none',
        scrollTrigger: {
          trigger: this.hero().nativeElement,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      });
      this.destroyRef.onDestroy(() => tween.scrollTrigger?.kill());
    });
  }
}
