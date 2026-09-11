import { TestBed } from '@angular/core/testing';
import type { CookieConsentConfig } from 'vanilla-cookieconsent';
import { CATEGORIE_VIDEOS } from './consentement.config';
import {
  ApiConsentement,
  CHARGER_COOKIE_CONSENT,
  ConsentementService,
} from './consentement.service';

/**
 * Ce que ces tests protègent :
 *
 *   • **le refus est le repli.** Tant que le gestionnaire n'a pas répondu, ou
 *     si son chargement ou son démarrage échoue, aucun contenu tiers ne s'ouvre — même si un accord traîne
 *     quelque part. On ne dépose rien sur la foi d'un accord qu'on n'a pas lu.
 *
 *   • **l'absence de choix n'est pas un accord.** Tant que la personne ne s'est
 *     pas prononcée, la vidéo reste fermée : c'est exactement le consentement
 *     tacite que le RGPD refuse.
 *
 *   • **un changement d'avis prend effet sans rechargement.** Accepter depuis
 *     les préférences ouvre la vidéo ; retirer son accord la referme.
 *
 *   • **le site transmet ce qu'il annonce.** Deux catégories dont l'une
 *     verrouillée, un bandeau affiché d'office, un choix conservé six mois : la
 *     politique de cookies décrit cette configuration, elle doit rester vraie.
 */
describe('ConsentementService', () => {
  let configRecue: CookieConsentConfig | undefined;
  let chargementEchoue: boolean;
  let demarrageEchoue: boolean;
  let choixExprime: boolean;
  let categoriesAcceptees: string[];
  let preferencesOuvertes: number;

  const doubleBibliotheque = (): ApiConsentement => ({
    run: async (config) => {
      configRecue = config;
      if (demarrageEchoue) {
        throw new Error('démarrage impossible');
      }
    },
    validConsent: () => choixExprime,
    acceptedCategory: (nom) => categoriesAcceptees.includes(nom),
    showPreferences: () => {
      preferencesOuvertes += 1;
    },
    show: () => undefined,
  });

  /** Laisse le démarrage asynchrone du service aller à son terme. */
  const demarrage = () => new Promise((fin) => setTimeout(fin));

  const creer = (): ConsentementService => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: CHARGER_COOKIE_CONSENT,
          useValue: () =>
            chargementEchoue
              ? Promise.reject(new Error('fichier introuvable'))
              : Promise.resolve(doubleBibliotheque()),
        },
      ],
    });
    return TestBed.inject(ConsentementService);
  };

  beforeEach(() => {
    configRecue = undefined;
    chargementEchoue = false;
    demarrageEchoue = false;
    choixExprime = false;
    categoriesAcceptees = ['necessaires'];
    preferencesOuvertes = 0;
  });

  it("refuse le lecteur tant que le gestionnaire n'a pas démarré", () => {
    choixExprime = true;
    categoriesAcceptees = ['necessaires', CATEGORIE_VIDEOS];
    const service = creer();

    expect(service.pret()).toBe(false);
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it("refuse le lecteur tant qu'aucun choix n'est exprimé", async () => {
    const service = creer();
    await demarrage();

    expect(service.disponible()).toBe(true);
    expect(service.lecteurVideo()).toBe('inconnu');
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it('autorise le lecteur quand la vidéo est acceptée', async () => {
    choixExprime = true;
    categoriesAcceptees = ['necessaires', CATEGORIE_VIDEOS];
    const service = creer();
    await demarrage();

    expect(service.lecteurVideo()).toBe('accepte');
    expect(service.lecteurVideoAutorise()).toBe(true);
  });

  it('refuse le lecteur quand la personne a tout refusé', async () => {
    choixExprime = true;
    const service = creer();
    await demarrage();

    expect(service.lecteurVideo()).toBe('refuse');
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it("suit un changement d'avis sans rechargement", async () => {
    choixExprime = true;
    const service = creer();
    await demarrage();
    expect(service.lecteurVideoAutorise()).toBe(false);

    categoriesAcceptees = ['necessaires', CATEGORIE_VIDEOS];
    configRecue?.onChange?.({} as never);
    expect(service.lecteurVideoAutorise()).toBe(true);

    categoriesAcceptees = ['necessaires'];
    configRecue?.onChange?.({} as never);
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it('acte un chargement impossible sans jamais autoriser', async () => {
    chargementEchoue = true;
    choixExprime = true;
    categoriesAcceptees = ['necessaires', CATEGORIE_VIDEOS];
    const service = creer();
    await demarrage();

    expect(service.pret()).toBe(true);
    expect(service.disponible()).toBe(false);
    expect(configRecue).toBeUndefined();
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it('acte un démarrage impossible sans jamais autoriser', async () => {
    demarrageEchoue = true;
    choixExprime = true;
    categoriesAcceptees = ['necessaires', CATEGORIE_VIDEOS];
    const service = creer();
    await demarrage();

    expect(service.pret()).toBe(true);
    expect(service.disponible()).toBe(false);
    expect(service.lecteurVideoAutorise()).toBe(false);
  });

  it("n'ouvre les préférences que si le gestionnaire répond", async () => {
    demarrageEchoue = true;
    const enEchec = creer();
    await demarrage();
    enEchec.ouvrirPreferences();
    expect(preferencesOuvertes).toBe(0);

    TestBed.resetTestingModule();
    demarrageEchoue = false;
    const operationnel = creer();
    await demarrage();
    operationnel.ouvrirPreferences();
    expect(preferencesOuvertes).toBe(1);
  });

  it('transmet la configuration que la politique de cookies décrit', async () => {
    creer();
    await demarrage();

    expect(configRecue?.autoShow).toBe(true);
    expect(configRecue?.cookie?.name).toBe('tradingcorp-consentement');
    expect(configRecue?.cookie?.expiresAfterDays).toBe(182);
    expect(Object.keys(configRecue?.categories ?? {})).toEqual(['necessaires', CATEGORIE_VIDEOS]);
    expect(configRecue?.categories?.['necessaires']).toEqual({ enabled: true, readOnly: true });
  });
});
