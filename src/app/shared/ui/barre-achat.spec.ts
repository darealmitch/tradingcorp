import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BarreAchat } from './barre-achat';
import { Vitrine } from '../../core/commerce/vitrine.model';
import { VerrouDefilement } from '../../core/defilement/verrou-defilement';
import { AccesDonnees } from '../../core/supabase/acces-donnees';

const FORMATION: Vitrine = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  prix_centimes: 99_700,
  devise: 'eur',
  delivre_certificat: true,
  modules: 8,
  lecons_video: 64,
  secondes_video: 145_044,
  quiz: 30,
  ressources: 15,
  lecons_offertes: [
    { titre: '1.1 Le processus', module: 'Développement personnel', duree_s: 1742 },
    { titre: '1.2 Confiance en soi', module: 'Développement personnel', duree_s: 1164 },
    { titre: '1.3 Tes rêves', module: 'Développement personnel', duree_s: 767 },
  ],
  programme: [],
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

  /** Le seuil vaut une hauteur de fenêtre : on la fixe pour raisonner en clair. */
  const HAUTEUR_FENETRE = 800;

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

  /**
   * La vitrine passe par le vrai `VitrineService` : seule la lecture en base
   * est simulée. C'est bien le prix de la base qui doit s'afficher, mis en
   * forme par le service — pas une valeur posée par le test.
   */
  async function monter(vitrines: Vitrine[]): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BarreAchat],
      providers: [
        provideRouter([]),
        {
          provide: AccesDonnees,
          useValue: {
            lire: async () => vitrines,
            appel: () => ({}),
            mesurer: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();

    Object.defineProperty(window, 'innerHeight', {
      value: HAUTEUR_FENETRE,
      writable: true,
      configurable: true,
    });
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
    defilerA(HAUTEUR_FENETRE + 100);
    expect(estVisible()).toBe(true);
  });

  it('se retire lorsqu’on remonte franchement', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 100);
    defilerA(0);
    expect(estVisible()).toBe(false);
  });

  it('ne paraît pas tant que le premier écran n’est pas passé', async () => {
    await monter([FORMATION]);

    // Le hero et ses boutons occupent ce premier écran : y superposer la barre
    // doublait un appel à l'action encore visible.
    defilerA(HAUTEUR_FENETRE - 50);
    expect(estVisible()).toBe(false);

    defilerA(HAUTEUR_FENETRE + 1);
    expect(estVisible()).toBe(true);
  });

  it('ne clignote pas quand on oscille autour du seuil', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 20);
    expect(estVisible()).toBe(true);

    // Quatre pixels suffisaient à la faire disparaître ; l'inertie et le rebond
    // d'iOS traversent ce point sans arrêt.
    for (const y of [HAUTEUR_FENETRE - 4, HAUTEUR_FENETRE + 4, HAUTEUR_FENETRE - 30]) {
      defilerA(y);
      expect(estVisible()).toBe(true);
    }

    // Elle ne se retire qu'une fois franchement remonté.
    defilerA(HAUTEUR_FENETRE * 0.5);
    expect(estVisible()).toBe(false);
  });

  it('réserve sa place dès le montage, et non au défilement', async () => {
    await monter([FORMATION]);

    // La marge posée au moment de l'apparition déplaçait la page de 76 px sous
    // le doigt, en même temps que la barre glissait.
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);

    defilerA(HAUTEUR_FENETRE + 100);
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);

    defilerA(0);
    expect(document.body.classList.contains('a-barre-achat')).toBe(true);
  });

  it('affiche le prix venu de la base, pas une valeur écrite en dur', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 100);

    const texte = barre()?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texte).toContain('997');
    expect(texte).toContain('€');
  });

  it('annonce les leçons offertes et l’accès sans limite de durée, jamais « à vie »', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 100);

    // L'article 7 des CGV promet un accès sans limitation de durée, sous
    // réserve du maintien de la plateforme : « à vie » en disait plus.
    const texte = barre()?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texte).toContain('3 leçons offertes');
    expect(texte).toContain('accès sans limite de durée');
    expect(texte).not.toContain('à vie');
  });

  it('sans leçon offerte, rappelle seulement l’accès sans limite de durée', async () => {
    await monter([{ ...FORMATION, lecons_offertes: [] }]);
    defilerA(HAUTEUR_FENETRE + 100);

    const texte = barre()?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(texte).not.toContain('offerte');
    expect(texte).toContain('Accès sans limite de durée');
  });

  it('garde son bouton quand le prix n’a pas pu être lu', async () => {
    // La lecture de la vitrine renvoie un tableau vide en cas d'échec :
    // la barre perd son prix, jamais son appel à l'action.
    await monter([]);
    defilerA(HAUTEUR_FENETRE + 100);

    expect(estVisible()).toBe(true);
    expect(barre()?.querySelector('a')?.getAttribute('href')).toBe('/inscription');
    expect(barre()?.textContent).not.toContain('€');
  });

  it('n’arrondit pas un prix à centimes', async () => {
    await monter([{ ...FORMATION, prix_centimes: 99_799 }]);
    defilerA(HAUTEUR_FENETRE + 100);

    const texte = barre()?.textContent?.replace(/\s/g, ' ') ?? '';
    expect(texte).toContain('997');
    expect(texte).not.toContain('998');
  });

  it('ignore le défilement pendant que la page est figée', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 100);
    expect(estVisible()).toBe(true);

    // Ouvrir le menu mobile fige le corps de page : `scrollY` retombe à zéro
    // et un événement de défilement est émis, alors que rien n'a bougé.
    TestBed.inject(VerrouDefilement).verrouiller();
    defilerA(0);
    expect(estVisible()).toBe(true);

    TestBed.inject(VerrouDefilement).deverrouiller();
  });

  it('nettoie derrière elle à la destruction', async () => {
    await monter([FORMATION]);
    defilerA(HAUTEUR_FENETRE + 100);
    fixture.destroy();

    // La marge survivrait à la page de vente et décalerait toutes les suivantes.
    expect(document.body.classList.contains('a-barre-achat')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    expect(() => window.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
