import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { FicheApprenant, LeconSuivie } from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import { ParcoursApprenant } from './parcours-apprenant';

/**
 * `strictTemplates` n'étant pas activé, une compilation verte ne prouve pas que
 * le gabarit tient : la page est donc montée pour de bon, avec un parcours
 * réaliste, et l'on vérifie qu'elle répond aux questions de l'équipe.
 */

const FICHE: FicheApprenant = {
  id_profil: 'p-1',
  prenom: 'Léa',
  nom: 'Martin',
  est_test: false,
  date_creation: '2026-07-01T10:00:00Z',
  inscription: {
    statut: 'active',
    date_inscription: '2026-07-02T10:00:00Z',
    source: 'paiement',
    formation: 'Trader pro',
  },
  certificat: null,
};

function lecon(champs: Partial<LeconSuivie>): LeconSuivie {
  return {
    id_section: 'm-1',
    titre_module: 'Les bases',
    position_module: 1,
    id_lecon: 'l-1',
    titre_lecon: '1.1 Introduction',
    position_lecon: 1,
    type_lecon: 'video',
    video_terminee_le: null,
    terminee_le: null,
    nombre_tentatives: 0,
    meilleur_score: null,
    score_requis: null,
    ...champs,
  };
}

const LECONS: LeconSuivie[] = [
  lecon({ id_lecon: 'l-1', titre_lecon: '1.1 Introduction', terminee_le: '2026-09-20T10:00:00Z' }),
  lecon({
    id_lecon: 'l-2',
    titre_lecon: '1.2 Quiz des bases',
    position_lecon: 2,
    type_lecon: 'quiz',
    nombre_tentatives: 3,
    meilleur_score: 55,
    score_requis: 70,
  }),
  lecon({
    id_section: 'm-2',
    titre_module: 'Analyse',
    position_module: 2,
    id_lecon: 'l-3',
    titre_lecon: '2.1 Les tendances',
  }),
];

async function monter(fiche: FicheApprenant | null, lecons: LeconSuivie[]) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id: 'p-1' }) } },
      },
      {
        provide: PilotageService,
        useValue: {
          ficheApprenant: () => Promise.resolve(fiche),
          parcoursApprenant: () => Promise.resolve(lecons),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ParcoursApprenant);
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return fixture.nativeElement as HTMLElement;
}

describe('ParcoursApprenant', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('dit où en est l’élève : pourcentage, module en cours, prochaine étape', async () => {
    const page = await monter(FICHE, LECONS);

    expect(page.querySelector('.page-titre')?.textContent).toContain('Léa Martin');
    expect(page.textContent).toContain('33 %');
    expect(page.textContent).toContain('1 leçon validée sur 3');
    expect(page.querySelector('.situation')?.textContent).toContain('Module 1 — Les bases');
    expect(page.querySelector('.situation')?.textContent).toContain('1.2 Quiz des bases');
  });

  it('signale le quiz sur lequel l’élève bloque', async () => {
    const page = await monter(FICHE, LECONS);

    const alerte = page.querySelector('.alerte.est-attention')?.textContent ?? '';
    expect(alerte).toContain('1.2 Quiz des bases');
    expect(alerte).toContain('3 tentatives, meilleur score 55 % (70 % requis)');
  });

  it('détaille le programme module par module, le module en cours ouvert', async () => {
    const page = await monter(FICHE, LECONS);

    const modules = page.querySelectorAll('details.module');
    expect(modules).toHaveLength(2);
    expect((modules[0] as HTMLDetailsElement).open).toBe(true);
    expect((modules[1] as HTMLDetailsElement).open).toBe(false);
    expect(modules[0].querySelectorAll('.lecon.est-terminee')).toHaveLength(1);
  });

  it('dit clairement qu’un compte sans inscription n’a pas de parcours', async () => {
    const page = await monter({ ...FICHE, inscription: null }, []);

    expect(page.textContent).toContain('Aucune inscription');
    expect(page.querySelector('details.module')).toBeNull();
  });
});
