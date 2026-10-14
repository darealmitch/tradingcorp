import { Type, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Vitrine, prixAffiche } from '../../../../core/commerce/vitrine.model';
import { VitrineService } from '../../../../core/commerce/vitrine.service';
import { Faq } from '../faq/faq';
import { Offre } from './offre';

/** La formation telle que la base la décrivait le 14/10/2026. */
const VITRINE: Vitrine = {
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
  ],
  programme: [
    {
      position: 1,
      titre: 'Développement personnel',
      accroche: null,
      objectifs: [],
      lecons_video: 5,
      secondes_video: 5040,
      quiz: 0,
      lecons_offertes: 2,
    },
    {
      position: 2,
      titre: 'Trading',
      accroche: null,
      objectifs: [],
      lecons_video: 22,
      secondes_video: 54_360,
      quiz: 12,
      lecons_offertes: 0,
    },
  ],
};

/** Un double de la vitrine : mêmes signaux que le service, valeur fixée par le test. */
function vitrine(valeur: Vitrine | null) {
  const v = signal(valeur);
  return {
    vitrine: v,
    prix: computed(() => (v() ? prixAffiche(v()!.prix_centimes, v()!.devise) : null)),
    nombreOffertes: computed(() => v()?.lecons_offertes.length ?? 0),
  };
}

function monter<T>(composant: Type<T>, valeur: Vitrine | null): HTMLElement {
  TestBed.configureTestingModule({
    imports: [composant],
    providers: [provideRouter([]), { provide: VitrineService, useValue: vitrine(valeur) }],
  });
  const fixture = TestBed.createComponent(composant);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

function texte(page: HTMLElement): string {
  return (page.textContent ?? '').replace(/[\s\u00a0]+/g, ' ');
}

function lien(page: HTMLElement, libelle: string): HTMLAnchorElement | undefined {
  return [...page.querySelectorAll<HTMLAnchorElement>('a')].find(
    (a) => a.textContent?.trim() === libelle,
  );
}

/**
 * L'offre et les questions fréquentes sont des engagements : le prix, ce
 * qu'il comprend, la rétractation, le risque. On vérifie qu'elles disent ce
 * que la base et les CGV établissent — et rien de plus.
 */
describe('Section L’offre', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('dit le prix, ce qu’il comprend, la rétractation et le risque', () => {
    const page = monter(Offre, VITRINE);

    expect(texte(page)).toContain('997 €');
    expect(texte(page)).toContain('TVA non applicable');
    expect(texte(page)).toContain('64 leçons vidéo, soit plus de 40 heures de vidéo');
    expect(texte(page)).toContain('Un accès sans limite de durée');
    expect(texte(page)).toContain("14 jours pour changer d'avis");
    expect(texte(page)).toContain('risque de perte en capital');
    expect(texte(page)).not.toContain('à vie');
  });

  it('mène l’acheteur à l’inscription, puis droit à l’écran d’achat', () => {
    const page = monter(Offre, VITRINE);

    expect(lien(page, 'Acheter la formation')?.getAttribute('href')).toBe(
      '/inscription?retour=%2Fespace%2Fformations',
    );
  });

  it('présente l’essai gratuit et nomme les leçons offertes', () => {
    const page = monter(Offre, VITRINE);

    expect(texte(page)).toContain('2 leçons du module « Développement personnel » sont offertes.');
    expect(texte(page)).toContain('1.1 Le processus');
    expect(lien(page, 'Commencer gratuitement')?.getAttribute('href')).toBe('/inscription');
  });

  it('sans leçon offerte, ne propose pas d’essai', () => {
    const page = monter(Offre, { ...VITRINE, lecons_offertes: [] });

    expect(texte(page)).not.toContain('Essaie avant d');
    expect(lien(page, 'Commencer gratuitement')).toBeUndefined();
  });

  it('sans vitrine, renvoie aux CGV plutôt que d’afficher un chiffre incertain', () => {
    const page = monter(Offre, null);

    expect(texte(page)).not.toContain('€');
    expect(lien(page, 'conditions générales de vente')?.getAttribute('href')).toBe('/cgv');
    expect(texte(page)).toContain('risque de perte en capital');
  });
});

describe('Section Questions fréquentes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('répond aux questions qui précèdent un achat, chiffres de la base compris', () => {
    const page = monter(Faq, VITRINE);

    expect(texte(page)).toContain(
      'Oui. Le parcours part des bases et se suit dans l’ordre : Développement personnel, Trading.',
    );
    expect(texte(page)).toContain('64 leçons vidéo, soit plus de 40 heures de vidéo, et 30 quiz');
    expect(texte(page)).toContain('997 € TTC, sans abonnement');
    expect(texte(page)).toContain('14 jours après l');
    expect(texte(page)).toContain("Non. C'est un certificat d'achèvement");
    expect(texte(page)).toContain('Personne ne peut te le promettre');
  });

  it('ne pose la question de l’essai que s’il y a des leçons offertes', () => {
    expect(texte(monter(Faq, VITRINE))).toContain('Puis-je essayer avant d');
    TestBed.resetTestingModule();
    expect(texte(monter(Faq, { ...VITRINE, lecons_offertes: [] }))).not.toContain(
      'Puis-je essayer avant d',
    );
  });

  it('se passe des chiffres quand la vitrine n’a pas pu être lue', () => {
    const page = monter(Faq, null);

    expect(texte(page)).toContain('du mental à la finance de marché');
    expect(texte(page)).not.toContain('€');
    expect(texte(page)).toContain('Le paiement se fait sur la page sécurisée de Stripe');
  });
});
