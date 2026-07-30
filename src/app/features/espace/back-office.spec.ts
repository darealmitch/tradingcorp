import { EnvironmentProviders, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { AuditService } from '../../core/audit/audit.service';
import { ComptesService } from '../../core/comptes/comptes.service';
import { CommerceService } from '../../core/commerce/commerce.service';
import { ContenuService } from '../../core/contenu/contenu.service';
import { FinanceService } from '../../core/finance/finance.service';
import { ModerationService } from '../../core/moderation/moderation.service';
import { PilotageService } from '../../core/pilotage/pilotage.service';
import { Accueil } from './accueil/accueil';
import { Journal } from './journal/journal';
import { Paiements } from './paiements/paiements';
import { Utilisateurs } from './utilisateurs/utilisateurs';

/**
 * Non-régression du back-office après le découpage d'`AdminService` en
 * `ComptesService`, `FinanceService`, `AuditService` et `PilotageService`.
 *
 * `strictTemplates` n'étant pas activé sur le projet, une compilation verte ne
 * prouve pas qu'un gabarit n'appelle plus une méthode disparue : l'erreur
 * n'apparaîtrait qu'à l'exécution, sur l'écran concerné. Ces tests montent donc
 * chaque écran pour de bon, et vérifient qu'il interroge les nouveaux services
 * et rend ses données.
 */

const PROFILS = [
  {
    id_profil: 'p-1',
    prenom: 'Ada',
    nom: 'Lovelace',
    email: 'ada@exemple.fr',
    role: 'apprenant' as const,
    date_creation: '2026-01-02T00:00:00Z',
    doit_changer_mdp: false,
    est_test: false,
    est_proprietaire: false,
  },
];

const PAIEMENTS = [
  {
    id_paiement: 'pay-1',
    montant_centimes: 49900,
    devise: 'eur',
    statut: 'reussi' as const,
    moyen_paiement: 'card',
    reference_transaction: 'cs_1',
    email: 'ada@exemple.fr',
    date_paiement: '2026-07-01T10:00:00Z',
    mode_test: false,
    profils: { role: 'apprenant' as const, est_test: false },
  },
];

/** Appels réellement passés aux services, par écran monté. */
let appels: string[];

/**
 * Laisse les chargements se résoudre puis rend le résultat. Plusieurs tours
 * sont nécessaires : un écran qui enchaîne un `Promise.all` de deux lectures
 * n'a pas fini au premier passage de la boucle de microtâches.
 */
async function stabiliser(fixture: { detectChanges(): void; whenStable(): Promise<unknown> }) {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await Promise.resolve();
  }
  fixture.detectChanges();
}

function tracer<T extends object>(nom: string, methodes: T): T {
  return Object.fromEntries(
    Object.entries(methodes).map(([cle, valeur]) => [
      cle,
      (...args: unknown[]) => {
        appels.push(`${nom}.${cle}`);
        return (valeur as (...a: unknown[]) => unknown)(...args);
      },
    ]),
  ) as T;
}

function socle(): (Provider | EnvironmentProviders)[] {
  return [
    provideRouter([]),
    {
      provide: ActivatedRoute,
      useValue: {
        paramMap: of(convertToParamMap({})),
        snapshot: { queryParamMap: convertToParamMap({}) },
      },
    },
    {
      provide: ComptesService,
      useValue: tracer('comptes', { lister: () => Promise.resolve(PROFILS) }),
    },
    {
      provide: FinanceService,
      useValue: tracer('finance', { listerPaiements: () => Promise.resolve(PAIEMENTS) }),
    },
    {
      provide: AuditService,
      useValue: tracer('audit', {
        listerJournal: () =>
          Promise.resolve([
            {
              id_journal: 'j-1',
              action: 'changement_role',
              cible: 'ada@exemple.fr',
              date_action: '2026-07-01T10:00:00Z',
              auteur: 'admin@exemple.fr',
              profils: { prenom: 'Mitch', nom: 'C' },
            },
          ]),
      }),
    },
    {
      provide: PilotageService,
      useValue: tracer('pilotage', {
        compterApprenants: () => Promise.resolve(12),
        compterLecons: () => Promise.resolve(64),
        compterCertificats: () => Promise.resolve(3),
        inscriptionsRecentes: () => Promise.resolve([]),
        suivreApprenants: () => Promise.resolve([]),
      }),
    },
    {
      provide: ContenuService,
      useValue: {
        maProgression: () => Promise.resolve({ terminees: 0, total: 0 }),
        prochainesLecons: () => Promise.resolve([]),
        chargerStructure: () => Promise.resolve([]),
      },
    },
    {
      provide: CommerceService,
      useValue: {
        chargerInscriptions: () => Promise.resolve([]),
        chargerFormations: () => Promise.resolve([]),
      },
    },
    {
      provide: ModerationService,
      useValue: {
        compterCommentairesEnAttente: () => Promise.resolve(0),
        noteMoyenne: () => Promise.resolve(null),
        commentairesEnAttente: () => Promise.resolve([]),
      },
    },
  ];
}

describe('Back-office — non-régression après le découpage d’AdminService', () => {
  beforeEach(() => {
    appels = [];
  });

  afterEach(() => TestBed.resetTestingModule());

  describe('Utilisateurs', () => {
    it('se monte, charge les comptes et rend la ligne', async () => {
      TestBed.configureTestingModule({
        providers: [...socle(), { provide: AuthService, useValue: { profil: signal(null) } }],
      });
      const fixture = TestBed.createComponent(Utilisateurs);
      await stabiliser(fixture);

      expect(appels).toContain('comptes.lister');
      const texte = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(texte).toContain('Ada');
      expect(texte).toContain('ada@exemple.fr');
    });
  });

  describe('Paiements', () => {
    it('se monte, charge les paiements et calcule le chiffre d’affaires', async () => {
      TestBed.configureTestingModule({ providers: socle() });
      const fixture = TestBed.createComponent(Paiements);
      await stabiliser(fixture);

      expect(appels).toContain('finance.listerPaiements');
      // 49 900 centimes = 499 € : la règle `compteDansCa` s'applique toujours.
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('499');
    });
  });

  describe('Journal', () => {
    it('se monte, charge la piste d’audit et rend l’entrée', async () => {
      TestBed.configureTestingModule({ providers: socle() });
      const fixture = TestBed.createComponent(Journal);
      await stabiliser(fixture);

      expect(appels).toContain('audit.listerJournal');
      const texte = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(texte).toContain('Changement de rôle');
      expect(texte).toContain('Mitch');
    });
  });

  describe('Tableau de bord', () => {
    it('croise comptes, finance et pilotage pour un administrateur', async () => {
      TestBed.configureTestingModule({
        providers: [
          ...socle(),
          {
            provide: AuthService,
            useValue: { role: signal('admin'), profil: signal(null), estCompteTest: signal(false) },
          },
        ],
      });
      const fixture = TestBed.createComponent(Accueil);
      await stabiliser(fixture);

      // Les trois services doivent être sollicités : c'est le seul écran qui
      // les croise, et donc celui où le découpage risquait le plus de casser.
      expect(appels).toContain('finance.listerPaiements');
      expect(appels).toContain('comptes.lister');
      expect(appels).toContain('pilotage.compterCertificats');
    });

    it('sollicite le pilotage et la modération pour un formateur', async () => {
      TestBed.configureTestingModule({
        providers: [
          ...socle(),
          {
            provide: AuthService,
            useValue: {
              role: signal('formateur'),
              profil: signal(null),
              estCompteTest: signal(false),
            },
          },
        ],
      });
      const fixture = TestBed.createComponent(Accueil);
      await stabiliser(fixture);

      expect(appels).toContain('pilotage.compterApprenants');
      expect(appels).toContain('pilotage.compterLecons');
      expect(appels).toContain('pilotage.inscriptionsRecentes');
    });
  });
});
