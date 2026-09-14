import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DomaineExpediteur, EssaiFacturation } from '../../../core/finance/finance.model';
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
  domaines: () => DomaineExpediteur[] | null;
  erreurDns: () => string | null;
  lireEnregistrementsDns(): Promise<void>;
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
  let reponseDns: { domaines?: DomaineExpediteur[]; erreur?: string };
  let destinatairesDemandes: (string | undefined)[];

  async function creer(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Parametres],
      providers: [
        {
          provide: FinanceService,
          useValue: {
            envoyerFactureEssai: (destinataire?: string) => {
              destinatairesDemandes.push(destinataire);
              return Promise.resolve(reponse);
            },
            enregistrementsExpediteur: () => Promise.resolve(reponseDns),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Parametres);
    interne = fixture.componentInstance as unknown as Interne;
    fixture.detectChanges();
  }

  beforeEach(() => {
    reponse = { resultat: resultat() };
    reponseDns = {
      domaines: [
        {
          domaine: 'tradingcorp.fr',
          authentifie: true,
          fournisseur: 'Cloudflare',
          authentifieLe: '2026-09-02T01:35:01+00:00',
          enregistrements: [
            { nom: 'brevo._domainkey', type: 'TXT', valeur: 'k=rsa; p=MIGf…', pose: false },
            { nom: 'tradingcorp.fr', type: 'TXT', valeur: 'brevo-code:abc', pose: true },
          ],
        },
      ],
    };
    destinatairesDemandes = [];
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

  it('laisse la fonction choisir l’adresse quand le champ est vide', async () => {
    // Le composant ne connaît pas l'adresse du compte — seule la fonction la
    // lit, depuis le jeton. Envoyer une chaîne vide plutôt qu'inventer.
    await creer();

    await interne.essayerFacturation();

    expect(destinatairesDemandes).toEqual(['']);
  });

  it('transmet le destinataire saisi', async () => {
    await creer();
    const champ = fixture.nativeElement.querySelector('#essai-destinataire') as HTMLInputElement;
    champ.value = 'client@exemple.fr';
    champ.dispatchEvent(new Event('input'));

    await interne.essayerFacturation();

    expect(destinatairesDemandes).toEqual(['client@exemple.fr']);
  });

  it('montre la valeur exacte à recopier et ce qui manque', async () => {
    // Tout l'intérêt de cet écran : distinguer ce qui est en place de ce qui
    // reste à poser. Un tableau qui afficherait tout pareil ne servirait à rien.
    await creer();

    await interne.lireEnregistrementsDns();
    fixture.detectChanges();

    const texte = fixture.nativeElement.textContent;
    expect(texte).toContain('brevo._domainkey');
    expect(texte).toContain('À poser');
    expect(texte).toContain('En place');
  });

  it('signale un domaine absent plutôt qu’un tableau vide', async () => {
    reponseDns = { erreur: 'Brevo a répondu 401.' };
    await creer();

    await interne.lireEnregistrementsDns();

    expect(interne.domaines()).toBeNull();
    expect(interne.erreurDns()).toContain('401');
  });

  it('dit « rien à poser » sur un domaine déjà authentifié', async () => {
    // Le cas réel : Brevo rend `records: null` quand il n'attend plus rien.
    // Un tableau sans lignes laisserait croire à une panne de lecture.
    reponseDns = {
      domaines: [
        {
          domaine: 'tradingcorp.fr',
          authentifie: true,
          fournisseur: 'Cloudflare',
          authentifieLe: '2026-09-02T01:35:01+00:00',
          enregistrements: [],
        },
      ],
    };
    await creer();

    await interne.lireEnregistrementsDns();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Rien à poser');
  });

  it('nomme le fournisseur DNS, qui dit où poser un enregistrement', async () => {
    // L'information qui manquait : le nom de domaine est acheté chez l'un, la
    // zone servie par l'autre, et modifier la mauvaise ne produit aucun effet.
    await creer();

    await interne.lireEnregistrementsDns();
    fixture.detectChanges();

    const texte = fixture.nativeElement.textContent;
    expect(texte).toContain('Cloudflare');
    expect(texte).toContain('2 septembre 2026');
  });
});
