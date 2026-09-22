import { PaiementLigne, compteDansCa } from './finance.model';

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
