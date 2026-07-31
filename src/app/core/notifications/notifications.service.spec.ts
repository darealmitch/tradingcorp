import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from '../supabase/acces-donnees';
import { NotificationsService } from './notifications.service';

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

/** Double d'`AccesDonnees` : c'est lui qui décide du sort de l'écriture. */
function accesDouble(erreurEcriture: string | null = null) {
  return {
    table: () => ({
      select: () => ({ order: () => Promise.resolve({ data: LIGNES, error: null }) }),
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
    ],
  });
  const service = TestBed.inject(NotificationsService);
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
