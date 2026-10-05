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
  /** Paramètres d'une RPC. */
  charge?: Record<string, unknown>;
}

function creerService() {
  const appels: Appel[] = [];
  let erreur: string | null = null;
  let chaineCourante: string[] = [];
  let chargeCourante: Record<string, unknown> | undefined;

  const builder = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {};
    for (const methode of ['update', 'eq', 'in', 'select', 'order', 'limit']) {
      chainable[methode] = () => {
        chaineCourante.push(methode);
        return chainable;
      };
    }
    return chainable;
  };

  const enregistrer = (methode: string, operation: string): Promise<string | null> => {
    appels.push({ methode, operation, chaine: chaineCourante, charge: chargeCourante });
    chaineCourante = [];
    chargeCourante = undefined;
    return Promise.resolve(erreur);
  };

  const acces = {
    table: () => builder(),
    appel: (nom: string, parametres?: Record<string, unknown>) => {
      chaineCourante.push(`rpc:${nom}`);
      chargeCourante = parametres;
      return builder();
    },
    // `lire` rend le REPLI que l'appelant lui passe — c'est son contrat réel.
    // Le rendre en dur (`[]`) faisait recevoir un tableau vide là où le service
    // attend `null`, et `Number([])` valant 0, une moyenne inexistante serait
    // devenue « 0 / 5 ».
    lire: (_operation: string, _requete: unknown, repli: unknown) => Promise.resolve(repli),
    // Deux commentaires et un avis en attente : de quoi vérifier l'addition.
    compter: (operation: string) => Promise.resolve(operation.includes('avis') ? 1 : 2),
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

  describe('décision sur un commentaire', () => {
    // Les décisions passent par `moderer_commentaire` : c'est le serveur qui
    // sait ce qu'une décision a de sensé, et qui fait suivre tout le fil quand
    // un message devient privé. Une écriture directe dans la table le
    // contournerait.
    it('passe par moderer_commentaire, jamais par la table', async () => {
      const { service, appels } = creerService();

      await service.modererCommentaire('c-1', 'rendre_prive');

      expect(appels[0].chaine).toEqual(['rpc:moderer_commentaire']);
      expect(appels[0].charge).toEqual({ p_id_commentaire: 'c-1', p_decision: 'rendre_prive' });
    });

    it('rend le refus du serveur à l’écran', async () => {
      const { service, refuser } = creerService();
      refuser('Un message écrit en privé par un élève reste privé');

      expect(await service.modererCommentaire('c-1', 'rendre_public')).toContain('reste privé');
    });

    it('supprime définitivement par la fonction réservée à l’administrateur', async () => {
      const { service, appels } = creerService();

      await service.supprimerDefinitivement('c-1');

      expect(appels[0].chaine).toEqual(['rpc:supprimer_commentaire']);
      expect(appels[0].charge).toEqual({ p_id_commentaire: 'c-1' });
    });
  });

  describe('compteurs', () => {
    it('additionne ce qui attend l’équipe, pour la pastille de la navigation', async () => {
      const { service } = creerService();

      const compteurs = await service.rafraichirCompteurs();

      expect(compteurs).toEqual({ enAttente: 2, aRepondre: 0, avisEnAttente: 1 });
      expect(service.aTraiter()).toBe(3);
    });
  });

  describe('lectures', () => {
    it('rend des files vides plutôt que de planter quand il n’y a rien', async () => {
      const { service } = creerService();

      expect(await service.avisEnAttente()).toEqual([]);
      expect(await service.commentairesEnAttente()).toEqual([]);
      expect(await service.commentairesParEtat('publies')).toEqual([]);
      expect(await service.echangesPrives()).toEqual([]);
    });

    it('ne calcule pas de moyenne sans avis', async () => {
      // Zéro avis n'est pas une note de zéro : la nuance se perd vite si on
      // remplace `null` par un `0` d'apparence inoffensive.
      const { service } = creerService();

      expect(await service.noteMoyenne()).toBeNull();
    });
  });
});
