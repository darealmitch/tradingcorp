import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { AccesDonnees } from '../supabase/acces-donnees';
import { ECART_RAFRAICHISSEMENT_MS, NotificationsService } from './notifications.service';

/**
 * La mise à jour optimiste est un bon réflexe — le clic répond tout de suite —
 * mais elle ment dès que l'écriture échoue : la pastille disparaît de l'écran
 * et reste non lue en base, jusqu'au rechargement suivant qui la fait
 * réapparaître sans explication.
 *
 * Ces tests portent sur le retour arrière, c'est-à-dire sur le seul moment où
 * l'affichage optimiste doit se dédire.
 */

const LIGNES = [
  {
    id_notification: 'n-1',
    titre: 'Achat',
    message: null,
    date_envoi: '2026-07-01T10:00:00Z',
    lu_le: null,
    priorite: 'urgente' as const,
  },
  {
    id_notification: 'n-2',
    titre: 'Compte créé',
    message: null,
    date_envoi: '2026-07-02T10:00:00Z',
    lu_le: null,
    priorite: 'information' as const,
  },
];

/** Ce que le service lit de la session : l'identifiant du compte. */
type SessionDouble = { user: { id: string } } | null;

function session(id: string): SessionDouble {
  return { user: { id } };
}

/** Double d'`AccesDonnees` : c'est lui qui décide du sort de l'écriture. */
function accesDouble(erreurEcriture: string | null = null) {
  return {
    table: () => ({
      // `order()` rend un builder et non une promesse : la lecture chaîne
      // désormais `.limit()` derrière lui pour borner l'historique rapatrié.
      select: () => ({
        order: () => ({ limit: () => Promise.resolve({ data: LIGNES, error: null }) }),
      }),
      update: () => ({
        eq: () => ({ is: () => Promise.resolve({ data: null, error: null }) }),
        is: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    lire: () => Promise.resolve(LIGNES),
    ecrire: () => Promise.resolve(erreurEcriture),
  };
}

async function creerService(erreurEcriture: string | null = null) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      NotificationsService,
      { provide: AccesDonnees, useValue: accesDouble(erreurEcriture) },
      { provide: AuthService, useValue: { session: signal(session('lea')) } },
    ],
  });
  const service = TestBed.inject(NotificationsService);
  TestBed.tick();
  await service.recharger();
  return service;
}

describe('NotificationsService', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('charge les notifications et déduit leur état de lecture', async () => {
    const service = await creerService();
    expect(service.liste().length).toBe(2);
    expect(service.nonLues()).toBe(2);
    expect(service.urgentesNonLues()).toBe(1);
  });

  describe('marquerLue', () => {
    it('marque la notification lue quand l’écriture aboutit', async () => {
      const service = await creerService();

      expect(await service.marquerLue('n-1')).toBeNull();
      expect(service.nonLues()).toBe(1);
    });

    it('revient à l’état non lu quand l’écriture échoue', async () => {
      const service = await creerService('La notification n’a pas pu être marquée comme lue.');

      const erreur = await service.marquerLue('n-1');

      // Sans ce retour arrière, l'écran affichait « lue » et la base disait le
      // contraire — divergence invisible jusqu'au prochain chargement.
      expect(erreur).toBe('La notification n’a pas pu être marquée comme lue.');
      expect(service.nonLues()).toBe(2);
      expect(service.liste().find((n) => n.id_notification === 'n-1')?.lue).toBe(false);
    });
  });

  describe('toutMarquerLues', () => {
    it('marque tout lu quand l’écriture aboutit', async () => {
      const service = await creerService();

      expect(await service.toutMarquerLues()).toBeNull();
      expect(service.nonLues()).toBe(0);
    });

    it('restitue l’état complet quand l’écriture échoue', async () => {
      const service = await creerService('Les notifications n’ont pas pu être marquées.');

      await service.toutMarquerLues();

      expect(service.nonLues()).toBe(2);
    });
  });
});

/**
 * La déconnexion ne recharge pas la page : la liste vit au-delà du compte qui
 * l'a lue. Le compte suivant du même onglet — deux élèves sur un ordinateur
 * partagé — ne doit jamais voir les notifications du précédent. Le serveur
 * répond ici quand le test le décide, et dans l'ordre qu'il choisit.
 */
describe('NotificationsService — suit le compte connecté', () => {
  let compte: WritableSignal<SessionDouble>;
  let lectures: ((lignes: unknown) => void)[];
  let ecritures: ((erreur: string | null) => void)[];
  let visibilite: DocumentVisibilityState;

  function monter(): NotificationsService {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { session: compte } },
        {
          provide: AccesDonnees,
          useValue: {
            table: () => ({
              select: () => ({ order: () => ({ limit: () => null }) }),
              update: () => ({ eq: () => ({ is: () => null }), is: () => null }),
            }),
            lire: () => new Promise((resoudre) => lectures.push(resoudre)),
            ecrire: () => new Promise((resoudre) => ecritures.push(resoudre)),
          },
        },
      ],
    });
    const service = TestBed.inject(NotificationsService);
    TestBed.tick();
    return service;
  }

  /** Le serveur répond à la lecture n° `rang` (0 : la première envoyée). */
  async function repondre(rang: number, lignes: unknown): Promise<void> {
    lectures[rang](lignes);
    for (let i = 0; i < 3; i++) {
      await Promise.resolve();
    }
  }

  function revenirSurLOnglet(): void {
    visibilite = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    compte = signal(session('lea'));
    lectures = [];
    ecritures = [];
    visibilite = 'visible';
    // jsdom annonce un document « prerender » : on reprend la main dessus.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibilite,
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('vide la liste à la déconnexion, sans rien relire', async () => {
    const service = monter();
    await repondre(0, LIGNES);
    expect(service.liste()).toHaveLength(2);

    compte.set(null);
    TestBed.tick();

    expect(service.liste()).toEqual([]);
    expect(lectures).toHaveLength(1);
  });

  it('ne montre jamais au compte suivant les notifications du précédent', async () => {
    const service = monter();
    await repondre(0, LIGNES);

    compte.set(session('tom'));
    TestBed.tick();
    // Vidée dès le changement, sans attendre la réponse du serveur.
    expect(service.liste()).toEqual([]);

    await repondre(1, [LIGNES[1]]);
    expect(service.liste().map((n) => n.id_notification)).toEqual(['n-2']);
  });

  it('écarte une réponse arrivée après un changement de compte', async () => {
    const service = monter();
    compte.set(session('tom'));
    TestBed.tick();

    await repondre(1, [LIGNES[1]]);
    // La lecture lancée pour Léa répond en dernier : elle ne s'affiche pas.
    await repondre(0, LIGNES);

    expect(service.liste().map((n) => n.id_notification)).toEqual(['n-2']);
  });

  it('ne relit rien quand seul le jeton de session est renouvelé', async () => {
    const service = monter();
    await repondre(0, LIGNES);

    compte.set(session('lea'));
    TestBed.tick();

    expect(lectures).toHaveLength(1);
    expect(service.liste()).toHaveLength(2);
  });

  it('se rafraîchit au retour sur l’onglet, une seule fois par retour', async () => {
    monter();
    await repondre(0, LIGNES);

    visibilite = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(lectures).toHaveLength(1);

    revenirSurLOnglet();
    // Le même retour, vu par la fenêtre : pas de seconde lecture.
    window.dispatchEvent(new Event('focus'));
    expect(lectures).toHaveLength(2);

    vi.advanceTimersByTime(ECART_RAFRAICHISSEMENT_MS);
    window.dispatchEvent(new Event('focus'));
    expect(lectures).toHaveLength(3);
  });

  it('ne lit rien au retour sur l’onglet sans compte connecté', () => {
    compte.set(null);
    monter();

    revenirSurLOnglet();

    expect(lectures).toHaveLength(0);
  });

  it('garde la liste affichée quand un rafraîchissement échoue', async () => {
    const service = monter();
    await repondre(0, LIGNES);

    revenirSurLOnglet();
    // `lire` rend la valeur de repli, null, quand la lecture échoue.
    await repondre(1, null);

    expect(service.liste()).toHaveLength(2);
  });

  it('ne rend pas au compte suivant la liste du précédent après une écriture en échec', async () => {
    const service = monter();
    await repondre(0, LIGNES);

    const marquage = service.marquerLue('n-1');
    compte.set(session('tom'));
    TestBed.tick();
    ecritures[0]('La notification n’a pas pu être marquée comme lue.');
    await marquage;

    expect(service.liste()).toEqual([]);
  });
});
