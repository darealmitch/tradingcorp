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
import { Accueil } from './accueil';

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
