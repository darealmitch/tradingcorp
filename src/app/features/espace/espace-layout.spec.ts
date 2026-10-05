import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NavigationEnd, Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/auth/profil.model';
import { ModerationService } from '../../core/moderation/moderation.service';
import { NotificationsService } from '../../core/notifications/notifications.service';
import { EspaceLayout } from './espace-layout';

/** Membres `protected` : l'API du gabarit, donc le contrat observable. */
interface Interne {
  tiroirOuvert: () => boolean;
  replie: () => boolean;
  basculerTiroir(): void;
  fermerTiroir(): void;
  basculer(): void;
}

describe('EspaceLayout — tiroir mobile', () => {
  let fixture: ComponentFixture<EspaceLayout>;
  let interne: Interne;
  let evenements: Subject<NavigationEnd>;

  beforeEach(async () => {
    evenements = new Subject<NavigationEnd>();

    await TestBed.configureTestingModule({
      imports: [EspaceLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            role: signal('admin'),
            profil: signal(null),
            estFormateurOuAdmin: signal(true),
          },
        },
        { provide: NotificationsService, useValue: { nonLues: signal(0) } },
        {
          provide: ModerationService,
          useValue: { aTraiter: signal(0), rafraichirCompteurs: () => Promise.resolve() },
        },
      ],
    }).compileComponents();

    // Le composant s'abonne aux navigations : on pilote le flux nous-mêmes.
    const router = TestBed.inject(Router);
    Object.defineProperty(router, 'events', { value: evenements, configurable: true });

    fixture = TestBed.createComponent(EspaceLayout);
    interne = fixture.componentInstance as unknown as Interne;
    fixture.detectChanges();
  });

  function bouton(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.tiroir-bouton');
  }

  function voile(): HTMLElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('.tiroir-voile');
  }

  it('démarre fermé', () => {
    expect(interne.tiroirOuvert()).toBe(false);
    expect(voile()).toBeNull();
  });

  it('s’ouvre et se referme par le bouton', () => {
    interne.basculerTiroir();
    expect(interne.tiroirOuvert()).toBe(true);

    interne.basculerTiroir();
    expect(interne.tiroirOuvert()).toBe(false);
  });

  it('affiche le voile seulement lorsqu’il est ouvert', () => {
    expect(voile()).toBeNull();

    interne.basculerTiroir();
    fixture.detectChanges();
    expect(voile()).not.toBeNull();
  });

  it('se referme au clic sur le voile', () => {
    interne.basculerTiroir();
    fixture.detectChanges();

    voile()?.click();
    fixture.detectChanges();

    expect(interne.tiroirOuvert()).toBe(false);
  });

  it('se referme après une navigation', () => {
    interne.basculerTiroir();
    expect(interne.tiroirOuvert()).toBe(true);

    // Sans cela, le tiroir masquerait la page qu'on vient de demander.
    evenements.next(new NavigationEnd(1, '/espace/contenus', '/espace/contenus'));

    expect(interne.tiroirOuvert()).toBe(false);
  });

  it('se referme avec la touche Échap', () => {
    interne.basculerTiroir();
    expect(interne.tiroirOuvert()).toBe(true);

    // Écoutée sur le document : fonctionne où que soit le focus.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(interne.tiroirOuvert()).toBe(false);
  });

  it('porte les attributs d’accessibilité attendus', () => {
    const b = bouton();
    expect(b?.getAttribute('aria-controls')).toBe('lateral-espace');
    expect(b?.getAttribute('aria-expanded')).toBe('false');
    expect(b?.getAttribute('aria-label')).toBe('Ouvrir le menu');

    interne.basculerTiroir();
    fixture.detectChanges();

    expect(bouton()?.getAttribute('aria-expanded')).toBe('true');
    expect(bouton()?.getAttribute('aria-label')).toBe('Fermer le menu');
  });

  it('laisse intact le repli sur grand écran', () => {
    // Les deux réglages sont indépendants : ouvrir le tiroir sur mobile ne doit
    // pas déplier la latérale réduite volontairement sur grand écran.
    expect(interne.replie()).toBe(false);
    interne.basculer();
    expect(interne.replie()).toBe(true);

    interne.basculerTiroir();
    expect(interne.replie()).toBe(true);
  });
});

describe('EspaceLayout — ce qui attend l’équipe', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function monter(role: Role, aTraiter: number) {
    const rafraichirCompteurs = vi.fn(() => Promise.resolve());
    await TestBed.configureTestingModule({
      imports: [EspaceLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            role: signal(role),
            profil: signal(null),
            estFormateurOuAdmin: signal(role !== 'apprenant'),
          },
        },
        { provide: NotificationsService, useValue: { nonLues: signal(0) } },
        {
          provide: ModerationService,
          useValue: { aTraiter: signal(aTraiter), rafraichirCompteurs },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(EspaceLayout);
    fixture.detectChanges();
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    const lienModeration = [...page.querySelectorAll('.lateral-lien')].find((l) =>
      l.textContent?.includes('Modération'),
    );
    return { lienModeration, rafraichirCompteurs };
  }

  it.each<Role>(['formateur', 'admin'])(
    'compte sur « Modération » ce qui attend l’équipe (%s)',
    async (role) => {
      const { lienModeration, rafraichirCompteurs } = await monter(role, 3);

      expect(rafraichirCompteurs).toHaveBeenCalled();
      expect(lienModeration?.querySelector('.pastille')?.textContent?.trim()).toBe('3');
    },
  );

  it('n’affiche pas de pastille quand rien n’attend', async () => {
    const { lienModeration } = await monter('admin', 0);

    expect(lienModeration?.querySelector('.pastille')).toBeNull();
  });

  it('ne compte rien pour un élève : aucune requête de modération', async () => {
    const { lienModeration, rafraichirCompteurs } = await monter('apprenant', 0);

    expect(lienModeration).toBeUndefined();
    expect(rafraichirCompteurs).not.toHaveBeenCalled();
  });
});
