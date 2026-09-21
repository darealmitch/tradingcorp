import {
  FactureEmise,
  PaiementLigne,
  compteDansCa,
  compteEnFacturation,
  cumulAnnee,
} from './finance.model';

/**
 * `compteDansCa` définit à elle seule ce qu'est le chiffre d'affaires affiché.
 * Une erreur ici ne casse rien visiblement : elle produit des montants faux,
 * durablement et sans alerte. D'où une couverture cas par cas.
 *
 * Fonction pure, sans base ni injection : ces tests ne montent aucun TestBed.
 */
function paiement(partiel: Partial<PaiementLigne> = {}): PaiementLigne {
  return {
    id_paiement: 'p-1',
    montant_centimes: 49900,
    devise: 'eur',
    statut: 'reussi',
    moyen_paiement: 'card',
    reference_transaction: 'cs_1',
    email: 'client@exemple.fr',
    date_paiement: '2026-07-01T10:00:00Z',
    mode_test: false,
    profils: { role: 'apprenant', est_test: false },
    ...partiel,
  };
}

describe('compteDansCa', () => {
  it("compte l'achat abouti d'un apprenant réel", () => {
    expect(compteDansCa(paiement())).toBe(true);
  });

  describe('statut du paiement', () => {
    it('écarte un paiement encore en attente', () => {
      expect(compteDansCa(paiement({ statut: 'en_attente' }))).toBe(false);
    });

    it('écarte un paiement échoué', () => {
      expect(compteDansCa(paiement({ statut: 'echoue' }))).toBe(false);
    });

    it('écarte un paiement remboursé — le revenu n’est plus acquis', () => {
      expect(compteDansCa(paiement({ statut: 'rembourse' }))).toBe(false);
    });
  });

  describe('origine du paiement', () => {
    it('écarte un paiement passé avec les clés de test Stripe', () => {
      expect(compteDansCa(paiement({ mode_test: true }))).toBe(false);
    });

    it('écarte un achat effectué par un compte de démonstration', () => {
      expect(compteDansCa(paiement({ profils: { role: 'apprenant', est_test: true } }))).toBe(
        false,
      );
    });

    it('écarte un achat effectué par un membre du staff', () => {
      expect(compteDansCa(paiement({ profils: { role: 'admin', est_test: false } }))).toBe(false);
      expect(compteDansCa(paiement({ profils: { role: 'formateur', est_test: false } }))).toBe(
        false,
      );
    });
  });

  it('conserve le paiement d’un compte supprimé — c’était un client réel', () => {
    // `paiements.id_profil` est en ON DELETE SET NULL : la pièce comptable
    // survit au compte. L'exclure ferait reculer un chiffre d'affaires déjà
    // encaissé, à chaque suppression de compte.
    expect(compteDansCa(paiement({ profils: null }))).toBe(true);
  });

  it('écarte un compte supprimé dont le paiement était en mode test', () => {
    // Le mode test prime : il ne s'agissait pas d'un vrai encaissement.
    expect(compteDansCa(paiement({ profils: null, mode_test: true }))).toBe(false);
  });
});

/**
 * `compteEnFacturation` est le pendant de `compteDansCa` pour les factures, et
 * son critère est nécessairement plus pauvre : une facture fige une identité,
 * elle ne porte pas le rôle de l'acheteur. Impossible d'y écarter un compte de
 * démonstration comme on le fait sur un paiement — seul le mode Stripe reste.
 */
function factureEmise(partiel: Partial<FactureEmise> = {}): FactureEmise {
  return {
    id_facture: 'f-1',
    numero: 'TRADINGCORP-0001',
    designation: 'Formation TradingCorp',
    montant_centimes: 99700,
    devise: 'eur',
    date_emission: '2026-09-14T10:00:00Z',
    id_profil: 'profil-1',
    client_nom: 'Client Exemple',
    client_email: 'client@exemple.fr',
    mode_test: false,
    ...partiel,
  };
}

describe('compteEnFacturation', () => {
  it('compte une vente réelle', () => {
    expect(compteEnFacturation(factureEmise())).toBe(true);
  });

  it('écarte une vente passée avec les clés de test Stripe', () => {
    expect(compteEnFacturation(factureEmise({ mode_test: true }))).toBe(false);
  });

  it('conserve la facture d’un compte supprimé', () => {
    // `factures.id_profil` est en ON DELETE SET NULL : la pièce comptable
    // survit au compte, l'obligation de conservation primant l'effacement.
    expect(compteEnFacturation(factureEmise({ id_profil: null }))).toBe(true);
  });
});

describe('cumulAnnee', () => {
  it('additionne les factures de l’exercice demandé', () => {
    const factures = [
      factureEmise({ numero: 'TRADINGCORP-0001', montant_centimes: 99700 }),
      factureEmise({ id_facture: 'f-2', numero: 'TRADINGCORP-0002', montant_centimes: 49900 }),
    ];

    expect(cumulAnnee(factures, 2026)).toBe(149600);
  });

  it('écarte les factures des autres exercices', () => {
    const factures = [
      factureEmise({ numero: 'TRADINGCORP-0001', date_emission: '2025-12-31T10:00:00Z' }),
      factureEmise({ id_facture: 'f-2', numero: 'TRADINGCORP-0002' }),
    ];

    expect(cumulAnnee(factures, 2026)).toBe(99700);
    expect(cumulAnnee(factures, 2025)).toBe(99700);
  });

  it('rattache une vente du 1er janvier à 0 h 30, heure de Paris, à l’année qui commence', () => {
    // 23 h 30 UTC le 31 décembre, c'est 0 h 30 le 1er janvier à Paris (UTC+1
    // en hiver). Lue en UTC, cette vente tomberait dans l'exercice précédent.
    const nouvelAn = factureEmise({ date_emission: '2026-12-31T23:30:00Z' });

    expect(cumulAnnee([nouvelAn], 2027)).toBe(99700);
    expect(cumulAnnee([nouvelAn], 2026)).toBe(0);
  });

  it('garde au 31 décembre une vente de la soirée, heure de Paris', () => {
    // 22 h 30 UTC, soit 23 h 30 à Paris : toujours le 31 décembre.
    const soiree = factureEmise({ date_emission: '2026-12-31T22:30:00Z' });

    expect(cumulAnnee([soiree], 2026)).toBe(99700);
  });

  it('rend zéro sur une liste vide', () => {
    expect(cumulAnnee([], 2026)).toBe(0);
  });
});
