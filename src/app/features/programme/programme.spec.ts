import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Vitrine, prixAffiche } from '../../core/commerce/vitrine.model';
import { VitrineService } from '../../core/commerce/vitrine.service';
import { Programme } from './programme';

const VITRINE: Vitrine = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  prix_centimes: 99_700,
  devise: 'eur',
  delivre_certificat: true,
  modules: 2,
  lecons_video: 3,
  secondes_video: 3_906,
  quiz: 1,
  ressources: 0,
  lecons_offertes: [
    { titre: '1.1 Le processus', module: 'Développement personnel', duree_s: 1742 },
  ],
  programme: [
    {
      position: 1,
      titre: 'Développement personnel',
      accroche: null,
      objectifs: [],
      lecons_video: 2,
      secondes_video: 2_906,
      quiz: 1,
      lecons_offertes: 1,
      lecons: [
        { titre: '1.1 Le processus', type: 'video', duree_s: 1742, offerte: true },
        { titre: '1.2 Confiance en soi', type: 'video', duree_s: 1164, offerte: false },
        { titre: 'Quiz - Éducation financière', type: 'quiz', duree_s: null, offerte: false },
      ],
    },
    {
      // Une base sans la migration du sommaire ne renvoie pas `lecons`.
      position: 2,
      titre: 'Trading',
      accroche: null,
      objectifs: [],
      lecons_video: 1,
      secondes_video: 1_000,
      quiz: 0,
      lecons_offertes: 0,
    },
  ],
};

/**
 * Le sommaire répond à la question de l'acheteur : « que vais-je recevoir ? ».
 * Il ne montre que ce que la vitrine transporte — titres, nature, durée — et
 * s'efface sans bruit quand la base ne le fournit pas encore.
 */
describe('Programme — sommaire des modules', () => {
  let page: HTMLElement;

  beforeAll(() => {
    // La frise animée lit ces API du navigateur, absentes de jsdom.
    const rien = (): void => undefined;
    (globalThis as Record<string, unknown>)['matchMedia'] ??= () => ({
      matches: true,
      addEventListener: rien,
      removeEventListener: rien,
    });
    (globalThis as Record<string, unknown>)['IntersectionObserver'] ??= class {
      observe = rien;
      unobserve = rien;
      disconnect = rien;
    };
    if (!('fonts' in document)) {
      Object.defineProperty(document, 'fonts', {
        value: { ready: Promise.resolve() },
        configurable: true,
      });
    }
  });

  beforeEach(async () => {
    const v = signal<Vitrine | null>(VITRINE);
    TestBed.configureTestingModule({
      imports: [Programme],
      providers: [
        provideRouter([]),
        {
          provide: VitrineService,
          useValue: {
            vitrine: v,
            charger: () => Promise.resolve(v()),
            prix: computed(() => prixAffiche(99_700, 'eur')),
            nombreOffertes: computed(() => 1),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Programme);
    fixture.detectChanges();
    await fixture.whenStable();
    page = fixture.nativeElement as HTMLElement;
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.getElementById('donnees-formation')?.remove();
  });

  function texte(element: Element): string {
    return (element.textContent ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
  }

  it('liste les étapes du module, avec leur nature, leur durée et les leçons offertes', () => {
    const sommaires = page.querySelectorAll('.module-sommaire');
    expect(sommaires).toHaveLength(1);
    expect(texte(sommaires[0].querySelector('summary')!)).toBe('Voir le sommaire (3 étapes)');

    const etapes = [...sommaires[0].querySelectorAll('.sommaire-etape')].map(texte);
    expect(etapes).toEqual([
      'Vidéo 1.1 Le processus 29 min Offerte',
      'Vidéo 1.2 Confiance en soi 19 min',
      'Quiz Éducation financière',
    ]);
  });

  it('décrit la formation aux moteurs de recherche, sans rien inventer', () => {
    const balise = document.getElementById('donnees-formation');
    const donnees = JSON.parse(balise?.textContent ?? '{}') as Record<string, unknown>;

    expect(donnees['@type']).toBe('Course');
    expect(donnees['offers']).toEqual([
      expect.objectContaining({ category: 'Paid', price: 997, priceCurrency: 'EUR' }),
    ]);
    expect(donnees['hasCourseInstance']).toEqual([
      expect.objectContaining({ courseMode: 'Online', courseWorkload: 'PT1H5M' }),
    ]);
    expect(donnees).not.toHaveProperty('aggregateRating');
    expect(donnees).not.toHaveProperty('review');
  });
});
