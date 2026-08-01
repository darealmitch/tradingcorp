import {
  delaiRequisS,
  echecsConsecutifs,
  messageAttente,
  secondesAAttendre,
} from '../../../../supabase/functions/corriger-quiz/attente';

/**
 * Le seul morceau d'Edge Function couvert par cette suite.
 *
 * C'est possible parce que `attente.ts` est volontairement sans dépendance :
 * pas de Deno, pas de Supabase, pas d'horloge — le temps courant lui est
 * passé en paramètre. Sans cette précaution, vérifier un délai de dix minutes
 * demanderait d'attendre dix minutes.
 *
 * Ce que ces tests protègent : le coût d'une tentative. S'il retombe à zéro,
 * le quiz redevient une formalité qu'on passe en soumettant au hasard.
 */

describe('Délai entre deux tentatives de quiz', () => {
  describe('paliers', () => {
    it('laisse la première tentative partir sans attendre', () => {
      expect(delaiRequisS(0)).toBe(0);
    });

    it('allonge le délai à mesure que les échecs s’enchaînent', () => {
      expect(delaiRequisS(1)).toBe(30);
      expect(delaiRequisS(2)).toBe(120);
      expect(delaiRequisS(3)).toBe(300);
      expect(delaiRequisS(4)).toBe(600);
    });

    it('plafonne au dernier palier plutôt que de croître sans fin', () => {
      // Personne ne doit se retrouver bloqué des heures : le but est de rendre
      // le rejeu à l'aveugle coûteux, pas d'exclure l'apprenant du cours.
      expect(delaiRequisS(12)).toBe(600);
      expect(delaiRequisS(200)).toBe(600);
    });

    it('ne se laisse pas déborder par un compte négatif', () => {
      expect(delaiRequisS(-3)).toBe(0);
    });
  });

  describe('échecs consécutifs', () => {
    const echec = { reussi: false };
    const reussite = { reussi: true };

    it('compte zéro sans historique', () => {
      expect(echecsConsecutifs([])).toBe(0);
    });

    it('compte les échecs enchaînés depuis la tentative la plus récente', () => {
      expect(echecsConsecutifs([echec, echec, echec])).toBe(3);
    });

    it('repart de zéro après une réussite', () => {
      // Refaire un quiz déjà validé pour réviser ne doit pas hériter de la
      // pénalité d'un échec ancien.
      expect(echecsConsecutifs([reussite, echec, echec])).toBe(0);
    });

    it('ne compte que les échecs postérieurs à la dernière réussite', () => {
      expect(echecsConsecutifs([echec, echec, reussite, echec])).toBe(2);
    });
  });

  describe('temps restant', () => {
    const MAINTENANT = Date.parse('2026-08-01T12:00:00Z');
    const ilYA = (secondes: number) => new Date(MAINTENANT - secondes * 1000).toISOString();

    it('ne fait pas attendre après une première soumission', () => {
      expect(secondesAAttendre(0, ilYA(1), MAINTENANT)).toBe(0);
    });

    it('rend le temps restant tant que le délai n’est pas écoulé', () => {
      expect(secondesAAttendre(1, ilYA(10), MAINTENANT)).toBe(20);
    });

    it('laisse passer une fois le délai écoulé', () => {
      expect(secondesAAttendre(1, ilYA(31), MAINTENANT)).toBe(0);
      expect(secondesAAttendre(4, ilYA(601), MAINTENANT)).toBe(0);
    });

    it('laisse passer plutôt que de bloquer sur une date illisible', () => {
      // Une donnée qu'on ne sait pas interpréter ne doit pas se transformer en
      // verrou : l'apprenant n'y est pour rien.
      expect(secondesAAttendre(3, 'pas une date', MAINTENANT)).toBe(0);
      expect(secondesAAttendre(3, null, MAINTENANT)).toBe(0);
    });

    it('arrondit à la seconde supérieure', () => {
      // Rendre 0 alors qu'il reste une fraction de seconde ferait échouer la
      // resoumission juste après le message « tu peux y aller ».
      expect(secondesAAttendre(1, new Date(MAINTENANT - 29500).toISOString(), MAINTENANT)).toBe(1);
    });
  });

  describe('message', () => {
    it('parle en secondes en dessous d’une minute', () => {
      expect(messageAttente(1)).toContain('1 seconde ');
      expect(messageAttente(25)).toContain('25 secondes');
    });

    it('passe aux minutes au-delà', () => {
      expect(messageAttente(120)).toContain('2 minutes');
      expect(messageAttente(600)).toContain('10 minutes');
    });

    it('accorde le singulier', () => {
      expect(messageAttente(61)).toContain('2 minutes');
      expect(messageAttente(60)).toContain('1 minute ');
    });
  });
});
