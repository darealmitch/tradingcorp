import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BarreAchat } from './barre-achat';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';

const FORMATION: Formation = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  slug: 'trader-pro',
  description: null,
  prix_centimes: 99_700,
  devise: 'eur',
};

/**
 * Deux comportements portent tout le composant : la bascule au défilement et
 * l'affichage d'un prix venu de la base. jsdom ne défile pas, mais il expose
 * `scrollY` et l'événement, ce qui suffit — voir `retour-haut.spec.ts`.
 */
describe('BarreAchat', () => {
  let fixture: ComponentFixture<BarreAchat>;

  function defilerA(y: number): void {
    Object.defineProperty(window, 'scrollY', { value: y, writable: true, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    fixture.detectChanges();
  }

  function barre(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.barre-achat');
  }

  async function monter(formations: Formation[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BarreAchat],
      providers: [
        provideRouter([]),
        { provide: CommerceService, useValue: { chargerFormations: async () => formations } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BarreAchat);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => {
    document.body.classList.remove('a-barre-achat');
    TestBed.resetTestingModule();
  });

  it('reste absente tant que le hero est à l’écran', async () => {
    await monter([FORMATION]);
    expect(barre()).toBeNull();
    expect(document.body.classList.contains('a-barre-achat')).toBe(false);
  });

  it('paraît une fois le premier écran défilé', async () => {
    await monter([FORMATION]);
    defilerA(700);
    expect(barre()).not.toBeNull();
  });

  it('signale sa présence au reste de la page', async () => {
    await monter([FORMATION]);
    defilerA(700);

    // Sans ce drapeau, la barre recouvrirait les derniers liens du pied de
    // page et le bouton « retour en haut ».
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);

    defilerA(100);
    expect(document.body.classList.contains('a-barre-achat')).toBe(false);
  });

  it('affiche le prix venu de la base, pas une valeur écrite en dur', async () => {
    await monter([FORMATION]);
    defilerA(700);

    const texte = barre()?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texte).toContain('997');
    expect(texte).toContain('€');
    expect(texte).toContain('Accès à vie');
  });

  it('garde son bouton quand le prix n’a pas pu être lu', async () => {
    // `chargerFormations` renvoie un tableau vide en cas d'échec de lecture :
    // la barre perd son prix, jamais son appel à l'action.
    await monter([]);
    defilerA(700);

    expect(barre()).not.toBeNull();
    expect(barre()?.querySelector('a')?.getAttribute('href')).toBe('/inscription');
    expect(barre()?.textContent).not.toContain('€');
  });

  it('n’arrondit pas un prix à centimes', async () => {
    await monter([{ ...FORMATION, prix_centimes: 99_799 }]);
    defilerA(700);

    const texte = barre()?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texte).toContain('997');
    expect(texte).not.toContain('998');
  });

  it('nettoie derrière elle à la destruction', async () => {
    await monter([FORMATION]);
    defilerA(700);
    fixture.destroy();

    // Le drapeau survivrait à la page d'accueil et décalerait le pied de page
    // de toutes les suivantes.
    expect(document.body.classList.contains('a-barre-achat')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
