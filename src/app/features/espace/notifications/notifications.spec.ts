import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import {
  Notification,
  NotificationsService,
} from '../../../core/notifications/notifications.service';
import { Notifications } from './notifications';

/**
 * C'est par la notification « Réponse privée de l'équipe » que l'élève
 * retrouve l'échange qu'on lui adresse : un clic doit l'y mener. Mais le lien
 * vient de la base — il ne doit jamais pouvoir conduire hors du site.
 */

function notification(champs: Partial<Notification>): Notification {
  return {
    id_notification: 'n-1',
    titre: 'Réponse privée de l’équipe',
    message: 'L’équipe TradingCorp t’a répondu en privé.',
    date_envoi: '2026-10-05T10:00:00Z',
    lue: false,
    priorite: 'information',
    lien: null,
    ...champs,
  };
}

async function monter(liste: Notification[]) {
  const marquerLue = vi.fn(() => Promise.resolve(null));
  const lignes = signal(liste);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: NotificationsService,
        useValue: {
          liste: lignes,
          nonLues: computed(() => lignes().filter((n) => !n.lue).length),
          urgentes: computed(() => lignes().filter((n) => n.priorite === 'urgente')),
          urgentesNonLues: computed(() => 0),
          suivi: computed(() => lignes().filter((n) => n.priorite !== 'urgente')),
          marquerLue,
          toutMarquerLues: () => Promise.resolve(null),
        },
      },
    ],
  });
  const router = TestBed.inject(Router);
  const naviguer = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(Notifications);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  return { page, marquerLue, naviguer };
}

describe('Notifications', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ouvre l’échange visé et marque la notification comme lue', async () => {
    const lien = '/parcours/s-1/lecon/l-1#echanges';
    const { page, marquerLue, naviguer } = await monter([notification({ lien })]);

    page.querySelector<HTMLButtonElement>('.notification')!.click();
    await Promise.resolve();

    expect(marquerLue).toHaveBeenCalledWith('n-1');
    expect(naviguer).toHaveBeenCalledWith(lien);
  });

  it('se contente de marquer comme lue une notification sans page', async () => {
    const { page, marquerLue, naviguer } = await monter([notification({})]);

    page.querySelector<HTMLButtonElement>('.notification')!.click();
    await Promise.resolve();

    expect(marquerLue).toHaveBeenCalledWith('n-1');
    expect(naviguer).not.toHaveBeenCalled();
  });

  it.each(['https://exemple.com/piege', '//exemple.com/piege'])(
    'ne suit jamais un lien qui sortirait du site (%s)',
    async (lien) => {
      const { page, naviguer } = await monter([notification({ lien })]);

      page.querySelector<HTMLButtonElement>('.notification')!.click();
      await Promise.resolve();

      expect(naviguer).not.toHaveBeenCalled();
    },
  );

  it('signale d’une flèche les notifications qui mènent quelque part', async () => {
    const { page } = await monter([
      notification({ id_notification: 'n-1', lien: '/espace/apprenants' }),
      notification({ id_notification: 'n-2' }),
    ]);

    expect(page.querySelectorAll('.notification-lien')).toHaveLength(1);
  });
});
