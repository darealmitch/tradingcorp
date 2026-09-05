import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Header } from './header';

/**
 * Ce qui est éprouvé ici n'est pas l'apparence du menu mais sa neutralité :
 * l'ouvrir puis le fermer doit laisser la page exactement où elle était.
 * jsdom ne défile pas, mais il expose `scrollY`, `scrollTo` et les styles en
 * ligne du corps de page — de quoi vérifier chaque maillon.
 */
describe('Header — menu mobile', () => {
  let fixture: ComponentFixture<Header>;
  let scrollTo: { x: number; y: number }[];

  function defilerA(y: number): void {
    Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  }

  function element(selecteur: string): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(selecteur);
  }

  function burger(): HTMLButtonElement {
    return element('.menu-toggle') as HTMLButtonElement;
  }

  function menuOuvert(): boolean {
    return element('.menu-mobile')?.classList.contains('est-ouvert') ?? false;
  }

  function pageFigee(): boolean {
    return document.body.style.position === 'fixed';
  }

  beforeEach(async () => {
    scrollTo = [];
    Object.defineProperty(window, 'scrollTo', {
      value: (x: number, y: number) => scrollTo.push({ x, y }),
      writable: true,
      configurable: true,
    });

    await TestBed.configureTestingModule({
      imports: [Header],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Header);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => {
    document.body.removeAttribute('style');
    TestBed.resetTestingModule();
  });

  it('laisse la page libre tant que le menu est clos', () => {
    expect(menuOuvert()).toBe(false);
    expect(pageFigee()).toBe(false);
  });

  it('pose la surcouche hors du bandeau', () => {
    // Un ancêtre portant `backdrop-filter` deviendrait le référent d'un
    // descendant en `position: fixed` : le menu se calerait sur les 72 px du
    // bandeau au lieu de l'écran.
    const menu = element('.menu-mobile');
    expect(menu).not.toBeNull();
    expect(menu?.closest('.site-header')).toBeNull();
  });

  it('fige la page à la position exacte où le menu a été ouvert', () => {
    defilerA(1500);
    burger().click();
    fixture.detectChanges();

    expect(menuOuvert()).toBe(true);
    expect(document.body.style.position).toBe('fixed');
    expect(document.body.style.top).toBe('-1500px');
    expect(document.body.style.width).toBe('100%');
  });

  it('rend la page à la même position à la fermeture', () => {
    defilerA(1500);
    burger().click();
    fixture.detectChanges();

    burger().click();
    fixture.detectChanges();

    expect(menuOuvert()).toBe(false);
    expect(pageFigee()).toBe(false);
    expect(document.body.style.top).toBe('');
    // Restauration exacte, sans remontée ni saut.
    expect(scrollTo).toEqual([{ x: 0, y: 1500 }]);
  });

  it('ne touche pas au fond du bandeau pendant que le menu est ouvert', () => {
    defilerA(1500);
    const avant = element('.site-header')?.classList.contains('is-scrolled');
    burger().click();
    fixture.detectChanges();

    // Figer le corps de page remet `scrollY` à zéro et émet un événement de
    // défilement : sans garde, le bandeau perdrait son fond sous les yeux.
    defilerA(0);
    expect(element('.site-header')?.classList.contains('is-scrolled')).toBe(avant);
  });

  it('libère la page quand on repasse au format bureau', () => {
    defilerA(1500);
    burger().click();
    fixture.detectChanges();

    Object.defineProperty(window, 'innerWidth', {
      value: 1280,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    fixture.detectChanges();

    expect(menuOuvert()).toBe(false);
    expect(pageFigee()).toBe(false);
    expect(scrollTo).toEqual([{ x: 0, y: 1500 }]);
  });

  it('libère la page si le composant disparaît menu ouvert', () => {
    defilerA(800);
    burger().click();
    fixture.detectChanges();
    expect(pageFigee()).toBe(true);

    fixture.destroy();

    // Sans cela, la page resterait figée et inutilisable.
    expect(pageFigee()).toBe(false);
  });

  it('ne fige rien de plus quand on referme un menu déjà clos', () => {
    defilerA(600);
    // `closeMenu` est appelé au clic sur chaque lien, y compris menu fermé.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();

    expect(pageFigee()).toBe(false);
    expect(scrollTo).toEqual([]);
  });
});
