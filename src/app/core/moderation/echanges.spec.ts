import { MessageDeFil, aRepondre, compterARepondre, regrouperEchanges } from './echanges';

/**
 * La règle « à répondre » commande la pastille de la navigation et l'ordre de
 * l'onglet des échanges privés : un échange qui attend l'équipe ne doit pas se
 * perdre au milieu de ceux auxquels elle a déjà répondu — ni une réponse de
 * l'équipe laisser croire qu'il reste quelque chose à faire.
 */

function message(champs: Partial<MessageDeFil>): MessageDeFil {
  return {
    id_commentaire: 'm-1',
    id_parent: null,
    par_equipe: false,
    est_prive: true,
    date_creation: '2026-10-05T10:00:00Z',
    ...champs,
  };
}

/** Une question publique, une réponse privée de l'équipe, puis la réponse privée de l'élève. */
const QUESTION = message({
  id_commentaire: 'q',
  est_prive: false,
  date_creation: '2026-10-01T09:00:00Z',
});
const EQUIPE = message({
  id_commentaire: 'e',
  id_parent: 'q',
  par_equipe: true,
  date_creation: '2026-10-02T09:00:00Z',
});
const ELEVE = message({
  id_commentaire: 'l',
  id_parent: 'q',
  date_creation: '2026-10-03T09:00:00Z',
});

describe('aRepondre', () => {
  it('attend l’équipe quand l’élève a écrit en dernier', () => {
    expect(aRepondre([EQUIPE, ELEVE])).toBe(true);
  });

  it('n’attend plus rien quand l’équipe a répondu en dernier', () => {
    const relance = message({
      id_commentaire: 'e2',
      id_parent: 'q',
      par_equipe: true,
      date_creation: '2026-10-04T09:00:00Z',
    });

    expect(aRepondre([EQUIPE, ELEVE, relance])).toBe(false);
  });

  it('lit l’ordre des dates, pas celui de la liste', () => {
    expect(aRepondre([ELEVE, EQUIPE])).toBe(true);
  });

  it('range une seconde ronde avant la fraction qui la suit', () => {
    // Postgres n'écrit pas la fraction d'une seconde ronde : « …:56+00:00 »
    // précède « …:56.5+00:00 », ce que l'ordre linguistique inverse.
    const equipe = message({
      id_commentaire: 'e',
      par_equipe: true,
      date_creation: '2026-10-05T08:34:56+00:00',
    });
    const eleve = message({ id_commentaire: 'l', date_creation: '2026-10-05T08:34:56.5+00:00' });

    expect(aRepondre([eleve, equipe])).toBe(true);
  });

  it('attend l’équipe sur un fil rendu privé, tant qu’elle n’y a pas répondu', () => {
    expect(aRepondre([message({ id_commentaire: 'q2' })])).toBe(true);
  });

  it('n’attend rien d’un échange vide', () => {
    expect(aRepondre([])).toBe(false);
  });
});

describe('compterARepondre', () => {
  it('compte les échanges, pas les messages', () => {
    const autreFil = [
      message({ id_commentaire: 'x', id_parent: 'q2', date_creation: '2026-10-06T09:00:00Z' }),
      message({ id_commentaire: 'y', id_parent: 'q2', date_creation: '2026-10-07T09:00:00Z' }),
    ];

    expect(compterARepondre([EQUIPE, ELEVE, ...autreFil])).toBe(2);
  });
});

describe('regrouperEchanges', () => {
  it('rattache chaque réponse à son message d’origine, dans l’ordre d’écriture', () => {
    const [echange] = regrouperEchanges([ELEVE, QUESTION, EQUIPE]);

    expect(echange.fil.id_commentaire).toBe('q');
    expect(echange.messages.map((m) => m.id_commentaire)).toEqual(['e', 'l']);
    expect(echange.filPrive).toBe(false);
  });

  it('écarte un échange dont le message d’origine manque', () => {
    expect(regrouperEchanges([EQUIPE, ELEVE])).toEqual([]);
  });

  it('fait passer devant les échanges qui attendent une réponse', () => {
    const repondu = [
      message({ id_commentaire: 'q3', date_creation: '2026-10-09T09:00:00Z' }),
      message({
        id_commentaire: 'r3',
        id_parent: 'q3',
        par_equipe: true,
        date_creation: '2026-10-09T10:00:00Z',
      }),
    ];

    const echanges = regrouperEchanges([...repondu, QUESTION, EQUIPE, ELEVE]);

    expect(echanges.map((e) => e.fil.id_commentaire)).toEqual(['q', 'q3']);
    expect(echanges.map((e) => e.aRepondre)).toEqual([true, false]);
  });

  it('ne compte que les messages privés pour dire s’il faut répondre', () => {
    // Plus récente, une réponse publique d'un autre élève n'appelle rien de
    // l'équipe dans l'échange privé.
    const relance = message({
      id_commentaire: 'e2',
      id_parent: 'q',
      par_equipe: true,
      date_creation: '2026-10-04T09:00:00Z',
    });
    const publique = message({
      id_commentaire: 'p',
      id_parent: 'q',
      est_prive: false,
      date_creation: '2026-10-08T09:00:00Z',
    });

    const [echange] = regrouperEchanges([QUESTION, EQUIPE, ELEVE, relance, publique]);

    expect(echange.aRepondre).toBe(false);
  });
});
