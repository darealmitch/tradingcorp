import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Facture } from '../../../core/commerce/facture.model';
import { MesFactures } from './mes-factures';

interface Interne {
  factures: () => Facture[];
  erreur: () => string | null;
  preparation: () => string | null;
  telecharger(f: Facture): Promise<void>;
  montant(f: Facture): string;
  date(f: Facture): string;
}

function facture(partiel: Partial<Facture> = {}): Facture {
  return {
    id_facture: 'f-1',
    numero: 'F2026-0001',
    designation: 'Formation TradingCorp',
    montant_centimes: 99700,
    devise: 'eur',
    date_emission: '2026-09-14T10:00:00Z',
    ...partiel,
  };
}

describe('MesFactures', () => {
  let fixture: ComponentFixture<MesFactures>;
  let interne: Interne;
  let listeRendue: Facture[];
  let lienRendu: { url?: string; erreur?: string };
  let ouvertures: string[];
  const ouvrirOriginal = window.open;

  async function creer(): Promise<void> {
    fixture = TestBed.createComponent(MesFactures);
    interne = fixture.componentInstance as unknown as Interne;
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    listeRendue = [facture()];
    lienRendu = { url: 'https://stockage/signe/facture.pdf' };
    ouvertures = [];
    // `window.open` ouvrirait une vraie fenêtre pendant les tests. Substitué à
    // la main plutôt qu'espionné : le projet ne dépend d'aucune API de
    // simulation particulière, et la restauration est explicite.
    window.open = ((url?: string | URL) => {
      ouvertures.push(String(url));
      return null;
    }) as typeof window.open;

    await TestBed.configureTestingModule({
      imports: [MesFactures],
      providers: [
        {
          provide: CommerceService,
          useValue: {
            chargerFactures: () => Promise.resolve(listeRendue),
            lienFacture: () => Promise.resolve(lienRendu),
          },
        },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    window.open = ouvrirOriginal;
  });

  it('affiche les factures du compte', async () => {
    await creer();
    expect(interne.factures().map((f) => f.numero)).toEqual(['F2026-0001']);
  });

  it('ouvre le lien signé dans un nouvel onglet', async () => {
    await creer();

    await interne.telecharger(facture());

    expect(ouvertures).toEqual(['https://stockage/signe/facture.pdf']);
    expect(interne.erreur()).toBeNull();
    // Le bouton doit redevenir actif, succès ou échec.
    expect(interne.preparation()).toBeNull();
  });

  it('signale un refus sans ouvrir d’onglet', async () => {
    // Le serveur refuse une facture qui n'est pas la sienne, ou pas encore
    // déposée : l'écran le dit au lieu d'ouvrir une page vide.
    lienRendu = { erreur: 'Cette facture n’est pas encore disponible.' };
    await creer();

    await interne.telecharger(facture());

    expect(ouvertures).toEqual([]);
    expect(interne.erreur()).toBe('Cette facture n’est pas encore disponible.');
    expect(interne.preparation()).toBeNull();
  });

  it('présente le montant en euros et la date en toutes lettres', async () => {
    await creer();

    // Le montant est stocké en centimes : 99700 ne doit jamais s'afficher tel quel.
    expect(interne.montant(facture())).toContain('997');
    expect(interne.date(facture())).toBe('14 septembre 2026');
  });

  it('reste lisible sans aucune facture', async () => {
    listeRendue = [];
    await creer();

    expect(interne.factures()).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Aucune facture pour l’instant');
  });
});
