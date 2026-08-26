import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from '../supabase/acces-donnees';
import { ModerationService } from './moderation.service';

/**
 * Ce que ces tests protègent tient en une phrase : **une modération qui ne
 * modifie rien ne doit pas passer pour une modération réussie**.
 *
 * Les policies de modération n'interdisent pas l'UPDATE, elles écartent les
 * lignes. Un formateur rétrogradé, ou un avis déjà traité par un collègue,
 * n'obtiennent donc aucune erreur — l'écriture ne touche rien et rend un
 * succès. La file se viderait à l'écran pendant que la base garde tout.
 *
 * Deux choses doivent rester vraies pour l'éviter, et une seule ne suffit pas :
 * l'appel passe par `modifier`, et la requête chaîne `.select()` — sans quoi
 * PostgREST ne renvoie aucune ligne à compter, et `modifier` conclurait à
 * l'échec sur une opération pourtant réussie.
 */

interface Appel {
  methode: string;
  operation: string;
  /** Méthodes chaînées sur le builder, dans l'ordre. */
  chaine: string[];
}

function creerService() {
  const appels: Appel[] = [];
  let erreur: string | null = null;
  let chaineCourante: string[] = [];

  const builder = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {};
    for (const methode of ['update', 'eq', 'select', 'order']) {
      chainable[methode] = () => {
        chaineCourante.push(methode);
        return chainable;
      };
    }
    return chainable;
  };

  const enregistrer = (methode: string, operation: string): Promise<string | null> => {
    appels.push({ methode, operation, chaine: chaineCourante });
    chaineCourante = [];
    return Promise.resolve(erreur);
  };

  const acces = {
    table: () => builder(),
    appel: () => builder(),
    // `lire` rend le REPLI que l'appelant lui passe — c'est son contrat réel.
    // Le rendre en dur (`[]`) faisait recevoir un tableau vide là où le service
    // attend `null`, et `Number([])` valant 0, une moyenne inexistante serait
    // devenue « 0 / 5 ».
    lire: (_operation: string, _requete: unknown, repli: unknown) => Promise.resolve(repli),
    compter: () => Promise.resolve(0),
    ecrire: (operation: string) => enregistrer('ecrire', operation),
    modifier: (operation: string) => enregistrer('modifier', operation),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [ModerationService, { provide: AccesDonnees, useValue: acces }],
  });

  return {
    service: TestBed.inject(ModerationService),
    appels,
    refuser: (message: string) => (erreur = message),
  };
}

describe('ModerationService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('traitement d’un avis', () => {
    it('exige la preuve que la ligne a bien été modifiée', async () => {
      const { service, appels } = creerService();

      await service.traiterAvis('a-1', 'approuve');

      expect(appels[0].methode).toBe('modifier');
    });

    it('demande les lignes touchées, sans quoi il n’y a rien à compter', async () => {
      const { service, appels } = creerService();

      await service.traiterAvis('a-1', 'approuve');

      expect(appels[0].chaine).toContain('select');
    });

    it('remonte le refus tel quel', async () => {
      const { service, refuser } = creerService();
      refuser('La modération a échoué. Réessaie.');

      expect(await service.traiterAvis('a-1', 'rejete')).toBe('La modération a échoué. Réessaie.');
    });

    it('rend null quand la modération aboutit', async () => {
      const { service } = creerService();

      expect(await service.traiterAvis('a-1', 'approuve')).toBeNull();
    });
  });

  describe('traitement d’un commentaire', () => {
    it('suit exactement les mêmes règles', async () => {
      const { service, appels } = creerService();

      await service.traiterCommentaire('c-1', 'rejete');

      expect(appels[0].methode).toBe('modifier');
      expect(appels[0].chaine).toContain('select');
    });
  });

  describe('lectures', () => {
    it('rend des files vides plutôt que de planter quand il n’y a rien', async () => {
      const { service } = creerService();

      expect(await service.avisEnAttente()).toEqual([]);
      expect(await service.commentairesEnAttente()).toEqual([]);
      expect(await service.compterCommentairesEnAttente()).toBe(0);
    });

    it('ne calcule pas de moyenne sans avis', async () => {
      // Zéro avis n'est pas une note de zéro : la nuance se perd vite si on
      // remplace `null` par un `0` d'apparence inoffensive.
      const { service } = creerService();

      expect(await service.noteMoyenne()).toBeNull();
    });
  });
});
