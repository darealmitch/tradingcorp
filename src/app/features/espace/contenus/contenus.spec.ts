import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { LeconResume, Module } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { Contenus } from './contenus';

/**
 * Accès découverte : un administrateur choisit, leçon par leçon, ce qu'un
 * compte sans achat peut suivre. Offrir du contenu payant est une décision
 * commerciale — un formateur voit les cases sans pouvoir les changer, et un
 * quiz ne s'offre pas, puisqu'il exige une inscription.
 */

function lecon(champs: Partial<LeconResume>): LeconResume {
  return {
    id_lecon: 'l-video',
    id_section: 's-1',
    titre: 'Les bases',
    type: 'video',
    position: 1,
    duree_s: 600,
    est_publiee: true,
    est_decouverte: false,
    video_provider: 'bunny',
    video_provider_id: null,
    a_video_url: true,
    video_hebergee: true,
    pdf_public_id: null,
    ressources: [],
    ...champs,
  };
}

const MODULE: Module = {
  id_section: 's-1',
  titre: 'Développement personnel',
  description: null,
  position: 1,
  est_publiee: true,
  lecons: [
    lecon({}),
    lecon({ id_lecon: 'l-quiz', titre: 'Quiz du module', type: 'quiz', position: 2 }),
  ],
};

async function stabiliser(fixture: ComponentFixture<Contenus>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

async function monter(role: 'admin' | 'formateur', refus: string | null = null) {
  const definirDecouverte = vi.fn(() => Promise.resolve(refus));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ContenuService,
        useValue: {
          chargerStructure: () => Promise.resolve([structuredClone(MODULE)]),
          definirDecouverte,
        },
      },
      {
        provide: CommerceService,
        useValue: { listerFormationsStaff: () => Promise.resolve([]) },
      },
      { provide: AuthService, useValue: { role: signal(role) } },
    ],
  });
  const fixture = TestBed.createComponent(Contenus);
  await stabiliser(fixture);
  const page = fixture.nativeElement as HTMLElement;
  return { fixture, page, definirDecouverte };
}

/** La case « Offerte » de la leçon nommée. */
function caseOfferte(page: HTMLElement, titre: string): HTMLInputElement | null {
  return page.querySelector<HTMLInputElement>(
    `input[aria-label="Offerte en découverte : ${titre}"]`,
  );
}

function texte(page: HTMLElement): string {
  return page.textContent?.replace(/\s+/g, ' ') ?? '';
}

describe('Contenus — accès découverte', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('propose la case sur une vidéo, jamais sur un quiz', async () => {
    const { page } = await monter('admin');

    expect(caseOfferte(page, 'Les bases')?.disabled).toBe(false);
    expect(caseOfferte(page, 'Quiz du module')).toBeNull();
    expect(texte(page)).toContain("Aucune leçon n'est offerte pour l'instant.");
  });

  it('offre une leçon d’un clic et le dit aussitôt', async () => {
    const { fixture, page, definirDecouverte } = await monter('admin');

    caseOfferte(page, 'Les bases')?.click();
    await stabiliser(fixture);

    expect(definirDecouverte).toHaveBeenCalledWith('l-video', true);
    expect(caseOfferte(page, 'Les bases')?.checked).toBe(true);
    expect(texte(page)).toContain('Une leçon est offerte.');
  });

  it('décoche la case si la base refuse, et affiche son refus', async () => {
    const { fixture, page } = await monter('admin', 'Réservé aux administrateurs');

    caseOfferte(page, 'Les bases')?.click();
    await stabiliser(fixture);

    expect(caseOfferte(page, 'Les bases')?.checked).toBe(false);
    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Réservé aux administrateurs',
    );
  });

  it('montre les cases à un formateur sans le laisser les changer', async () => {
    const { page } = await monter('formateur');

    expect(caseOfferte(page, 'Les bases')?.disabled).toBe(true);
    expect(texte(page)).toContain('Seul un administrateur peut changer ce réglage.');
  });
});

describe('Contenus — annonce des leçons offertes', () => {
  afterEach(() => TestBed.resetTestingModule());

  /** Une leçon déjà offerte : c'est ce qui fait paraître l'annonce. */
  async function monterAvecOffre(
    role: 'admin' | 'formateur',
    reponse: { resultat: { notifies: number; par_courriel: number } | null; erreur: string | null },
  ) {
    const annoncerLeconsOffertes = vi.fn(() => Promise.resolve(reponse));
    const module = structuredClone(MODULE);
    module.lecons[0].est_decouverte = true;
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ContenuService,
          useValue: {
            chargerStructure: () => Promise.resolve([module]),
            definirDecouverte: () => Promise.resolve(null),
            annoncerLeconsOffertes,
          },
        },
        {
          provide: CommerceService,
          useValue: { listerFormationsStaff: () => Promise.resolve([]) },
        },
        { provide: AuthService, useValue: { role: signal(role) } },
      ],
    });
    const fixture = TestBed.createComponent(Contenus);
    await stabiliser(fixture);
    const page = fixture.nativeElement as HTMLElement;
    return { fixture, page, annoncerLeconsOffertes };
  }

  function bouton(page: HTMLElement, libelle: string): HTMLButtonElement {
    const trouve = [...page.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent?.trim() === libelle,
    );
    if (!trouve) {
      throw new Error(`Bouton « ${libelle} » introuvable`);
    }
    return trouve;
  }

  it('envoie un essai aux comptes de test, et le dit', async () => {
    const { fixture, page, annoncerLeconsOffertes } = await monterAvecOffre('admin', {
      resultat: { notifies: 1, par_courriel: 1 },
      erreur: null,
    });

    bouton(page, 'Envoyer un essai aux comptes de test').click();
    await stabiliser(fixture);

    expect(annoncerLeconsOffertes).toHaveBeenCalledWith(true);
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain(
      'Essai envoyé à 1 compte de test',
    );
  });

  it('ne prévient tout le monde qu’au second clic, puis donne le bilan', async () => {
    const { fixture, page, annoncerLeconsOffertes } = await monterAvecOffre('admin', {
      resultat: { notifies: 4, par_courriel: 1 },
      erreur: null,
    });

    bouton(page, 'Prévenir les comptes sans achat').click();
    await stabiliser(fixture);
    expect(annoncerLeconsOffertes).not.toHaveBeenCalled();

    bouton(page, 'Confirmer l’envoi').click();
    await stabiliser(fixture);

    expect(annoncerLeconsOffertes).toHaveBeenCalledWith(false);
    expect(texte(page)).toContain(
      '4 comptes sans achat prévenus dans leur espace, dont 1 par e-mail',
    );
  });

  it('affiche le refus de la base', async () => {
    const { fixture, page } = await monterAvecOffre('admin', {
      resultat: null,
      erreur: 'Aucune leçon n’est offerte : coche-en d’abord dans le tableau.',
    });

    bouton(page, 'Envoyer un essai aux comptes de test').click();
    await stabiliser(fixture);

    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Aucune leçon n’est offerte',
    );
  });

  it('ne montre pas l’annonce à un formateur', async () => {
    const { page } = await monterAvecOffre('formateur', { resultat: null, erreur: null });

    expect(texte(page)).not.toContain('Prévenir les comptes sans achat');
  });
});
