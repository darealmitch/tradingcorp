import { TestBed } from '@angular/core/testing';
import { SUPABASE } from '../supabase/supabase.client';
import { AuthService } from './auth.service';
import { Profil } from './profil.model';

/**
 * `AuthService` ne décide d'aucun droit : tout est tranché en base. Ce qu'il
 * porte, c'est le CONTRAT avec le serveur — les données transmises, les appels
 * passés, les erreurs traduites. Deux régressions y sont invisibles à l'œil et
 * lourdes de conséquences :
 *
 *   1. cesser d'envoyer `date_naissance` à l'inscription : le trigger serveur
 *      n'a plus rien à contrôler, la vérification de majorité tombe (P-02) ;
 *   2. rétablir un appel client qui lève `doit_changer_mdp` sans preuve d'un
 *      changement réel de mot de passe (P-04).
 *
 * Ces deux points ont chacun leur test de non-régression ci-dessous.
 */

function unProfil(champs: Partial<Profil> = {}): Profil {
  return {
    id_profil: 'u-1',
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

const SESSION = { user: { id: 'u-1' } };

interface Appel {
  nom: string;
  params?: unknown;
}

interface Options {
  /** Session restituée au démarrage (null = visiteur). */
  session?: unknown;
  profil?: Profil | null;
  /** Erreur renvoyée par l'appel d'authentification simulé. */
  erreur?: { message: string };
  /** Inscription acceptée mais e-mail à confirmer : Supabase ne rend pas de session. */
  sansSession?: boolean;
}

function clientDouble(options: Options = {}) {
  const appels: Appel[] = [];
  const erreur = options.erreur ?? null;
  const session = options.sansSession ? null : (options.session ?? SESSION);

  const tracer = (nom: string, params: unknown, retour: unknown) => {
    appels.push({ nom, params });
    return Promise.resolve(retour);
  };

  return {
    appels,
    client: {
      auth: {
        getSession: () => Promise.resolve({ data: { session: options.session ?? null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
        signUp: (params: unknown) => tracer('signUp', params, { data: { session }, error: erreur }),
        signInWithPassword: (params: unknown) =>
          tracer('signInWithPassword', params, { data: { session }, error: erreur }),
        signInWithOAuth: (params: unknown) => tracer('signInWithOAuth', params, { error: erreur }),
        signOut: () => tracer('signOut', undefined, { error: null }),
        updateUser: (params: unknown) => tracer('updateUser', params, { error: erreur }),
      },
      from(table: string) {
        appels.push({ nom: `from:${table}` });
        const chainable: Record<string, unknown> = {};
        for (const methode of ['select', 'eq']) {
          chainable[methode] = () => chainable;
        }
        chainable['maybeSingle'] = () =>
          Promise.resolve({ data: options.profil ?? null, error: null });
        return chainable;
      },
      // Le service ne doit plus appeler aucune RPC : la présence d'un appel
      // ici est en soi le signal d'une régression (voir P-04).
      rpc: (nom: string, params?: unknown) => tracer(`rpc:${nom}`, params, { data: null }),
    },
  };
}

async function creerService(options: Options = {}) {
  const double = clientDouble(options);
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [AuthService, { provide: SUPABASE, useValue: double.client }],
  });
  const service = TestBed.inject(AuthService);
  // Le constructeur lance l'initialisation : on attend qu'elle soit terminée
  // pour que `pret` et le profil reflètent l'état de départ.
  await service.attendreInitialisation();
  return { service, double };
}

describe('AuthService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('état initial', () => {
    it('démarre déconnecté quand aucune session n’est restaurée', async () => {
      const { service } = await creerService();
      expect(service.estConnecte()).toBe(false);
      expect(service.profil()).toBeNull();
      expect(service.pret()).toBe(true);
    });

    it('restaure la session et charge le profil associé', async () => {
      const { service } = await creerService({ session: SESSION, profil: unProfil() });
      expect(service.estConnecte()).toBe(true);
      expect(service.profil()?.id_profil).toBe('u-1');
    });

    it('expose le rôle et les dérivés du profil', async () => {
      const { service } = await creerService({
        session: SESSION,
        profil: unProfil({ role: 'formateur', est_test: true }),
      });
      expect(service.role()).toBe('formateur');
      expect(service.estFormateurOuAdmin()).toBe(true);
      expect(service.estCompteTest()).toBe(true);
    });

    it('ne prend un apprenant ni pour un formateur ni pour un admin', async () => {
      const { service } = await creerService({ session: SESSION, profil: unProfil() });
      expect(service.estFormateurOuAdmin()).toBe(false);
      expect(service.estCompteTest()).toBe(false);
    });
  });

  describe('inscription', () => {
    it('transmet la date de naissance au serveur', async () => {
      // NON-RÉGRESSION P-02. La majorité est vérifiée par le trigger
      // `handle_new_user`, qui lit `date_naissance` dans les métadonnées de
      // `signUp`. Si le client cesse de l'envoyer, le trigger reçoit null et
      // n'a plus rien à refuser : la vérification disparaît sans qu'aucun
      // écran ne change d'apparence.
      const { service, double } = await creerService();

      await service.inscription('ada@exemple.fr', 'mdp-long-1234', 'Ada', 'Lovelace', '1990-05-04');

      const appel = double.appels.find((a) => a.nom === 'signUp');
      expect(appel?.params).toMatchObject({
        email: 'ada@exemple.fr',
        options: { data: { prenom: 'Ada', nom: 'Lovelace', date_naissance: '1990-05-04' } },
      });
    });

    it('traduit le refus de majorité renvoyé par le trigger', async () => {
      // Message brut du trigger SQL, tel qu'il remonte de PostgREST.
      const { service } = await creerService({
        erreur: { message: 'Tu dois avoir au moins 18 ans pour t’inscrire.' },
      });

      const resultat = await service.inscription('x@y.fr', 'mdp-long-1234', 'A', 'B', '2015-01-01');

      expect(resultat.ok).toBe(false);
      expect(resultat.erreur).toContain('18 ans');
    });

    it('signale la confirmation d’e-mail quand aucune session n’est ouverte', async () => {
      const { service } = await creerService({ sansSession: true });

      const resultat = await service.inscription('a@b.fr', 'mdp-long-1234', 'A', 'B', '1990-01-01');

      expect(resultat).toEqual({ ok: true, confirmationRequise: true });
    });

    it('charge le profil dès l’inscription quand la session est immédiate', async () => {
      const { service, double } = await creerService({ profil: unProfil() });

      const resultat = await service.inscription('a@b.fr', 'mdp-long-1234', 'A', 'B', '1990-01-01');

      expect(resultat.ok).toBe(true);
      expect(double.appels.some((a) => a.nom === 'from:profils')).toBe(true);
    });
  });

  describe('connexion', () => {
    it('charge le profil après une connexion réussie', async () => {
      const { service, double } = await creerService({ profil: unProfil({ role: 'admin' }) });

      const resultat = await service.connexion('ada@exemple.fr', 'secret');

      expect(resultat.ok).toBe(true);
      expect(service.role()).toBe('admin');
      expect(double.appels.some((a) => a.nom === 'signInWithPassword')).toBe(true);
    });

    it('ne divulgue pas lequel de l’e-mail ou du mot de passe est faux', async () => {
      const { service } = await creerService({ erreur: { message: 'Invalid login credentials' } });

      const resultat = await service.connexion('ada@exemple.fr', 'faux');

      expect(resultat.ok).toBe(false);
      expect(resultat.erreur).toBe('E-mail ou mot de passe incorrect.');
    });

    it('traduit les erreurs connues en français', async () => {
      const cas: [string, string][] = [
        ['User already registered', 'Un compte existe déjà avec cet e-mail.'],
        [
          'Email not confirmed',
          'Confirme ton adresse e-mail avant de te connecter (vérifie ta boîte mail).',
        ],
        [
          'Password should be at least 8 characters',
          'Le mot de passe doit contenir au moins 8 caractères.',
        ],
        ['Email rate limit exceeded', 'Trop de tentatives. Réessaie dans quelques minutes.'],
      ];

      for (const [brut, attendu] of cas) {
        const { service } = await creerService({ erreur: { message: brut } });
        expect((await service.connexion('a@b.fr', 'x')).erreur).toBe(attendu);
      }
    });

    it('reste générique sur une erreur inconnue', async () => {
      // Un message serveur inattendu ne doit pas être affiché tel quel : il
      // peut renseigner un attaquant sur l'état interne du système.
      const { service } = await creerService({
        erreur: { message: 'relation "profils" does not exist' },
      });

      expect((await service.connexion('a@b.fr', 'x')).erreur).toBe(
        'Une erreur est survenue. Réessaie.',
      );
    });
  });

  describe('definirNouveauMotDePasse', () => {
    it('change le mot de passe sans appeler la moindre RPC', async () => {
      // NON-RÉGRESSION P-04. L'ancienne RPC `confirmer_changement_mdp` levait
      // `doit_changer_mdp` sur simple demande du client : appelée seule, elle
      // débloquait l'espace en conservant le mot de passe temporaire. Le
      // blocage est désormais levé par le trigger `on_auth_password_changed`,
      // déclenché par le changement lui-même. Aucun appel client ne doit
      // réapparaître entre les deux.
      const { service, double } = await creerService({
        session: SESSION,
        profil: unProfil({ doit_changer_mdp: true }),
      });

      const resultat = await service.definirNouveauMotDePasse('nouveau-mdp-long');

      expect(resultat.ok).toBe(true);
      expect(double.appels.find((a) => a.nom === 'updateUser')?.params).toEqual({
        password: 'nouveau-mdp-long',
      });
      expect(double.appels.filter((a) => a.nom.startsWith('rpc:'))).toEqual([]);
    });

    it('recharge le profil pour récupérer le blocage levé par le trigger', async () => {
      const { service, double } = await creerService({
        session: SESSION,
        profil: unProfil({ doit_changer_mdp: true }),
      });
      const avant = double.appels.filter((a) => a.nom === 'from:profils').length;

      await service.definirNouveauMotDePasse('nouveau-mdp-long');

      expect(double.appels.filter((a) => a.nom === 'from:profils').length).toBeGreaterThan(avant);
    });

    it('ne recharge rien quand le changement échoue', async () => {
      const { service, double } = await creerService({
        session: SESSION,
        profil: unProfil({ doit_changer_mdp: true }),
        erreur: { message: 'New password should be different from the old password.' },
      });
      const avant = double.appels.filter((a) => a.nom === 'from:profils').length;

      const resultat = await service.definirNouveauMotDePasse('mdp-temporaire');

      expect(resultat.ok).toBe(false);
      expect(resultat.erreur).toBe(
        'Le nouveau mot de passe doit être différent du mot de passe temporaire.',
      );
      expect(double.appels.filter((a) => a.nom === 'from:profils').length).toBe(avant);
    });
  });

  describe('assurerProfil', () => {
    it('charge le profil manquant d’une session déjà ouverte', async () => {
      const { service } = await creerService({ session: SESSION, profil: unProfil() });

      expect(await service.assurerProfil()).not.toBeNull();
    });

    it('ne rend aucun profil pour un visiteur', async () => {
      const { service } = await creerService();

      expect(await service.assurerProfil()).toBeNull();
    });
  });
});
