import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Commentaire } from './communaute.model';
import { CommunauteService } from './communaute.service';

/**
 * Ce que ces tests protègent :
 *
 *   • **une écriture doit porter l'identité de son auteur.** Les policies
 *     exigent `id_profil = auth.uid()` ; une insertion qui omettrait la colonne
 *     serait refusée par la base, et l'apprenant verrait un échec sans cause
 *     visible. C'est le genre d'oubli qu'une relecture ne rattrape pas.
 *
 *   • **une modification d'avis doit prouver qu'elle a porté sur une ligne.**
 *     La policy n'interdit pas l'UPDATE, elle écarte la ligne dès que l'avis
 *     n'est plus « en_attente ». Un avis approuvé entre l'affichage et l'envoi
 *     ne produit donc aucune erreur : sans `modifier` et sans `.select()`,
 *     l'écran annoncerait une modification que la base n'a pas faite.
 *
 *   • **un fil de discussion doit rester lisible même amputé.** La RLS masque
 *     les messages d'autrui encore en modération : une réponse peut survivre à
 *     son message parent. La masquer effacerait un propos légitime.
 */

interface Appel {
  methode: string;
  operation: string;
  chaine: string[];
  charge?: Record<string, unknown>;
}

function creerService(lignes: Commentaire[] = []) {
  const appels: Appel[] = [];
  let erreur: string | null = null;
  let chaineCourante: string[] = [];
  let chargeCourante: Record<string, unknown> | undefined;

  const builder = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {};
    for (const methode of ['insert', 'update', 'delete', 'eq', 'select', 'order']) {
      chainable[methode] = (argument?: unknown) => {
        chaineCourante.push(methode);
        if (methode === 'insert' || methode === 'update') {
          chargeCourante = argument as Record<string, unknown>;
        }
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
    appel: () => builder(),
    lire: () => Promise.resolve(lignes),
    compter: () => Promise.resolve(0),
    idUtilisateur: () => Promise.resolve('moi'),
    ecrire: (operation: string) => enregistrer('ecrire', operation),
    modifier: (operation: string) => enregistrer('modifier', operation),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CommunauteService, { provide: AccesDonnees, useValue: acces }],
  });

  return {
    service: TestBed.inject(CommunauteService),
    appels,
    refuser: (message: string) => (erreur = message),
  };
}

function unCommentaire(champs: Partial<Commentaire> = {}): Commentaire {
  return {
    id_commentaire: 'c-1',
    id_parent: null,
    contenu: 'Bonjour',
    statut: 'approuve',
    date_creation: '2026-08-01T10:00:00Z',
    id_profil: 'moi',
    profils: { prenom: 'Ada', nom: 'Lovelace' },
    ...champs,
  };
}

describe('CommunauteService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('dépôt d’un avis', () => {
    it('joint l’identité de l’auteur, exigée par la policy', async () => {
      const { service, appels } = creerService();

      await service.deposerAvis('f-1', 5, 'Excellente formation');

      expect(appels[0].charge?.['id_profil']).toBe('moi');
      expect(appels[0].charge?.['id_formation']).toBe('f-1');
    });

    it('n’impose pas le statut : le serveur le fixe à en_attente', async () => {
      const { service, appels } = creerService();

      await service.deposerAvis('f-1', 4, 'Bien');

      // L'envoyer depuis le client donnerait l'illusion que la valeur se
      // décide ici, et masquerait la règle serveur au premier remaniement.
      expect(appels[0].charge).not.toHaveProperty('statut');
    });

    it('enregistre un avis sans texte comme un avis sans texte, pas comme une chaîne vide', async () => {
      const { service, appels } = creerService();

      await service.deposerAvis('f-1', 3, '   ');

      expect(appels[0].charge?.['contenu']).toBeNull();
    });
  });

  describe('modification d’un avis', () => {
    it('exige la preuve que la ligne a bien été modifiée', async () => {
      const { service, appels } = creerService();

      await service.modifierAvis('a-1', 5, 'Mieux encore');

      expect(appels[0].methode).toBe('modifier');
      expect(appels[0].chaine).toContain('select');
    });

    it('explique le refus quand l’avis vient d’être approuvé', async () => {
      const { service, refuser } = creerService();
      refuser("Ton avis a déjà été traité par l'équipe : il n'est plus modifiable.");

      expect(await service.modifierAvis('a-1', 2, 'Bof')).toContain('plus modifiable');
    });
  });

  describe('publication d’un commentaire', () => {
    it('joint l’identité de l’auteur et le chapitre', async () => {
      const { service, appels } = creerService();

      await service.publierCommentaire('l-1', 'Une question');

      expect(appels[0].charge?.['id_profil']).toBe('moi');
      expect(appels[0].charge?.['id_lecon']).toBe('l-1');
      expect(appels[0].charge?.['id_parent']).toBeNull();
    });

    it('rattache une réponse à son message', async () => {
      const { service, appels } = creerService();

      await service.publierCommentaire('l-1', 'Ma réponse', 'c-9');

      expect(appels[0].charge?.['id_parent']).toBe('c-9');
    });
  });

  describe('organisation en fils', () => {
    it('rattache les réponses à leur message', async () => {
      const { service } = creerService([
        unCommentaire({ id_commentaire: 'c-1' }),
        unCommentaire({ id_commentaire: 'c-2', id_parent: 'c-1', contenu: 'Réponse' }),
      ]);

      const fils = await service.commentaires('l-1');

      expect(fils).toHaveLength(1);
      expect(fils[0].reponses.map((r) => r.id_commentaire)).toEqual(['c-2']);
    });

    it('promeut une réponse dont le message parent est invisible', async () => {
      // Le parent est en modération : la RLS ne l'a pas renvoyé. Sans cette
      // règle, la réponse disparaîtrait de l'écran sans raison apparente.
      const { service } = creerService([
        unCommentaire({ id_commentaire: 'c-2', id_parent: 'c-absent', contenu: 'Orpheline' }),
      ]);

      const fils = await service.commentaires('l-1');

      expect(fils).toHaveLength(1);
      expect(fils[0].message.id_commentaire).toBe('c-2');
    });
  });

  describe('suppression d’un commentaire', () => {
    it('exige la preuve qu’une ligne a été supprimée', async () => {
      const { service, appels } = creerService();

      await service.supprimerCommentaire('c-1');

      // Supprimer le commentaire d'autrui ne lève pas d'erreur : la policy
      // écarte simplement la ligne. Seul le décompte le révèle.
      expect(appels[0].methode).toBe('modifier');
      expect(appels[0].chaine).toContain('select');
    });
  });
});
