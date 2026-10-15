import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { ComptesService } from '../../../core/comptes/comptes.service';
import {
  EtatLecon,
  LeconEtape,
  LeconResume,
  ModuleParcours,
} from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { FinanceService } from '../../../core/finance/finance.service';
import { ModerationService } from '../../../core/moderation/moderation.service';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import {
  Accueil,
  INTERVALLE_ACTIVATION_MS,
  VERIFICATIONS_ACTIVATION,
  etapesEntonnoir,
  lignesProvenance,
  taux,
} from './accueil';

/**
 * Tableau de bord d'un élève. Inscrit, il reprend où il s'est arrêté. Sans
 * achat, il voit l'encart d'achat — et, quand des leçons lui sont offertes,
 * la même disposition qu'un inscrit sur ces seules leçons : celle à suivre,
 * sa progression, le lien vers le parcours.
 */

function module(champs: Partial<ModuleParcours> = {}): ModuleParcours {
  return {
    id_section: 's-1',
    titre: 'Développement personnel',
    description: null,
    accroche: null,
    introduction: null,
    objectifs: null,
    position: 1,
    total_lecons: 6,
    lecons_terminees: 0,
    etat: 'debloque',
    lecons_offertes: 2,
    ...champs,
  };
}

function etape(id: string, titre: string, etat: EtatLecon, offerte: boolean, position: number) {
  return {
    id_lecon: id,
    titre,
    type: 'video',
    position,
    duree_s: 600,
    a_pdf: false,
    video_termine: false,
    etat,
    offerte,
  } satisfies LeconEtape;
}

/** Introduction, deux leçons offertes, puis une leçon réservée aux inscrits. */
function etapes(etatA: EtatLecon, etatB: EtatLecon): LeconEtape[] {
  return [
    { ...etape('l-intro', 'Introduction', 'debloque', true, 0), type: 'intro' },
    etape('l-a', '1.1 Le processus', etatA, true, 1),
    etape('l-b', '1.2 Confiance en soi', etatB, true, 2),
    etape('l-c', '1.4 Lis', 'verrouille', false, 3),
  ];
}

const PROCHAINE: LeconResume = {
  id_lecon: 'l-7',
  id_section: 's-2',
  titre: '2.3 Le budget',
  type: 'video',
  position: 3,
  duree_s: 600,
  est_publiee: true,
  est_decouverte: false,
  video_provider: 'bunny',
  video_provider_id: null,
  a_video_url: true,
  video_hebergee: true,
  pdf_public_id: null,
};

interface Scenario {
  inscrit?: boolean;
  modules?: ModuleParcours[];
  etapes?: LeconEtape[];
}

async function monter({ inscrit = false, modules = [], etapes: lignes = [] }: Scenario) {
  const chargerParcours = vi.fn(() =>
    Promise.resolve({ id_formation: 'f-1', titre: 'Formation', inscrit, modules }),
  );
  const etatsLecons = vi.fn(() => Promise.resolve(lignes));
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
      },
      {
        provide: AuthService,
        useValue: { role: signal('apprenant'), profil: signal({ prenom: 'Yannick' }) },
      },
      {
        provide: CommerceService,
        useValue: {
          chargerInscriptions: () =>
            Promise.resolve(
              inscrit ? [{ id_inscription: 'i-1', id_formation: 'f-1', statut: 'active' }] : [],
            ),
        },
      },
      {
        provide: ContenuService,
        useValue: {
          maProgression: () =>
            Promise.resolve(inscrit ? { terminees: 6, total: 103 } : { terminees: 0, total: 0 }),
          prochainesLecons: () => Promise.resolve(inscrit ? [PROCHAINE] : []),
          chargerParcours,
          etatsLecons,
        },
      },
      { provide: PilotageService, useValue: {} },
      { provide: ModerationService, useValue: {} },
      { provide: ComptesService, useValue: {} },
      { provide: FinanceService, useValue: {} },
    ],
  });
  const fixture: ComponentFixture<Accueil> = TestBed.createComponent(Accueil);
  // Le chemin découverte enchaîne plusieurs lectures (inscriptions, parcours,
  // puis états des leçons) : on laisse chaque promesse se résoudre.
  for (let i = 0; i < 6; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resoudre) => setTimeout(resoudre, 0));
  }
  const page = fixture.nativeElement as HTMLElement;
  return { page, chargerParcours, etatsLecons };
}

function texte(page: HTMLElement): string {
  return page.textContent?.replace(/\s+/g, ' ') ?? '';
}

/** Le lien dont le libellé est exactement `libelle`. */
function lien(page: HTMLElement, libelle: string): HTMLAnchorElement | undefined {
  return [...page.querySelectorAll<HTMLAnchorElement>('a')].find(
    (a) => a.textContent?.trim() === libelle,
  );
}

function progression(page: HTMLElement): string | undefined {
  return page.querySelector<HTMLElement>('app-barre-progression .part')?.style.width;
}

describe('Tableau de bord — élève', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('parle à l’élève de sa progression, pas de « sa plateforme »', async () => {
    const { page } = await monter({ inscrit: true });

    expect(texte(page)).toContain("Voici où tu en es aujourd'hui.");
    expect(texte(page)).not.toContain('ta plateforme');
  });

  it('inscrit : reprend où il s’est arrêté, sans encart d’achat ni découverte', async () => {
    const { page, chargerParcours } = await monter({ inscrit: true });

    expect(texte(page)).toContain('Reprendre où tu t');
    expect(lien(page, 'Reprendre')?.getAttribute('href')).toBe('/parcours/s-2/lecon/l-7');
    expect(texte(page)).not.toContain('Débloque ta formation');
    expect(chargerParcours).not.toHaveBeenCalled();
  });

  it('sans achat ni leçon offerte : seul l’encart d’achat, inchangé', async () => {
    const { page } = await monter({
      modules: [module({ lecons_offertes: 0, etat: 'verrouille' })],
    });

    expect(texte(page)).not.toContain('Tes leçons offertes');
    expect(lien(page, 'Découvrir la formation')?.getAttribute('href')).toBe('/espace/formations');
  });

  it('découverte, rien commencé : « Commencer » mène à la première leçon offerte', async () => {
    const { page, etatsLecons } = await monter({
      modules: [module(), module({ id_section: 's-2', position: 2, lecons_offertes: 0 })],
      etapes: etapes('debloque', 'debloque'),
    });

    expect(etatsLecons).toHaveBeenCalledTimes(1);
    expect(texte(page)).toContain('Tes leçons offertes');
    expect(texte(page)).toContain('1.1 Le processus');
    expect(texte(page)).toContain('Leçon offerte 1 sur 2');
    expect(lien(page, 'Commencer')?.getAttribute('href')).toBe('/parcours/s-1/lecon/l-a');
    expect(progression(page)).toBe('0%');
    expect(lien(page, 'Voir mon parcours')?.getAttribute('href')).toBe('/parcours');
    expect(lien(page, 'Débloquer la formation')?.getAttribute('href')).toBe('/espace/formations');
  });

  it('découverte, une leçon suivie : « Reprendre » mène à la suivante', async () => {
    const { page } = await monter({
      modules: [module()],
      etapes: etapes('termine', 'debloque'),
    });

    expect(texte(page)).toContain('Leçon offerte 2 sur 2');
    expect(lien(page, 'Reprendre')?.getAttribute('href')).toBe('/parcours/s-1/lecon/l-b');
    expect(progression(page)).toBe('50%');
  });

  it('découverte, tout suivi : le dit, et laisse l’achat comme suite', async () => {
    const { page } = await monter({
      modules: [module()],
      etapes: etapes('termine', 'termine'),
    });

    expect(texte(page)).toContain('Tu as suivi les 2 leçons offertes.');
    expect(lien(page, 'Reprendre')).toBeUndefined();
    expect(lien(page, 'Commencer')).toBeUndefined();
    expect(progression(page)).toBe('100%');
    expect(lien(page, 'Débloquer la formation')?.getAttribute('href')).toBe('/espace/formations');
  });
});

/**
 * Retour de Stripe. L'accès s'ouvre quand le webhook a enregistré
 * l'inscription : l'écran ne doit dire « ouvert » qu'à ce moment-là, et dire
 * clairement ce qu'il en est si cela tarde.
 */
describe('Tableau de bord — retour de paiement', () => {
  const ACTIVE = { id_inscription: 'i-1', id_formation: 'f-1', statut: 'active' };

  /**
   * `inscritAuAppel` : à partir de quel appel la base rend l'inscription (le
   * premier est la lecture du tableau de bord ; les suivants, les
   * vérifications). `null` : jamais pendant le test.
   */
  async function monterRetour(achat: 'succes' | 'annule', inscritAuAppel: number | null) {
    let appels = 0;
    const estInscrit = (): boolean => inscritAuAppel !== null && appels >= inscritAuAppel;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ achat }) } },
        },
        {
          provide: AuthService,
          useValue: { role: signal('apprenant'), profil: signal({ prenom: 'Lea' }) },
        },
        {
          provide: CommerceService,
          useValue: {
            chargerInscriptions: () => {
              appels++;
              return Promise.resolve(estInscrit() ? [ACTIVE] : []);
            },
          },
        },
        {
          provide: ContenuService,
          useValue: {
            maProgression: () => Promise.resolve({ terminees: 0, total: 103 }),
            prochainesLecons: () => Promise.resolve(estInscrit() ? [PROCHAINE] : []),
            chargerParcours: () =>
              Promise.resolve({ id_formation: 'f-1', titre: 'F', inscrit: false, modules: [] }),
            etatsLecons: () => Promise.resolve([]),
          },
        },
        { provide: PilotageService, useValue: {} },
        { provide: ModerationService, useValue: {} },
        { provide: ComptesService, useValue: {} },
        { provide: FinanceService, useValue: {} },
      ],
    });
    const fixture = TestBed.createComponent(Accueil);
    const avancer = async (ms: number): Promise<void> => {
      await vi.advanceTimersByTimeAsync(ms);
      fixture.detectChanges();
    };
    fixture.detectChanges();
    await avancer(0);
    await avancer(0);
    return { page: fixture.nativeElement as HTMLElement, avancer };
  }

  beforeEach(() => vi.useFakeTimers());

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('n’annonce l’accès ouvert qu’une fois l’inscription enregistrée', async () => {
    // Le webhook arrive à la deuxième vérification.
    const { page, avancer } = await monterRetour('succes', 3);

    expect(texte(page)).toContain('Ouverture de ton accès en cours');
    expect(texte(page)).not.toContain('est ouvert');

    await avancer(INTERVALLE_ACTIVATION_MS);
    expect(texte(page)).toContain('Ouverture de ton accès en cours');

    await avancer(INTERVALLE_ACTIVATION_MS);
    expect(texte(page)).toContain('ton accès à la formation est ouvert');
    expect(texte(page)).toContain('Reprendre où tu t');
    expect(texte(page)).not.toContain('Débloque ta formation');
  });

  it('dit tout de suite que l’accès est ouvert quand le webhook a déjà fait son œuvre', async () => {
    const { page } = await monterRetour('succes', 1);

    expect(texte(page)).toContain('ton accès à la formation est ouvert');
  });

  it('explique un retard au lieu de laisser l’élève devant « Débloque ta formation »', async () => {
    const { page, avancer } = await monterRetour('succes', null);

    await avancer(INTERVALLE_ACTIVATION_MS * VERIFICATIONS_ACTIVATION);

    expect(texte(page)).toContain('prend plus de temps que prévu');
    expect(texte(page)).toContain('une notification te préviendra');
    expect(texte(page)).not.toContain('est ouvert');
  });

  it('après une annulation, rassure et propose de reprendre l’achat', async () => {
    const { page } = await monterRetour('annule', null);

    expect(texte(page)).toContain("aucun montant n'a été débité");
    expect(lien(page, "Reprendre l'achat")?.getAttribute('href')).toBe('/espace/formations');
  });
});

describe('Tableau de bord — entonnoir de conversion', () => {
  it('suit le parcours du visiteur, de l’accueil au paiement', () => {
    const etapes = etapesEntonnoir({
      depuis: '2026-09-15',
      jours: 30,
      vues_accueil: 400,
      vues_programme: 120,
      clics: 60,
      vues_inscription: 50,
      comptes_crees: 20,
      vues_achat: 15,
      debuts_paiement: 4,
      paiements: 2,
      remboursements: 0,
      clics_par_bouton: {},
    });

    expect(etapes.map((e) => e.valeur)).toEqual([400, 120, 60, 50, 20, 15, 4, 2]);
    expect(etapes[0].libelle).toBe('Vues de l’accueil');
    expect(etapes.at(-1)?.libelle).toBe('Paiements encaissés');
  });

  it('range les provenances dans un ordre fixe, sans les vides', () => {
    const base = {
      depuis: '2026-09-15',
      jours: 30,
      vues_accueil: 0,
      vues_programme: 0,
      clics: 0,
      vues_inscription: 0,
      comptes_crees: 0,
      vues_achat: 0,
      debuts_paiement: 0,
      paiements: 0,
      remboursements: 0,
      clics_par_bouton: {},
    };

    const lignes = lignesProvenance({
      ...base,
      provenances: {
        'meta-ads': { arrivees: 80, inscriptions: 2 },
        direct: { arrivees: 30, inscriptions: 1 },
        email: { arrivees: 0, inscriptions: 0 },
      },
    });

    expect(lignes).toEqual([
      {
        libelle: 'Accès direct (adresse tapée, favori, application)',
        arrivees: 30,
        inscriptions: 1,
      },
      { libelle: 'Annonces Meta (Facebook, Instagram)', arrivees: 80, inscriptions: 2 },
    ]);
    // Une base sans la migration ne renvoie pas le champ : rien à afficher.
    expect(lignesProvenance(base)).toEqual([]);
  });

  it('calcule un taux, et n’en invente pas sur zéro', () => {
    expect(taux(20, 400)?.replace(/\u00a0/g, ' ')).toBe('5 %');
    expect(taux(1, 3)?.replace(/\u00a0/g, ' ')).toBe('33,3 %');
    expect(taux(3, 0)).toBeNull();
  });
});
