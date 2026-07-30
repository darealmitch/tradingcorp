import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RetourHaut } from './retour-haut';

/**
 * Le seuil et le comportement de défilement sont la seule logique du composant.
 * On pilote `window.scrollY` directement : jsdom ne défile pas, mais il expose
 * la propriété et l'événement, ce qui suffit à éprouver la bascule.
 */
describe('RetourHaut', () => {
  let fixture: ComponentFixture<RetourHaut>;
  let scrollTo: { top?: number; behavior?: string }[];

  function defilerA(y: number): void {
    Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  }

  function bouton(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('button');
  }

  beforeEach(async () => {
    scrollTo = [];
    Object.defineProperty(window, 'scrollTo', {
      value: (options: { top?: number; behavior?: string }) => scrollTo.push(options),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: false }),
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({ imports: [RetourHaut] }).compileComponents();
    fixture = TestBed.createComponent(RetourHaut);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  it('reste absent en haut de page', () => {
    expect(bouton()).toBeNull();
  });

  it('n’apparaît pas avant le seuil', () => {
    defilerA(400);
    expect(bouton()).toBeNull();
  });

  it('apparaît une fois le seuil dépassé', () => {
    defilerA(700);
    expect(bouton()).not.toBeNull();
  });

  it('disparaît lorsqu’on remonte au-dessus du seuil', () => {
    defilerA(700);
    expect(bouton()).not.toBeNull();

    defilerA(100);
    expect(bouton()).toBeNull();
  });

  it('remonte en haut de page au clic', () => {
    defilerA(700);
    bouton()?.click();

    expect(scrollTo.length).toBe(1);
    expect(scrollTo[0].top).toBe(0);
    expect(scrollTo[0].behavior).toBe('smooth');
  });

  it('supprime l’animation quand le mouvement réduit est demandé', () => {
    Object.defineProperty(window, 'matchMedia', {
      value: () => ({ matches: true }),
      writable: true,
      configurable: true,
    });
    defilerA(700);
    bouton()?.click();

    expect(scrollTo[0].behavior).toBe('auto');
  });

  it('porte un libellé accessible', () => {
    defilerA(700);
    expect(bouton()?.getAttribute('aria-label')).toBe('Revenir en haut de la page');
  });

  it('retire son écouteur de défilement à la destruction', () => {
    defilerA(700);
    fixture.destroy();

    // Sans retrait, l'écouteur survivrait au composant et écrirait dans un
    // signal détruit à chaque défilement de la page suivante.
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
