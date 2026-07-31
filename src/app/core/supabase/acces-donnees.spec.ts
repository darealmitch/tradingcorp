import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from './acces-donnees';
import { SUPABASE } from './supabase.client';

/**
 * La règle que ce fichier protège : **un échec ne doit jamais ressembler à un
 * succès vide**. C'est le défaut que l'audit a relevé sur 30 appels — pas une
 * négligence isolée, une façon de faire.
 *
 * Les cas testés sont ceux où la confusion coûte le plus cher : une lecture en
 * panne qui rend une liste vide, une écriture refusée qui ne dit rien, un
 * message métier du serveur jeté en route.
 */

/** Réponse figée, `thenable` comme les builders de supabase-js. */
function reponse(valeur: {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number | null;
}) {
  return Promise.resolve({ data: null, error: null, ...valeur });
}

function creerAcces(fonctions: Record<string, unknown> = {}) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      AccesDonnees,
      {
        provide: SUPABASE,
        useValue: {
          from: () => ({}),
          rpc: () => ({}),
          functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
          auth: { getUser: () => Promise.resolve({ data: { user: null } }) },
          ...fonctions,
        },
      },
    ],
  });
  return TestBed.inject(AccesDonnees);
}

describe('AccesDonnees', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('lecture', () => {
    it('rend les données quand la lecture aboutit', async () => {
      const acces = creerAcces();
      const valeur = await acces.lire('lecture', reponse({ data: [{ id: 1 }] }), []);
      expect(valeur).toEqual([{ id: 1 }]);
      expect(acces.lectureEnEchec()).toBe(false);
    });

    it('rend le repli et signale l’incident quand la lecture échoue', async () => {
      const acces = creerAcces();

      const valeur = await acces.lire(
        'lecture des notifications',
        reponse({ error: { message: 'connection refused' } }),
        [],
      );

      // Même valeur de retour qu'avant la correction — mais désormais
      // accompagnée d'un état qui permet de ne pas la prendre pour un vide.
      expect(valeur).toEqual([]);
      expect(acces.lectureEnEchec()).toBe(true);
      expect(acces.dernierIncident()?.operation).toBe('lecture des notifications');
    });

    it('ne confond pas un ensemble vide légitime avec un échec', async () => {
      // Un refus de RLS rend `[]` sans erreur : c'est une réponse, pas une panne.
      const acces = creerAcces();

      expect(await acces.lire('lecture', reponse({ data: [] }), ['repli'])).toEqual([]);
      expect(acces.lectureEnEchec()).toBe(false);
    });

    it('rend le repli sur une donnée absente sans erreur', async () => {
      const acces = creerAcces();
      expect(await acces.lire('lecture', reponse({ data: null }), null)).toBeNull();
      expect(acces.lectureEnEchec()).toBe(false);
    });

    it('traite une panne réseau comme une erreur, pas comme un plantage', async () => {
      // supabase-js rejette la promesse quand le serveur est injoignable : sans
      // conversion, l'appelant recevrait une exception là où il attend `{ data }`.
      const acces = creerAcces();

      const valeur = await acces.lire(
        'lecture',
        Promise.reject(new TypeError('Failed to fetch')),
        [],
      );

      expect(valeur).toEqual([]);
      expect(acces.dernierIncident()?.code).toBe('RESEAU');
    });
  });

  describe('comptage', () => {
    it('rend le compte du serveur', async () => {
      const acces = creerAcces();
      expect(await acces.compter('comptage', reponse({ count: 42 }))).toBe(42);
    });

    it('rend zéro en signalant l’incident quand le comptage échoue', async () => {
      const acces = creerAcces();

      expect(await acces.compter('comptage', reponse({ error: { message: 'timeout' } }))).toBe(0);
      // Le zéro est indiscernable d'un compte réel : c'est l'état d'échec qui
      // permet au tableau de bord de ne pas l'afficher comme un résultat.
      expect(acces.lectureEnEchec()).toBe(true);
    });
  });

  describe('écriture', () => {
    it('rend null quand l’écriture aboutit', async () => {
      const acces = creerAcces();
      expect(await acces.ecrire('écriture', reponse({}))).toBeNull();
    });

    it('remonte le message métier du serveur tel qu’il est rédigé', async () => {
      // P0001 = `raise exception` en SQL : le message est écrit pour
      // l'utilisateur, en français. Le remplacer serait une perte d'information.
      const acces = creerAcces();

      const erreur = await acces.ecrire(
        'validation de l’étape',
        reponse({
          error: { message: 'La vidéo doit être visionnée jusqu’à la fin', code: 'P0001' },
        }),
      );

      expect(erreur).toBe('La vidéo doit être visionnée jusqu’à la fin');
    });

    it('masque les erreurs techniques derrière un message neutre', async () => {
      // « permission denied for table profils » renseignerait un attaquant sur
      // la structure, et ne dit rien d'utile à un utilisateur.
      const acces = creerAcces();

      const erreur = await acces.ecrire(
        'écriture',
        reponse({ error: { message: 'permission denied for table profils', code: '42501' } }),
        'La modification a échoué.',
      );

      expect(erreur).toBe('La modification a échoué.');
      expect(acces.dernierIncident()?.message).toBe('permission denied for table profils');
    });

    it('n’active pas l’état de panne de lecture sur un refus d’écriture', async () => {
      // Un refus d'autorisation est une réponse normale du système : afficher
      // « données indisponibles » à ce moment-là serait un contresens.
      const acces = creerAcces();

      await acces.ecrire('écriture', reponse({ error: { message: 'refus', code: '42501' } }));

      expect(acces.lectureEnEchec()).toBe(false);
    });
  });

  describe('Edge Functions', () => {
    it('rend les données quand la fonction répond', async () => {
      const acces = creerAcces({
        functions: { invoke: () => Promise.resolve({ data: { url: 'https://x' }, error: null }) },
      });

      const { donnees, erreur } = await acces.invoquer('paiement', 'checkout', {});

      expect(donnees).toEqual({ url: 'https://x' });
      expect(erreur).toBeUndefined();
    });

    it('rend un message d’échec quand la fonction est injoignable', async () => {
      const acces = creerAcces({
        functions: { invoke: () => Promise.resolve({ data: null, error: new Error('boom') }) },
      });

      const { erreur } = await acces.invoquer('paiement', 'checkout', {}, 'Paiement indisponible.');

      expect(erreur).toBe('Paiement indisponible.');
      expect(acces.dernierIncident()?.operation).toBe('paiement');
    });
  });

  describe('journal', () => {
    it('conserve les incidents dans l’ordre', async () => {
      const acces = creerAcces();

      await acces.lire('première lecture', reponse({ error: { message: 'a' } }), []);
      await acces.lire('seconde lecture', reponse({ error: { message: 'b' } }), []);

      expect(acces.incidents().map((i) => i.operation)).toEqual([
        'première lecture',
        'seconde lecture',
      ]);
    });

    it('repart à zéro après réinitialisation', async () => {
      const acces = creerAcces();
      await acces.lire('lecture', reponse({ error: { message: 'a' } }), []);

      acces.reinitialiser();

      expect(acces.incidents()).toEqual([]);
      expect(acces.lectureEnEchec()).toBe(false);
    });
  });
});
