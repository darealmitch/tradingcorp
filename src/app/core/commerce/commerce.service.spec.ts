import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from '../supabase/acces-donnees';
import { CommerceService } from './commerce.service';

/**
 * Ce que ce test protège : **« Mes factures » ne doit montrer que les siennes,
 * y compris à un administrateur.**
 *
 * La RLS ne suffit pas à l'obtenir. `factures_select_titulaire` ouvre
 * délibérément toutes les lignes à `is_admin()` — c'est ce qui rend l'écran de
 * facturation possible. Le seul rempart de l'écran client est donc le `.eq()`
 * posé ici, et rien ne le signalerait s'il disparaissait : la page continuerait
 * de s'afficher, simplement avec les factures d'autrui.
 */

interface Filtre {
  colonne: string;
  valeur: unknown;
}

function creerService(idConnecte: string | null) {
  const filtres: Filtre[] = [];
  const tablesLues: string[] = [];

  const builder = (): Record<string, unknown> => {
    const chainable: Record<string, unknown> = {
      eq: (colonne: string, valeur: unknown) => {
        filtres.push({ colonne, valeur });
        return chainable;
      },
    };
    for (const methode of ['select', 'order', 'update']) {
      chainable[methode] = () => chainable;
    }
    return chainable;
  };

  const acces = {
    table: (nom: string) => {
      tablesLues.push(nom);
      return builder();
    },
    appel: () => builder(),
    idUtilisateur: () => Promise.resolve(idConnecte),
    // Ce qui est observé ici n'est pas ce que `lire` rend, mais la requête
    // qui le demande : d'où un double qui ignore ses arguments.
    lire: () => Promise.resolve([]),
    compter: () => Promise.resolve(0),
    ecrire: () => Promise.resolve(null),
    modifier: () => Promise.resolve(null),
    invoquer: () => Promise.resolve({ donnees: null, erreur: null }),
  };

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [CommerceService, { provide: AccesDonnees, useValue: acces }],
  });

  return {
    service: TestBed.inject(CommerceService),
    filtres,
    tablesLues: () => tablesLues,
  };
}

describe('CommerceService — chargerFactures', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restreint la lecture au compte connecté', async () => {
    const { service, filtres } = creerService('profil-42');

    await service.chargerFactures();

    expect(filtres).toEqual([{ colonne: 'id_profil', valeur: 'profil-42' }]);
  });

  it('n’interroge pas la table sans compte identifié', async () => {
    // Le repli d'une session expirée doit être « rien », jamais « tout » : une
    // requête sans filtre rendrait à un administrateur les factures du site.
    const { service, tablesLues } = creerService(null);

    const factures = await service.chargerFactures();

    expect(factures).toEqual([]);
    expect(tablesLues()).toEqual([]);
  });
});
