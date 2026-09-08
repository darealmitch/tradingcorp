import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ConsentementService } from './consentement.service';

/**
 * Ce que ces tests protègent :
 *
 *   • **le refus est le repli.** Tant que Didomi n'a pas répondu — pas
 *     configuré, bloqué par une extension, réseau coupé — aucun contenu tiers
 *     ne doit s'ouvrir. Un service qui autoriserait « en attendant » déposerait
 *     des cookies chez quelqu'un qui n'a jamais rien accepté, ce qu'interdit
 *     l'article 82 de la loi Informatique et Libertés.
 *
 *   • **l'absence de réponse n'est pas un accord.** Didomi rend `undefined`
 *     pour un fournisseur sur lequel la personne ne s'est pas prononcée. Le
 *     traiter comme un oui serait exactement le consentement tacite que le
 *     RGPD refuse.
 *
 *   • **rien n'est chargé sans configuration.** Sans clé, aucun script tiers ne
 *     doit être injecté : le site d'une personne qui n'a pas encore ouvert de
 *     compte Didomi ne doit contacter personne.
 *
 *   • **un changement d'avis est pris en compte sans rechargement.** Quelqu'un
 *     qui accepte depuis la fenêtre de préférences doit voir la vidéo s'ouvrir,
 *     et celui qui retire son accord doit la voir se refermer.
 */
describe('ConsentementService', () => {
  const configInitiale = { ...environment.didomi };
  const VENDEUR = 'c:bunnynet-TESTTEST';

  /** Rappels enregistrés par le SDK simulé, déclenchés à la demande. */
  let surChangement: (() => void)[];

  const scriptsDidomi = () =>
    [...document.head.querySelectorAll('script')].filter((s) =>
      s.src.includes('privacy-center.org'),
    );

  /**
   * Simule l'arrivée du SDK avec l'état qu'il rendrait pour notre fournisseur.
   * `undefined` reproduit un fournisseur absent de la notice.
   */
  const didomiRepond = (etat: boolean | undefined): void => {
    surChangement = [];
    window.Didomi = {
      getCurrentUserStatus: () => ({
        vendors: etat === undefined ? {} : { [VENDEUR]: { enabled: etat } },
      }),
      preferences: { show: () => undefined },
      notice: { show: () => undefined },
      on: (_evenement, rappel) => surChangement.push(rappel),
    };
    window.didomiOnReady?.forEach((rappel) => rappel(window.Didomi!));
  };

  beforeEach(() => {
    scriptsDidomi().forEach((s) => s.remove());
    window.didomiOnReady = [];
    window.Didomi = undefined;
    surChangement = [];
    Object.assign(environment.didomi, configInitiale);
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    Object.assign(environment.didomi, configInitiale);
    window.Didomi = undefined;
    scriptsDidomi().forEach((s) => s.remove());
  });

  describe('sans configuration', () => {
    it("n'injecte aucun script tiers", () => {
      Object.assign(environment.didomi, { cleApi: '', idNotice: '', vendeurLecteurVideo: '' });
      TestBed.inject(ConsentementService);

      expect(scriptsDidomi()).toHaveLength(0);
    });

    it('se déclare prêt mais indisponible, et refuse le lecteur', () => {
      Object.assign(environment.didomi, { cleApi: '', idNotice: '', vendeurLecteurVideo: '' });
      const service = TestBed.inject(ConsentementService);

      expect(service.pret()).toBe(true);
      expect(service.disponible()).toBe(false);
      expect(service.lecteurVideo()).toBe('inconnu');
      expect(service.lecteurVideoAutorise()).toBe(false);
    });
  });

  describe('avec configuration', () => {
    beforeEach(() => {
      Object.assign(environment.didomi, {
        cleApi: 'cle-de-test',
        idNotice: 'notice-de-test',
        vendeurLecteurVideo: VENDEUR,
      });
    });

    it('charge le SDK depuis la clé et la notice configurées', () => {
      TestBed.inject(ConsentementService);

      const scripts = scriptsDidomi();
      expect(scripts).toHaveLength(1);
      expect(scripts[0].src).toContain('sdk.privacy-center.org/cle-de-test/loader.js');
      expect(scripts[0].src).toContain('target=notice-de-test');
    });

    it("refuse le lecteur tant que le SDK n'a pas répondu", () => {
      const service = TestBed.inject(ConsentementService);

      expect(service.pret()).toBe(false);
      expect(service.lecteurVideoAutorise()).toBe(false);
    });

    it("autorise le lecteur quand l'accord est donné", () => {
      const service = TestBed.inject(ConsentementService);
      didomiRepond(true);

      expect(service.disponible()).toBe(true);
      expect(service.lecteurVideo()).toBe('accepte');
      expect(service.lecteurVideoAutorise()).toBe(true);
    });

    it('refuse le lecteur quand la personne a dit non', () => {
      const service = TestBed.inject(ConsentementService);
      didomiRepond(false);

      expect(service.lecteurVideo()).toBe('refuse');
      expect(service.lecteurVideoAutorise()).toBe(false);
    });

    it("traite l'absence de réponse comme un refus", () => {
      const service = TestBed.inject(ConsentementService);
      didomiRepond(undefined);

      expect(service.lecteurVideo()).toBe('inconnu');
      expect(service.lecteurVideoAutorise()).toBe(false);
    });

    it("suit un changement d'avis sans rechargement", () => {
      const service = TestBed.inject(ConsentementService);
      didomiRepond(false);
      expect(service.lecteurVideoAutorise()).toBe(false);

      // La personne revient sur son choix depuis la fenêtre de préférences.
      window.Didomi!.getCurrentUserStatus = () => ({ vendors: { [VENDEUR]: { enabled: true } } });
      surChangement.forEach((rappel) => rappel());

      expect(service.lecteurVideoAutorise()).toBe(true);
    });

    it('refuse le lecteur si le fournisseur n’est pas déclaré', () => {
      environment.didomi.vendeurLecteurVideo = '';
      const service = TestBed.inject(ConsentementService);
      didomiRepond(true);

      expect(service.lecteurVideo()).toBe('inconnu');
      expect(service.lecteurVideoAutorise()).toBe(false);
    });

    it('acte un SDK injoignable sans jamais autoriser', () => {
      const service = TestBed.inject(ConsentementService);
      scriptsDidomi()[0].dispatchEvent(new Event('error'));

      expect(service.pret()).toBe(true);
      expect(service.disponible()).toBe(false);
      expect(service.lecteurVideoAutorise()).toBe(false);
    });
  });
});
