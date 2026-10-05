import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  DERNIERE_MISE_A_JOUR,
  MiseAJourConditions,
  ResultatAnnonce,
} from '../../../core/conditions/conditions.model';
import { ConditionsService } from '../../../core/conditions/conditions.service';
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
        { provide: ConditionsService, useValue: { annoncer: () => Promise.resolve({}) } },
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

/**
 * L'annonce d'une mise à jour des conditions touche chaque compte, par e-mail :
 * rien ne doit partir à tous sans un second geste, l'essai ne doit viser que
 * les comptes de test, et le bilan doit dire ce qui est réellement parti — un
 * e-mail refusé ne se rattrape pas en relançant l'envoi.
 */
interface InterneAnnonce {
  envoyerEssaiAnnonce(): Promise<void>;
  demanderEnvoiAnnonce(): void;
  confirmerEnvoiAnnonce(): Promise<void>;
  annoncePrete: () => boolean;
}

describe('Parametres — annonce d’une mise à jour des conditions', () => {
  let fixture: ComponentFixture<Parametres>;
  let interne: InterneAnnonce;
  let appels: { mode: string; miseAJour: MiseAJourConditions }[];
  let reponse: { resultat?: ResultatAnnonce; erreur?: string };

  function bilan(partiel: Partial<ResultatAnnonce>): ResultatAnnonce {
    return {
      mode: 'essai',
      notifies: 1,
      courriels_envoyes: 1,
      courriels_echoues: 0,
      deja_informes: false,
      ...partiel,
    };
  }

  async function creer(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [Parametres],
      providers: [
        {
          provide: FinanceService,
          useValue: {
            envoyerFactureEssai: () => Promise.resolve({}),
            enregistrementsExpediteur: () => Promise.resolve({}),
          },
        },
        {
          provide: ConditionsService,
          useValue: {
            annoncer: (mode: string, miseAJour: MiseAJourConditions) => {
              appels.push({ mode, miseAJour });
              return Promise.resolve(reponse);
            },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(Parametres);
    interne = fixture.componentInstance as unknown as InterneAnnonce;
    fixture.detectChanges();
  }

  function texte(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function bouton(libelle: string): HTMLButtonElement | undefined {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === libelle,
    );
  }

  beforeEach(() => {
    appels = [];
    reponse = { resultat: bilan({}) };
  });

  afterEach(() => TestBed.resetTestingModule());

  it('propose la dernière mise à jour, pré-remplie', async () => {
    await creer();
    const page = fixture.nativeElement as HTMLElement;

    expect((page.querySelector('#annonce-date') as HTMLInputElement).value).toBe('2026-10-05');
    expect((page.querySelector('#annonce-resume') as HTMLTextAreaElement).value).toContain(
      '« Léa M. »',
    );
    const coches = [...page.querySelectorAll('.parametres-documents input')].map(
      (c) => (c as HTMLInputElement).checked,
    );
    expect(coches).toEqual([true, true, false]);
  });

  it('envoie l’essai aux comptes de test, avec ce qui est à l’écran', async () => {
    await creer();

    await interne.envoyerEssaiAnnonce();
    fixture.detectChanges();

    expect(appels).toEqual([
      {
        mode: 'essai',
        miseAJour: {
          date: '2026-10-05',
          documents: ['cgu', 'confidentialite'],
          resume: DERNIERE_MISE_A_JOUR.resume,
        },
      },
    ]);
    expect(texte()).toContain(
      'Essai envoyé à 1 compte de test : notification posée, 1 e-mail parti.',
    );
  });

  it('n’envoie à tous qu’au second geste', async () => {
    reponse = { resultat: bilan({ mode: 'envoi', notifies: 27, courriels_envoyes: 27 }) };
    await creer();

    bouton('Envoyer à tous les utilisateurs')?.click();
    fixture.detectChanges();
    expect(appels).toEqual([]);
    expect(bouton('Confirmer l’envoi à tous')).toBeDefined();

    await interne.confirmerEnvoiAnnonce();
    fixture.detectChanges();

    expect(appels.map((a) => a.mode)).toEqual(['envoi']);
    expect(texte()).toContain(
      'Annonce envoyée à 27 comptes : notification posée, 27 e-mails partis.',
    );
    expect(bouton('Confirmer l’envoi à tous')).toBeUndefined();
  });

  it('dit quand tout le monde avait déjà été prévenu', async () => {
    reponse = {
      resultat: bilan({ mode: 'envoi', notifies: 0, courriels_envoyes: 0, deja_informes: true }),
    };
    await creer();

    interne.demanderEnvoiAnnonce();
    await interne.confirmerEnvoiAnnonce();
    fixture.detectChanges();

    expect(texte()).toContain('rien n’est reparti');
  });

  it('signale les e-mails refusés sans les confondre avec un succès', async () => {
    reponse = {
      resultat: bilan({ mode: 'envoi', notifies: 27, courriels_envoyes: 25, courriels_echoues: 2 }),
    };
    await creer();

    interne.demanderEnvoiAnnonce();
    await interne.confirmerEnvoiAnnonce();
    fixture.detectChanges();

    const alerte = (fixture.nativeElement as HTMLElement).querySelector('.alerte[role="status"]');
    expect(alerte?.textContent).toContain('2 e-mails refusés par Brevo');
    expect(alerte?.classList.contains('est-succes')).toBe(false);
  });

  it('rapporte le motif d’un refus', async () => {
    reponse = { erreur: 'Aucun compte de test : marque un compte comme compte de test.' };
    await creer();

    await interne.envoyerEssaiAnnonce();
    fixture.detectChanges();

    expect(texte()).toContain('Aucun compte de test');
  });

  it('ne laisse rien partir sans document coché', async () => {
    await creer();
    const page = fixture.nativeElement as HTMLElement;

    for (const case_ of page.querySelectorAll<HTMLInputElement>('.parametres-documents input')) {
      if (case_.checked) {
        case_.click();
      }
    }
    fixture.detectChanges();

    expect(interne.annoncePrete()).toBe(false);
    expect(bouton('Envoyer un essai aux comptes de test')?.disabled).toBe(true);
    expect(bouton('Envoyer à tous les utilisateurs')?.disabled).toBe(true);
    await interne.envoyerEssaiAnnonce();
    expect(appels).toEqual([]);
  });
});
