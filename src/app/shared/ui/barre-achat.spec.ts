import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BarreAchat } from './barre-achat';
import { CommerceService } from '../../core/commerce/commerce.service';
import { Formation } from '../../core/commerce/formation.model';

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
 *
 * La barre reste dans le DOM en permanence : c'est sa classe qu'on éprouve, et
 * non sa présence, sans quoi elle disparaîtrait d'un coup au lieu de glisser.
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

  function estVisible(): boolean {
    return barre()?.classList.contains('est-visible') ?? false;
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

  it('reste masquée tant que le hero est à l’écran', async () => {
    await monter([FORMATION]);
    expect(barre()).not.toBeNull();
    expect(estVisible()).toBe(false);
  });

  it('paraît une fois le premier écran défilé', async () => {
    await monter([FORMATION]);
    defilerA(700);
    expect(estVisible()).toBe(true);
  });

  it('se retire lorsqu’on remonte au-dessus du seuil', async () => {
    await monter([FORMATION]);
    defilerA(700);
    defilerA(100);
    expect(estVisible()).toBe(false);
  });

  it('réserve sa place dès le montage, et non au défilement', async () => {
    await monter([FORMATION]);

    // La marge posée au moment de l'apparition déplaçait la page de 76 px sous
    // le doigt, en même temps que la barre glissait.
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);

    defilerA(700);
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);

    defilerA(100);
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);
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

    expect(estVisible()).toBe(true);
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

    // La marge survivrait à la page de vente et décalerait toutes les suivantes.
    expect(document.body.classList.contains('a-barre-achat')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
