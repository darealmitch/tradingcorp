import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { FactureEmise } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';
import { Facturation } from './facturation';

interface Interne {
  factures: () => FactureEmise[];
  erreur: () => string | null;
  comptabilisees: () => string;
  exclues: () => number;
  dernierNumero: () => string;
  client(f: FactureEmise): string;
  telecharger(f: FactureEmise): Promise<void>;
}

function facture(partiel: Partial<FactureEmise> = {}): FactureEmise {
  return {
    id_facture: 'f-1',
    numero: 'F2026-0002',
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

describe('Facturation', () => {
  let fixture: ComponentFixture<Facturation>;
  let interne: Interne;
  let listeRendue: FactureEmise[];
  let lienRendu: { url?: string; erreur?: string };
  let ouvertures: string[];
  const ouvrirOriginal = window.open;

  async function creer(): Promise<void> {
    fixture = TestBed.createComponent(Facturation);
    interne = fixture.componentInstance as unknown as Interne;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    listeRendue = [facture()];
    lienRendu = { url: 'https://stockage/signe/facture.pdf' };
    ouvertures = [];
    window.open = ((url?: string | URL) => {
      ouvertures.push(String(url));
      return null;
    }) as typeof window.open;

    await TestBed.configureTestingModule({
      imports: [Facturation],
      providers: [
        {
          provide: FinanceService,
          useValue: { listerFactures: () => Promise.resolve(listeRendue) },
        },
        { provide: CommerceService, useValue: { lienFacture: () => Promise.resolve(lienRendu) } },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    window.open = ouvrirOriginal;
  });

  it('montre l’identité de l’acheteur, que « Mes factures » n’affiche pas', async () => {
    await creer();

    expect(interne.factures().length).toBe(1);
    expect(fixture.nativeElement.textContent).toContain('Client Exemple');
  });

  it('retombe sur l’adresse quand le nom manque', async () => {
    // Un paiement Stripe sans nom saisi : la facture existe quand même, et la
    // ligne doit rester identifiable.
    listeRendue = [facture({ client_nom: null })];
    await creer();

    expect(interne.client(listeRendue[0])).toBe('client@exemple.fr');
  });

  it('écarte les ventes de test des totaux sans les masquer', async () => {
    listeRendue = [
      facture(),
      facture({ id_facture: 'f-2', numero: 'F2026-0003', mode_test: true }),
    ];
    await creer();

    // Les deux lignes restent visibles : une facture émise ne disparaît pas
    // d'un registre, elle s'y signale.
    expect(interne.factures().length).toBe(2);
    expect(interne.comptabilisees()).toBe('1 / 2');
    expect(interne.exclues()).toBe(1);
  });

  it('affiche le dernier numéro attribué', async () => {
    // Repère de continuité de la numérotation (art. 242 nonies A, annexe II du
    // CGI) : la liste étant triée du plus récent au plus ancien, c'est le
    // premier élément.
    await creer();

    expect(interne.dernierNumero()).toBe('F2026-0002');
  });

  it('ouvre le lien signé dans un nouvel onglet', async () => {
    await creer();

    await interne.telecharger(facture());

    expect(ouvertures).toEqual(['https://stockage/signe/facture.pdf']);
    expect(interne.erreur()).toBeNull();
  });

  it('reste lisible sans aucune facture', async () => {
    listeRendue = [];
    await creer();

    expect(interne.dernierNumero()).toBe('—');
    expect(fixture.nativeElement.textContent).toContain('Aucune facture émise');
  });
});
