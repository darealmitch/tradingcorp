import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { Role } from '../auth/profil.model';
import { AccesDonnees } from '../supabase/acces-donnees';
import { PresenceService, SIGNAL_PRESENCE_S } from './presence.service';

/**
 * Le signal de présence tourne en arrière-plan, sans rien afficher : s'il se
 * tait à tort, l'élève disparaît de l'écran des connectés ; s'il s'emballe, il
 * écrit en base à chaque changement d'onglet. Ni l'un ni l'autre ne se verrait
 * à l'usage — d'où ces tests, sur une horloge simulée.
 */

const MINUTE = SIGNAL_PRESENCE_S * 1000;

let visibilite: DocumentVisibilityState;
let role: WritableSignal<Role | null>;
let signaux: number;

function changerVisibilite(etat: DocumentVisibilityState): void {
  visibilite = etat;
  document.dispatchEvent(new Event('visibilitychange'));
}

function demarrer(): void {
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthService, useValue: { role } },
      {
        provide: AccesDonnees,
        useValue: {
          appel: (nom: string) => nom,
          ecrire: () => {
            signaux++;
            return Promise.resolve(null);
          },
        },
      },
    ],
  });
  TestBed.inject(PresenceService).demarrer();
  TestBed.tick();
}

describe('PresenceService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    visibilite = 'visible';
    role = signal<Role | null>(null);
    signaux = 0;
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

  it('ne signale rien sans élève connecté, ni pour le personnel', () => {
    demarrer();
    vi.advanceTimersByTime(5 * MINUTE);
    expect(signaux).toBe(0);

    role.set('admin');
    TestBed.tick();
    vi.advanceTimersByTime(5 * MINUTE);
    expect(signaux).toBe(0);
  });

  it('signale dès la connexion d’un élève, puis chaque minute', () => {
    demarrer();
    role.set('apprenant');
    TestBed.tick();
    expect(signaux).toBe(1);

    vi.advanceTimersByTime(MINUTE);
    expect(signaux).toBe(2);
    vi.advanceTimersByTime(MINUTE);
    expect(signaux).toBe(3);
  });

  it('se tait onglet masqué, et reprend dès le retour de l’élève', () => {
    role.set('apprenant');
    demarrer();
    expect(signaux).toBe(1);

    changerVisibilite('hidden');
    vi.advanceTimersByTime(3 * MINUTE);
    expect(signaux).toBe(1);

    changerVisibilite('visible');
    expect(signaux).toBe(2);
  });

  it('ne double pas le signal sur un aller-retour rapide entre onglets', () => {
    role.set('apprenant');
    demarrer();

    vi.advanceTimersByTime(5_000);
    changerVisibilite('hidden');
    vi.advanceTimersByTime(5_000);
    changerVisibilite('visible');
    expect(signaux).toBe(1);

    vi.advanceTimersByTime(MINUTE - 10_000);
    expect(signaux).toBe(2);
  });

  it('s’arrête à la déconnexion', () => {
    role.set('apprenant');
    demarrer();
    expect(signaux).toBe(1);

    role.set(null);
    TestBed.tick();
    vi.advanceTimersByTime(5 * MINUTE);
    changerVisibilite('visible');
    expect(signaux).toBe(1);
  });
});
