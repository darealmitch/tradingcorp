import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { UrlCanoniqueService } from './url-canonique.service';

/**
 * Ce que ces tests protègent :
 *
 *   • **une seule adresse pour trois publications.** La même application vit
 *     sur tradingcorp.fr, sur tradingcorp.pages.dev et en démonstration sur
 *     GitHub Pages. La balise doit donc désigner le domaine commercial, quelle
 *     que soit l'adresse d'où la page est servie — une valeur construite depuis
 *     `location.origin` ferait exactement l'inverse de ce qu'on cherche.
 *
 *   • **la page consultée, pas l'accueil.** Une balise figée sur `/` ferait
 *     déclarer à /cgv qu'elle est un doublon de la page d'accueil, ce qui la
 *     désindexerait au lieu de la protéger.
 *
 *   • **une seule balise dans le document.** index.html en pose déjà une ;
 *     deux canoniques contradictoires sont ignorées par les moteurs, ce qui
 *     revient à n'en avoir aucune.
 */
describe('UrlCanoniqueService', () => {
  let evenements: Subject<NavigationEnd>;
  let service: UrlCanoniqueService;

  const canonique = () => document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  beforeEach(() => {
    document.head.querySelectorAll('link[rel="canonical"]').forEach((n) => n.remove());
    evenements = new Subject<NavigationEnd>();

    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events: evenements.asObservable() } }],
    });
    service = TestBed.inject(UrlCanoniqueService);
    service.demarrer();
  });

  function naviguer(url: string): void {
    evenements.next(new NavigationEnd(1, url, url));
  }

  it('déclare le domaine commercial, pas celui d’où la page est servie', () => {
    naviguer('/cgv');
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/cgv');
  });

  it('suit la page consultée', () => {
    naviguer('/');
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/');

    naviguer('/mentions-legales');
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/mentions-legales');
  });

  it('écarte les paramètres et les ancres, qui ne changent pas la page', () => {
    naviguer('/espace?achat=succes');
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/espace');

    naviguer('/#formations');
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/');
  });

  it('réutilise la balise existante au lieu d’en ajouter une seconde', () => {
    const posee = document.createElement('link');
    posee.setAttribute('rel', 'canonical');
    posee.setAttribute('href', 'https://tradingcorp.fr/');
    document.head.appendChild(posee);

    naviguer('/parcours');

    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1);
    expect(canonique()?.getAttribute('href')).toBe('https://tradingcorp.fr/parcours');
  });
});
