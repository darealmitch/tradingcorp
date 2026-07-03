import {
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  inject,
  input,
  numberAttribute,
} from '@angular/core';

/**
 * Révèle l'élément (fondu + translation) lorsqu'il entre dans le viewport.
 * Avec `prefers-reduced-motion`, l'élément est affiché immédiatement.
 */
@Directive({
  selector: '[appReveal]',
})
export class Reveal implements OnInit, OnDestroy {
  readonly revealDelay = input(0, { transform: numberAttribute });

  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer?: IntersectionObserver;

  ngOnInit(): void {
    const node = this.el.nativeElement;
    node.classList.add('reveal');

    const reducedMotion =
      typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      node.classList.add('is-visible');
      return;
    }

    if (this.revealDelay() > 0) {
      node.style.transitionDelay = `${this.revealDelay()}ms`;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          node.classList.add('is-visible');
          this.observer?.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px' },
    );
    this.observer.observe(node);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
