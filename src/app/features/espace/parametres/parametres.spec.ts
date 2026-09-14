import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EssaiFacturation } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';
import { Parametres } from './parametres';

/**
 * Ce que ces tests protègent : **un essai qui échoue ne doit jamais ressembler
 * à un essai réussi.**
 *
 * C'est tout l'intérêt de ce bouton. Il sert à répondre « l'e-mail part-il ? »
 * avant qu'une vraie vente ne pose la question ; un écran qui annoncerait
 * « envoyé » sur un refus de Brevo serait pire que pas de bouton du tout.
 */

interface Interne {
  essai: () => EssaiFacturation | null;
  erreurEssai: () => string | null;
  envoiEnCours: () => boolean;
  essayerFacturation(): Promise<void>;
}

function resultat(partiel: Partial<EssaiFacturation> = {}): EssaiFacturation {
  return {
    destinataire: 'admin@tradingcorp.fr',
    numero: 'ESSAI-2026-09-14',
    vendeur: true,
    brevo_configure: true,
    envoye: true,
    ...partiel,
  };
}

describe('Parametres — essai de facturation', () => {
  let fixture: ComponentFixture<Parametres>;
  let interne: Interne;
  let reponse: { resultat?: EssaiFacturation; erreur?: string };

  async function creer(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Parametres],
      providers: [
        {
          provide: FinanceService,
          useValue: { envoyerFactureEssai: () => Promise.resolve(reponse) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Parametres);
    interne = fixture.componentInstance as unknown as Interne;
    fixture.detectChanges();
  }

  beforeEach(() => {
    reponse = { resultat: resultat() };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('annonce le destinataire et le numéro d’essai', async () => {
    await creer();

    await interne.essayerFacturation();
    fixture.detectChanges();

    expect(interne.essai()?.numero).toBe('ESSAI-2026-09-14');
    expect(interne.erreurEssai()).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('admin@tradingcorp.fr');
  });

  it('rapporte le motif du refus plutôt qu’un échec muet', async () => {
    reponse = { erreur: 'BREVO_API_KEY absente des secrets : aucun e-mail ne peut partir.' };
    await creer();

    await interne.essayerFacturation();

    expect(interne.essai()).toBeNull();
    expect(interne.erreurEssai()).toContain('BREVO_API_KEY');
  });

  it('ne conclut pas au succès sur une réponse qui dit le contraire', async () => {
    // Le cas qui compte : la fonction a répondu 502 avec un corps exploitable.
    // Lire le seul `erreur` laisserait passer `envoye: false` pour un succès.
    reponse = { resultat: resultat({ envoye: false, brevo_configure: false }) };
    await creer();

    await interne.essayerFacturation();

    expect(interne.essai()).toBeNull();
    expect(interne.erreurEssai()).not.toBeNull();
  });

  it('rend la main après l’essai, quel qu’en soit le sort', async () => {
    await creer();

    await interne.essayerFacturation();

    expect(interne.envoiEnCours()).toBe(false);
  });
});
