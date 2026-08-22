import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  CanActivateChildFn,
  CanActivateFn,
  Route,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { routes } from '../../app.routes';
import {
  authGuard,
  changementMdpRequisGuard,
  dateNaissanceGuard,
  dateNaissanceRequiseGuard,
  inviteGuard,
  motDePasseGuard,
  roleGuard,
} from './auth.guards';
import { AuthService } from './auth.service';
import { Profil, Role } from './profil.model';

/**
 * Les gardes sont la première barrière d'autorisation ; la RLS est la seconde.
 * Une garde contournée ne donne accès à aucune donnée, mais elle décide de ce
 * que l'interface propose — un écran d'administration ouvert à un apprenant est
 * un défaut visible même si la base refuse ensuite chaque requête.
 *
 * Ces tests portent donc sur les REFUS autant que sur les passages : c'est le
 * refus qui se casse en silence lors d'un remaniement.
 */

function unProfil(champs: Partial<Profil> = {}): Profil {
  return {
    id_profil: 'p-1',
    prenom: 'Ada',
    nom: 'Lovelace',
    role: 'apprenant',
    date_creation: '2026-01-02T00:00:00Z',
    date_naissance: '1990-05-04',
    doit_changer_mdp: false,
    est_test: false,
    est_proprietaire: false,
    ...champs,
  };
}

/**
 * Double d'`AuthService` réduit à ce que les gardes consomment : l'état de
 * connexion, l'attente d'initialisation et le profil. Les gardes n'utilisent
 * rien d'autre — un double plus large masquerait ce couplage réel.
 */
function authDouble(etat: { connecte?: boolean; profil?: Profil | null } = {}) {
  return {
    estConnecte: signal(etat.connecte ?? false),
    attendreInitialisation: () => Promise.resolve(),
    assurerProfil: () => Promise.resolve(etat.profil ?? null),
  };
}

type Garde = CanActivateFn | CanActivateChildFn;

/**
 * Exécute une garde dans un contexte d'injection avec un vrai `Router` : les
 * redirections sont donc de vrais `UrlTree`, comparés par sérialisation. Un
 * double de `Router` laisserait passer une cible mal formée.
 */
async function executer(
  garde: Garde,
  auth: ReturnType<typeof authDouble>,
  url = '/espace',
): Promise<boolean | UrlTree> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const route = {} as ActivatedRouteSnapshot;
  const etat = { url } as RouterStateSnapshot;
  // Toutes les gardes du projet sont `async` : le résultat est une promesse.
  return TestBed.runInInjectionContext(() => garde(route, etat)) as Promise<boolean | UrlTree>;
}

/** Cible d'une redirection, sous forme d'URL lisible (`/connexion?retour=%2Fespace`). */
function cible(resultat: boolean | UrlTree): string {
  return TestBed.inject(Router).serializeUrl(resultat as UrlTree);
}

describe('Gardes de route', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('authGuard', () => {
    it('laisse passer un utilisateur connecté', async () => {
      expect(await executer(authGuard, authDouble({ connecte: true }))).toBe(true);
    });

    it('redirige un visiteur vers la connexion', async () => {
      const resultat = await executer(authGuard, authDouble({ connecte: false }));
      expect(resultat).not.toBe(true);
    });

    it("conserve l'URL demandée pour y revenir après connexion", async () => {
      const resultat = await executer(
        authGuard,
        authDouble({ connecte: false }),
        '/espace/paiements',
      );
      // Sans ce paramètre, l'utilisateur atterrit sur l'accueil après s'être
      // connecté et doit refaire sa navigation.
      expect(cible(resultat)).toBe('/connexion?retour=%2Fespace%2Fpaiements');
    });
  });

  describe('inviteGuard', () => {
    it('laisse passer un visiteur', async () => {
      expect(await executer(inviteGuard, authDouble({ connecte: false }), '/connexion')).toBe(true);
    });

    it("renvoie un utilisateur déjà connecté vers l'espace", async () => {
      const resultat = await executer(inviteGuard, authDouble({ connecte: true }), '/connexion');
      expect(cible(resultat)).toBe('/espace');
    });
  });

  describe('motDePasseGuard', () => {
    it('bloque un compte au mot de passe temporaire', async () => {
      const resultat = await executer(
        motDePasseGuard,
        authDouble({ connecte: true, profil: unProfil({ doit_changer_mdp: true }) }),
      );
      expect(cible(resultat)).toBe('/nouveau-mot-de-passe');
    });

    it('laisse passer un compte dont le mot de passe a été renouvelé', async () => {
      const resultat = await executer(
        motDePasseGuard,
        authDouble({ connecte: true, profil: unProfil({ doit_changer_mdp: false }) }),
      );
      expect(resultat).toBe(true);
    });

    it('laisse passer quand le profil est introuvable', async () => {
      // Comportement constaté, pas souhaité : profil absent (lecture en échec)
      // ⇒ la garde ne bloque pas. Sans conséquence sur les données, la RLS
      // restant seule juge ; mais si ce blocage devient une exigence de
      // sécurité et non plus d'UX, c'est ici qu'il faudra basculer en refus.
      const resultat = await executer(
        motDePasseGuard,
        authDouble({ connecte: true, profil: null }),
      );
      expect(resultat).toBe(true);
    });
  });

  describe('dateNaissanceGuard', () => {
    // Ce garde existe pour une raison précise : Google ne transmet pas la date
    // de naissance, donc un compte créé par ce biais échappait au contrôle de
    // majorité. Les cas ci-dessous décrivent ce contournement et sa fermeture.
    it('détourne un compte sans date de naissance vers la page de saisie', async () => {
      const resultat = await executer(
        dateNaissanceGuard,
        authDouble({ connecte: true, profil: unProfil({ date_naissance: null }) }),
      );
      expect(cible(resultat)).toBe('/date-de-naissance');
    });

    it('laisse passer un compte dont la date est connue', async () => {
      const resultat = await executer(
        dateNaissanceGuard,
        authDouble({ connecte: true, profil: unProfil({ date_naissance: '1990-05-04' }) }),
      );
      expect(resultat).toBe(true);
    });

    it('cède le passage au changement de mot de passe, prioritaire', async () => {
      // Un compte créé par un admin n'a ni mot de passe définitif ni date de
      // naissance : les deux gardes s'appliquent. Sans cette priorité, les deux
      // redirections se renverraient l'une à l'autre.
      const resultat = await executer(
        dateNaissanceGuard,
        authDouble({
          connecte: true,
          profil: unProfil({ date_naissance: null, doit_changer_mdp: true }),
        }),
      );
      expect(resultat).toBe(true);
    });
  });

  describe('dateNaissanceRequiseGuard', () => {
    it('ouvre la page quand la date manque', async () => {
      const resultat = await executer(
        dateNaissanceRequiseGuard,
        authDouble({ connecte: true, profil: unProfil({ date_naissance: null }) }),
        '/date-de-naissance',
      );
      expect(resultat).toBe(true);
    });

    it("renvoie vers l'espace quand la date est déjà renseignée", async () => {
      const resultat = await executer(
        dateNaissanceRequiseGuard,
        authDouble({ connecte: true, profil: unProfil({ date_naissance: '1990-05-04' }) }),
        '/date-de-naissance',
      );
      expect(cible(resultat)).toBe('/espace');
    });

    it('renvoie un visiteur vers la connexion', async () => {
      const resultat = await executer(
        dateNaissanceRequiseGuard,
        authDouble({ connecte: false, profil: null }),
        '/date-de-naissance',
      );
      expect(cible(resultat)).toBe('/connexion');
    });
  });

  describe('changementMdpRequisGuard', () => {
    it('ouvre la page quand le changement est effectivement exigé', async () => {
      const resultat = await executer(
        changementMdpRequisGuard,
        authDouble({ connecte: true, profil: unProfil({ doit_changer_mdp: true }) }),
        '/nouveau-mot-de-passe',
      );
      expect(resultat).toBe(true);
    });

    it("renvoie vers l'espace quand aucun blocage n'est actif", async () => {
      const resultat = await executer(
        changementMdpRequisGuard,
        authDouble({ connecte: true, profil: unProfil({ doit_changer_mdp: false }) }),
        '/nouveau-mot-de-passe',
      );
      expect(cible(resultat)).toBe('/espace');
    });

    it('renvoie un visiteur vers la connexion', async () => {
      const resultat = await executer(
        changementMdpRequisGuard,
        authDouble({ connecte: false, profil: null }),
        '/nouveau-mot-de-passe',
      );
      expect(cible(resultat)).toBe('/connexion');
    });
  });

  describe('roleGuard', () => {
    it('laisse passer un rôle explicitement autorisé', async () => {
      const resultat = await executer(
        roleGuard('admin'),
        authDouble({ connecte: true, profil: unProfil({ role: 'admin' }) }),
      );
      expect(resultat).toBe(true);
    });

    it('accepte chacun des rôles listés', async () => {
      for (const role of ['formateur', 'admin'] as Role[]) {
        const resultat = await executer(
          roleGuard('formateur', 'admin'),
          authDouble({ connecte: true, profil: unProfil({ role }) }),
        );
        expect(resultat).toBe(true);
      }
    });

    it('refuse un formateur sur une route réservée aux administrateurs', async () => {
      const resultat = await executer(
        roleGuard('admin'),
        authDouble({ connecte: true, profil: unProfil({ role: 'formateur' }) }),
      );
      expect(cible(resultat)).toBe('/espace');
    });

    it('refuse un apprenant', async () => {
      const resultat = await executer(
        roleGuard('formateur', 'admin'),
        authDouble({ connecte: true, profil: unProfil({ role: 'apprenant' }) }),
      );
      expect(cible(resultat)).toBe('/espace');
    });

    it('ne se laisse pas contourner par un compte de test', async () => {
      // `est_test` élargit l'accès au CONTENU (bypass de progression), jamais
      // les droits d'administration. Confusion facile à introduire.
      const resultat = await executer(
        roleGuard('admin'),
        authDouble({
          connecte: true,
          profil: unProfil({ role: 'apprenant', est_test: true }),
        }),
      );
      expect(cible(resultat)).toBe('/espace');
    });

    it('renvoie vers la connexion quand le profil est introuvable', async () => {
      const resultat = await executer(
        roleGuard('admin'),
        authDouble({ connecte: false, profil: null }),
        '/espace/journal',
      );
      expect(cible(resultat)).toBe('/connexion?retour=%2Fespace%2Fjournal');
    });
  });
});

/**
 * Le tableau de vérité des routes protégées.
 *
 * Les gardes sont testées ci-dessus une par une ; ici c'est leur BRANCHEMENT
 * qui est vérifié. `roleGuard` étant une fabrique, on ne peut pas comparer les
 * fonctions déclarées sur une route : on les exécute donc réellement, sous
 * chaque identité, et on observe la décision. Le test résiste ainsi aux
 * remaniements internes des gardes.
 */
describe('Protection des routes déclarées', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Niveau d'accès attendu, route par route, sous `/espace`. */
  const ACCES_ESPACE: Record<string, Role[]> = {
    '': ['apprenant', 'formateur', 'admin'],
    formations: ['apprenant', 'formateur', 'admin'],
    notifications: ['apprenant', 'formateur', 'admin'],
    profil: ['apprenant', 'formateur', 'admin'],
    contenus: ['formateur', 'admin'],
    apprenants: ['formateur', 'admin'],
    moderation: ['formateur', 'admin'],
    utilisateurs: ['admin'],
    paiements: ['admin'],
    journal: ['admin'],
    parametres: ['admin'],
  };

  function noeud(chemin: string): Route {
    const trouve = routes.find((r) => r.path === chemin);
    if (!trouve) {
      throw new Error(`Route « ${chemin} » absente de app.routes.ts`);
    }
    return trouve;
  }

  /** Décision cumulée des gardes d'une route : `true`, ou la cible du premier refus. */
  async function decision(
    gardes: Garde[],
    auth: ReturnType<typeof authDouble>,
    url: string,
  ): Promise<boolean | string> {
    for (const garde of gardes) {
      const resultat = await executer(garde, auth, url);
      if (resultat !== true) {
        return cible(resultat);
      }
    }
    return true;
  }

  it('déclare un niveau d’accès attendu pour chaque route de l’espace', () => {
    // Filet du filet : une route ajoutée sans décision d'accès fait échouer ce
    // test, ce qui force à trancher explicitement plutôt qu'à hériter par
    // défaut du niveau le plus permissif.
    const declarees = (noeud('espace').children ?? []).map((r) => r.path ?? '');
    expect([...declarees].sort()).toEqual(Object.keys(ACCES_ESPACE).sort());
  });

  it('ferme l’espace et le parcours aux visiteurs', async () => {
    for (const chemin of ['espace', 'parcours']) {
      const gardes = (noeud(chemin).canActivate ?? []) as Garde[];
      expect(gardes.length).toBeGreaterThan(0);
      const resultat = await decision(gardes, authDouble({ connecte: false }), `/${chemin}`);
      expect(resultat).toBe('/connexion?retour=%2F' + chemin);
    }
  });

  it('impose le changement de mot de passe sur tout l’espace et tout le parcours', async () => {
    for (const chemin of ['espace', 'parcours']) {
      const gardes = (noeud(chemin).canActivateChild ?? []) as Garde[];
      expect(gardes.length).toBeGreaterThan(0);
      const auth = authDouble({
        connecte: true,
        profil: unProfil({ doit_changer_mdp: true }),
      });
      expect(await decision(gardes, auth, `/${chemin}`)).toBe('/nouveau-mot-de-passe');
    }
  });

  it('applique le tableau d’accès, rôle par rôle', async () => {
    const enfants = noeud('espace').children ?? [];
    for (const enfant of enfants) {
      const chemin = enfant.path ?? '';
      const autorises = ACCES_ESPACE[chemin];
      const gardes = (enfant.canActivate ?? []) as Garde[];

      for (const role of ['apprenant', 'formateur', 'admin'] as Role[]) {
        const auth = authDouble({ connecte: true, profil: unProfil({ role }) });
        const resultat = await decision(gardes, auth, `/espace/${chemin}`);
        if (autorises.includes(role)) {
          expect(resultat, `${role} devrait accéder à /espace/${chemin}`).toBe(true);
        } else {
          expect(resultat, `${role} ne devrait pas accéder à /espace/${chemin}`).toBe('/espace');
        }
      }
    }
  });
});
