import { TestBed } from '@angular/core/testing';
import { AccesDonnees } from '../supabase/acces-donnees';
import { SUPABASE } from '../supabase/supabase.client';
import { ContenuService } from './contenu.service';

/**
 * Réponse PostgREST : `{ data, count }`. Le builder de supabase-js est à la fois
 * chaînable et « thenable » — `await client.from('x').select('y')` résout sans
 * appeler de méthode terminale. Le double est donc chaînable ET awaitable.
 */
interface Reponse {
  data?: unknown;
  count?: number;
  /** Erreur PostgREST — `code: 'P0001'` pour un refus métier rédigé en SQL. */
  error?: { message: string; code?: string };
}

/**
 * Double du client Supabase, piloté par table et par RPC.
 *
 * Les tests décrivent ce que la base renvoie ; le service reste inchangé. C'est
 * possible parce que le client est fourni par un `InjectionToken` et non
 * instancié en dur — la substitution ne demande aucune adaptation du code testé.
 */
function clientDouble(reponses: {
  tables?: Record<string, Reponse>;
  rpc?: Record<string, Reponse>;
  /** Réponses des Edge Functions, par nom — `{ data }` comme supabase-js. */
  fonctions?: Record<string, Reponse>;
}) {
  const appels: { table?: string; rpc?: string; fonction?: string; params?: unknown }[] = [];

  const builder = (reponse: Reponse) => {
    const chainable: Record<string, unknown> = {};
    // Toute méthode de filtrage renvoie le builder : l'ordre et le nombre
    // d'appels n'ont pas à être connus du test.
    for (const methode of ['select', 'eq', 'neq', 'order', 'limit', 'not', 'is', 'in']) {
      chainable[methode] = () => chainable;
    }
    chainable['maybeSingle'] = () => Promise.resolve(reponse);
    chainable['single'] = () => Promise.resolve(reponse);
    chainable['then'] = (resoudre: (v: Reponse) => unknown) =>
      Promise.resolve(reponse).then(resoudre);
    return chainable;
  };

  return {
    appels,
    client: {
      from(table: string) {
        appels.push({ table });
        return builder(reponses.tables?.[table] ?? { data: [] });
      },
      rpc(nom: string, params?: unknown) {
        appels.push({ rpc: nom, params });
        return Promise.resolve(reponses.rpc?.[nom] ?? { data: [] });
      },
      functions: {
        invoke(nom: string, options?: { body?: unknown }) {
          appels.push({ fonction: nom, params: options?.body });
          return Promise.resolve(reponses.fonctions?.[nom] ?? { data: null });
        },
      },
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'profil-1' } } }),
      },
    },
  };
}

function creerService(reponses: Parameters<typeof clientDouble>[0]) {
  const double = clientDouble(reponses);
  TestBed.configureTestingModule({
    providers: [ContenuService, { provide: SUPABASE, useValue: double.client }],
  });
  return { service: TestBed.inject(ContenuService), double };
}

describe('ContenuService', () => {
  afterEach(() => TestBed.resetTestingModule());

  describe('chargerParcours', () => {
    it("retourne la formation de l'inscription active, marquée comme inscrite", async () => {
      const { service } = creerService({
        tables: {
          inscriptions: {
            data: { id_formation: 'f-1', formations: { titre: 'Trader Pro' } },
          },
        },
        rpc: { etats_modules: { data: [{ id_section: 's-1', titre: 'Trading' }] } },
      });

      const parcours = await service.chargerParcours();

      expect(parcours?.id_formation).toBe('f-1');
      expect(parcours?.titre).toBe('Trader Pro');
      expect(parcours?.inscrit).toBe(true);
      expect(parcours?.modules.length).toBe(1);
    });

    it('retombe sur la formation publiée en teaser quand aucune inscription active', async () => {
      const { service, double } = creerService({
        tables: {
          // Aucune inscription : le service doit interroger `formations`.
          inscriptions: { data: null },
          formations: { data: { id_formation: 'f-teaser', titre: 'Découverte' } },
        },
        rpc: { etats_modules: { data: [] } },
      });

      const parcours = await service.chargerParcours();

      expect(parcours?.id_formation).toBe('f-teaser');
      // `inscrit` distingue le teaser d'un accès réel : c'est lui qui décide du
      // verrouillage affiché. Une confusion ici ouvrirait le contenu à tous.
      expect(parcours?.inscrit).toBe(false);
      expect(double.appels.some((a) => a.table === 'formations')).toBe(true);
    });

    it('ne retourne rien quand aucune formation n’existe', async () => {
      const { service } = creerService({
        tables: { inscriptions: { data: null }, formations: { data: null } },
      });

      expect(await service.chargerParcours()).toBeNull();
    });

    it("transmet la formation résolue à la RPC d'états", async () => {
      const { service, double } = creerService({
        tables: { inscriptions: { data: { id_formation: 'f-9', formations: { titre: 'X' } } } },
        rpc: { etats_modules: { data: [] } },
      });

      await service.chargerParcours();

      const appel = double.appels.find((a) => a.rpc === 'etats_modules');
      expect(appel?.params).toEqual({ p_id_formation: 'f-9' });
    });
  });

  describe('verifierCertificat', () => {
    // La vérification ne passe plus par la RPC en direct mais par l'Edge
    // Function `verifier-certificat` : la RPC n'est plus accessible à `anon`,
    // parce qu'une limitation de débit ne peut pas s'écrire en SQL — PostgREST
    // ne transmet pas l'adresse de l'appelant à la base (audit RGPD, P-18).
    // Ce qui reste testable ici, c'est l'appel et le mapping ; le reste est
    // couvert par les tests pgTAP.
    it('normalise le numéro saisi avant de chercher', async () => {
      // Un numéro se recopie à la main, depuis un papier : la casse et les
      // espaces de saisie ne doivent jamais faire échouer une vérification
      // légitime. La normalisation appartient au service, pas à l'écran —
      // sinon un second point d'entrée (lien direct, QR code) l'oublierait.
      const { service, double } = creerService({
        fonctions: { 'verifier-certificat': { data: { certificat: null } } },
      });

      await service.verifierCertificat('  tc-2026-abcdefgh  ');

      const appel = double.appels.find((a) => a.fonction === 'verifier-certificat');
      expect(appel?.params).toEqual({ numero: 'TC-2026-ABCDEFGH' });
    });

    it('rend le certificat quand le numéro correspond', async () => {
      const { service } = creerService({
        fonctions: {
          'verifier-certificat': {
            data: {
              certificat: {
                numero: 'TC-2026-ABCDEFGH',
                titre_formation: 'Formation Trader Pro',
                prenom: 'Ada',
                // Le nom est réduit à son initiale par la base : vérifier une
                // attestation ne doit pas divulguer une identité complète.
                nom: 'L.',
                date_obtention: '2026-08-01T10:00:00Z',
              },
            },
          },
        },
      });

      const certificat = await service.verifierCertificat('TC-2026-ABCDEFGH');

      expect(certificat?.titre_formation).toBe('Formation Trader Pro');
      expect(certificat?.nom).toBe('L.');
    });

    it('rend null sur un numéro inconnu, sans distinguer les causes', async () => {
      // Inventé, mal recopié ou révoqué : même réponse. Distinguer ferait de la
      // page un outil pour tester des numéros au hasard.
      const { service } = creerService({
        fonctions: { 'verifier-certificat': { data: { certificat: null } } },
      });

      expect(await service.verifierCertificat('TC-2026-INCONNU1')).toBeNull();
    });
  });

  describe('maProgression', () => {
    // Le calcul est descendu en base : le dénominateur doit porter sur le
    // PROGRAMME, or `lecons_select_gated` ne montre que les étapes débloquées.
    // Un `count(*)` côté client rendait donc un total qui suivait la
    // progression — 8/15 au lieu de 8/103 (audit P-24). Ce que le service
    // garde, c'est l'appel et le repli.
    it('rend les compteurs calculés par la base', async () => {
      const { service } = creerService({
        rpc: { ma_progression: { data: [{ terminees: 12, total: 103 }] } },
      });

      expect(await service.maProgression()).toEqual({ terminees: 12, total: 103 });
    });

    it('renvoie zéro plutôt que null quand la base ne rend rien', async () => {
      const { service } = creerService({ rpc: { ma_progression: { data: [] } } });

      expect(await service.maProgression()).toEqual({ terminees: 0, total: 0 });
    });
  });

  describe('prochainesLecons', () => {
    // Le tri et le filtrage sont descendus en base : la méthode chargeait tout
    // le programme — sections, leçons et ressources jointes — pour n'en garder
    // que les premières lignes non terminées (audit P-10).
    it('transmet la limite demandée et rend ce que la base renvoie', async () => {
      const { service, double } = creerService({
        rpc: {
          prochaines_lecons: {
            data: [
              { id_lecon: 'l-2', id_section: 's-1', titre: 'À faire' },
              { id_lecon: 'l-3', id_section: 's-2', titre: 'À faire aussi' },
            ],
          },
        },
      });

      const prochaines = await service.prochainesLecons(5);

      expect(double.appels.find((a) => a.rpc === 'prochaines_lecons')?.params).toEqual({
        p_limite: 5,
      });
      expect(prochaines.map((l) => l.id_lecon)).toEqual(['l-2', 'l-3']);
    });

    it('retourne une liste vide quand tout est terminé', async () => {
      const { service } = creerService({ rpc: { prochaines_lecons: { data: [] } } });

      expect(await service.prochainesLecons(5)).toEqual([]);
    });
  });

  describe('terminerLecon', () => {
    it('rend null quand la validation passe', async () => {
      const { service } = creerService({ rpc: { terminer_lecon: { data: null } } });

      expect(await service.terminerLecon('l-1')).toBeNull();
    });

    it('rend le refus du serveur, rédigé pour l’apprenant', async () => {
      // Ces messages existent depuis toujours côté base ; ils étaient jetés à
      // l'arrivée, et le clic sur « valider » restait sans réaction visible.
      const { service } = creerService({
        rpc: {
          terminer_lecon: {
            error: { message: 'La vidéo doit être visionnée jusqu’à la fin', code: 'P0001' },
          },
        },
      });

      expect(await service.terminerLecon('l-1')).toBe(
        'La vidéo doit être visionnée jusqu’à la fin',
      );
    });

    it('reste générique sur une erreur technique', async () => {
      const { service } = creerService({
        rpc: {
          terminer_lecon: {
            error: { message: 'permission denied for function terminer_lecon', code: '42501' },
          },
        },
      });

      expect(await service.terminerLecon('l-1')).toBe(
        'La validation de l’étape a échoué. Réessaie.',
      );
    });
  });

  describe('mesCertificats', () => {
    it('retourne les certificats obtenus avec leur formation', async () => {
      const { service } = creerService({
        tables: {
          certificats: {
            data: [
              {
                id_certificat: 'c-1',
                id_formation: 'f-1',
                numero: 'TC-2026-ABCD2345',
                date_obtention: '2026-08-01T10:00:00Z',
                formations: { titre: 'Trader Pro' },
              },
            ],
          },
        },
      });

      const certificats = await service.mesCertificats();

      expect(certificats.length).toBe(1);
      expect(certificats[0].numero).toBe('TC-2026-ABCD2345');
      expect(certificats[0].formations?.titre).toBe('Trader Pro');
    });

    it('retourne une liste vide quand aucun n’a été délivré', async () => {
      // Cas de très loin le plus fréquent : la page ne doit pas s'attendre à en
      // trouver un, et l'absence n'est pas un échec.
      const { service } = creerService({ tables: { certificats: { data: [] } } });

      expect(await service.mesCertificats()).toEqual([]);
    });
  });

  describe('lectures en échec', () => {
    it('rend une liste vide sans la faire passer pour un programme vide', async () => {
      const { service } = creerService({
        tables: { sections: { error: { message: 'connection refused' } } },
      });

      expect(await service.chargerStructure()).toEqual([]);
      // C'est ce drapeau qui distingue « aucun module » de « lecture en panne » :
      // sans lui, l'écran afficherait un programme vide en toute confiance.
      expect(TestBed.inject(AccesDonnees).lectureEnEchec()).toBe(true);
    });
  });

  describe('enregistrerPosition', () => {
    it('tronque la position à la seconde entière', async () => {
      const double = clientDouble({});
      const upserts: unknown[] = [];
      double.client.from = () =>
        ({ upsert: (v: unknown) => (upserts.push(v), Promise.resolve({ data: null })) }) as never;

      TestBed.configureTestingModule({
        providers: [ContenuService, { provide: SUPABASE, useValue: double.client }],
      });

      await TestBed.inject(ContenuService).enregistrerPosition('l-1', 42.87);

      // `position_video_s` est un integer en base : un flottant serait rejeté.
      expect(upserts[0]).toMatchObject({ id_lecon: 'l-1', position_video_s: 42 });
    });
  });
});
