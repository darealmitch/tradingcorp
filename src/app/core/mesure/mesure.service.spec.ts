import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import { AccesDonnees } from '../supabase/acces-donnees';
import { CLE_OPPOSITION_MESURE } from './mesure.model';
import { HOTE_SITE, MesureService } from './mesure.service';

@Component({ template: '' })
class PageVide {}

/**
 * La mesure n'a qu'un droit : ajouter 1 à un compteur connu. Ce qui est
 * éprouvé ici, c'est tout ce qui la ferait compter à tort — une ancre prise
 * pour une page, un double clic, un visiteur qui s'y est opposé, une
 * préversion qui écrirait dans les chiffres de la production.
 */
describe('MesureService', () => {
  let envois: { p_site: string; p_evenement: string; p_cible: string }[];
  let navigator: Navigator & { globalPrivacyControl?: boolean };

  function monter(hote = 'tradingcorp.fr', reponse: Promise<unknown> = Promise.resolve()) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: PageVide },
          { path: 'programme', component: PageVide },
          { path: 'cgv', component: PageVide },
        ]),
        { provide: HOTE_SITE, useValue: hote },
        {
          provide: AccesDonnees,
          useValue: {
            appel: (_nom: string, params: (typeof envois)[number]) => {
              envois.push(params);
              return reponse;
            },
            mesurer: (requete: Promise<unknown>) => requete.then(() => undefined),
          },
        },
      ],
    });
    return { mesure: TestBed.inject(MesureService), router: TestBed.inject(Router) };
  }

  beforeEach(() => {
    envois = [];
    navigator = globalThis.navigator as typeof navigator;
    localStorage.removeItem(CLE_OPPOSITION_MESURE);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem(CLE_OPPOSITION_MESURE);
    TestBed.resetTestingModule();
  });

  it('compte la vue d’une page de vente, une fois par page', async () => {
    const { mesure, router } = monter();
    mesure.demarrer();

    await router.navigateByUrl('/');
    // Une ancre de l'accueil n'est pas une nouvelle page.
    await router.navigateByUrl('/#offre');
    await router.navigateByUrl('/programme');
    await router.navigateByUrl('/');

    expect(envois).toEqual([
      { p_site: 'prod', p_evenement: 'vue', p_cible: '/' },
      { p_site: 'prod', p_evenement: 'vue', p_cible: '/programme' },
      { p_site: 'prod', p_evenement: 'vue', p_cible: '/' },
    ]);
  });

  it('ne compte pas les pages qui ne sont pas des pages de vente', async () => {
    const { mesure, router } = monter();
    mesure.demarrer();

    await router.navigateByUrl('/cgv');

    expect(envois).toEqual([]);
  });

  it('compte la page déjà affichée quand il démarre après la première navigation', async () => {
    const { mesure, router } = monter();
    await router.navigateByUrl('/programme');

    mesure.demarrer();

    expect(envois).toEqual([{ p_site: 'prod', p_evenement: 'vue', p_cible: '/programme' }]);
  });

  it('compte la recette à part, et rien ailleurs', async () => {
    const dev = monter('dev.tradingcorp.fr');
    dev.mesure.clic('hero');
    expect(envois).toEqual([{ p_site: 'dev', p_evenement: 'clic', p_cible: 'hero' }]);

    TestBed.resetTestingModule();
    envois = [];
    const local = monter('localhost');
    local.mesure.clic('hero');
    await Promise.resolve();
    expect(envois).toEqual([]);
  });

  it('ne compte qu’une fois un double clic', () => {
    const { mesure } = monter();

    mesure.clic('barre');
    mesure.clic('barre');
    mesure.clic('hero');

    expect(envois.map((e) => e.p_cible)).toEqual(['barre', 'hero']);
  });

  it('se tait pour un visiteur qui s’y est opposé, et le retient', () => {
    const { mesure } = monter();

    mesure.sOpposer();
    mesure.clic('hero');

    expect(envois).toEqual([]);
    expect(mesure.opposition()).toBe(true);
    expect(localStorage.getItem(CLE_OPPOSITION_MESURE)).toBe('refus');

    mesure.accepter();
    mesure.clic('hero');

    expect(envois).toHaveLength(1);
    expect(localStorage.getItem(CLE_OPPOSITION_MESURE)).toBeNull();
  });

  it('relit l’opposition retenue lors d’une visite précédente', () => {
    localStorage.setItem(CLE_OPPOSITION_MESURE, 'refus');
    const { mesure } = monter();

    mesure.clic('hero');

    expect(mesure.opposition()).toBe(true);
    expect(envois).toEqual([]);
  });

  it('respecte le refus de suivi exprimé par le navigateur', () => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { value: true, configurable: true });
    try {
      const { mesure } = monter();

      mesure.clic('hero');

      expect(envois).toEqual([]);
    } finally {
      delete navigator.globalPrivacyControl;
    }
  });

  it('ne retient pas le départ vers Stripe plus d’une fraction de seconde', async () => {
    vi.useFakeTimers();
    try {
      // Un serveur qui ne répond jamais.
      const { mesure } = monter('tradingcorp.fr', new Promise(() => undefined));
      let parti = false;

      void mesure.debutPaiement().then(() => (parti = true));
      await vi.advanceTimersByTimeAsync(599);
      expect(parti).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(parti).toBe(true);
      expect(envois).toEqual([
        { p_site: 'prod', p_evenement: 'debut_paiement', p_cible: 'ma-formation' },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
