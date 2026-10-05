import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { EchangePrive } from '../../../core/moderation/echanges';
import {
  CommentaireModere,
  CompteursModeration,
  ModerationService,
} from '../../../core/moderation/moderation.service';
import { Moderation } from './moderation';

/**
 * Ce que l'équipe doit pouvoir faire sans chercher : retrouver un message
 * quel que soit son état, ne se voir proposer que les décisions que le
 * serveur acceptera, et savoir après coup où le message est passé. L'écran
 * est monté derrière une vraie route : l'onglet vit dans l'adresse.
 */

function commentaire(champs: Partial<CommentaireModere>): CommentaireModere {
  return {
    id_commentaire: 'c-1',
    id_parent: null,
    id_lecon: 'l-1',
    id_profil: 'lea',
    contenu: 'Une question sur le stop loss',
    statut: 'en_attente',
    est_prive: false,
    par_equipe: false,
    date_creation: '2026-10-01T10:00:00Z',
    profils: { prenom: 'Léa', nom: 'Martin', role: 'apprenant' },
    lecons: { titre: '2.3 Le stop loss', id_section: 's-1' },
    ...champs,
  };
}

interface Donnees {
  commentaires?: CommentaireModere[];
  echanges?: EchangePrive<CommentaireModere>[];
}

async function monter(url: string, role: Role, donnees: Donnees = {}) {
  const compteurs = signal<CompteursModeration>({ enAttente: 1, aRepondre: 1, avisEnAttente: 0 });
  const moderation = {
    compteurs,
    commentairesParEtat: vi.fn(() => Promise.resolve(donnees.commentaires ?? [])),
    echangesPrives: vi.fn(() => Promise.resolve(donnees.echanges ?? [])),
    avisEnAttente: () => Promise.resolve([]),
    rafraichirCompteurs: () => Promise.resolve(compteurs()),
    modererCommentaire: vi.fn(() => Promise.resolve(null)),
    supprimerDefinitivement: vi.fn(() => Promise.resolve(null)),
    traiterAvis: () => Promise.resolve(null),
  };
  const repondreEnEquipe = vi.fn(() => Promise.resolve(null));

  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: 'espace/moderation', component: Moderation }]),
      { provide: ModerationService, useValue: moderation },
      { provide: CommunauteService, useValue: { repondreEnEquipe } },
      { provide: AuthService, useValue: { role: signal(role) } },
    ],
  });

  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url, Moderation);
  for (let i = 0; i < 3; i++) {
    harness.detectChanges();
    await harness.fixture.whenStable();
  }
  const page = harness.routeNativeElement as HTMLElement;
  return { harness, page, moderation, repondreEnEquipe };
}

/** Libellés des boutons et liens d'action de la première ligne. */
function actions(page: HTMLElement): string[] {
  return [...page.querySelectorAll('.moderation-ligne .moderation-actions > *')].map(
    (e) => e.textContent?.trim() ?? '',
  );
}

function cliquer(page: HTMLElement, libelle: string): void {
  const bouton = [...page.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === libelle,
  );
  if (!bouton) {
    throw new Error(`Bouton « ${libelle} » introuvable`);
  }
  bouton.click();
}

async function stabiliser(harness: RouterTestingHarness): Promise<void> {
  for (let i = 0; i < 3; i++) {
    harness.detectChanges();
    await harness.fixture.whenStable();
  }
}

describe.each<Role>(['formateur', 'admin'])('Moderation — %s', (role) => {
  afterEach(() => TestBed.resetTestingModule());

  it('ouvre l’onglet demandé dans l’adresse, et charge cet état-là', async () => {
    const { page, moderation } = await monter('/espace/moderation?onglet=publies', role);

    expect(moderation.commentairesParEtat).toHaveBeenCalledWith('publies');
    expect(page.querySelector('.onglet.est-actif')?.textContent).toContain('Publiés');
  });

  it('propose, sous un message en attente, les trois décisions qui ont un sens', async () => {
    const { page } = await monter('/espace/moderation', role, {
      commentaires: [commentaire({})],
    });

    expect(actions(page)).toEqual(['Voir dans la leçon', 'Approuver', 'Rendre privé', 'Rejeter']);
  });

  it('ne propose rien sur une réponse écrite en privé par un élève', async () => {
    const { page } = await monter('/espace/moderation?onglet=publies', role, {
      commentaires: [commentaire({ id_parent: 'c-0', est_prive: true, statut: 'approuve' })],
    });

    expect(actions(page)).toEqual(['Voir dans la leçon']);
  });

  it('rappelle à quoi répond une réponse', async () => {
    const parent = commentaire({ id_commentaire: 'c-0', contenu: 'Comment placer mon stop ?' });
    const { page } = await monter('/espace/moderation', role, {
      commentaires: [commentaire({ id_parent: 'c-0', parent, contenu: 'Moi aussi' })],
    });

    expect(page.querySelector('.moderation-contexte')?.textContent).toContain(
      'En réponse à Léa Martin : « Comment placer mon stop ? »',
    );
  });

  it('dit où le message est passé après la décision', async () => {
    const { harness, page, moderation } = await monter('/espace/moderation', role, {
      commentaires: [commentaire({})],
    });

    cliquer(page, 'Approuver');
    await stabiliser(harness);

    expect(moderation.modererCommentaire).toHaveBeenCalledWith('c-1', 'approuver');
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain('Publiés');
  });

  it('montre en tête les échanges qui attendent une réponse, et y répond sans quitter l’écran', async () => {
    const fil = commentaire({ statut: 'approuve' });
    const reponse = commentaire({
      id_commentaire: 'c-2',
      id_parent: 'c-1',
      est_prive: true,
      statut: 'approuve',
      contenu: 'Merci, mais je ne comprends pas tout',
    });
    const { harness, page, repondreEnEquipe } = await monter(
      '/espace/moderation?onglet=prives',
      role,
      {
        echanges: [
          {
            fil,
            filPrive: false,
            messages: [reponse],
            aRepondre: true,
            derniereActivite: reponse.date_creation,
          },
        ],
      },
    );

    expect(page.querySelector('.echange .badge-statut')?.textContent).toContain('À répondre');

    cliquer(page, 'Répondre en privé');
    await stabiliser(harness);
    const saisie = page.querySelector<HTMLTextAreaElement>('.echange-saisie textarea');
    expect(saisie).not.toBeNull();
    saisie!.value = 'Je reprends point par point';
    saisie!.dispatchEvent(new Event('input'));
    await stabiliser(harness);
    page.querySelector<HTMLFormElement>('.echange-saisie')!.dispatchEvent(new Event('submit'));
    await stabiliser(harness);

    expect(repondreEnEquipe).toHaveBeenCalledWith('c-1', 'Je reprends point par point', true);
  });
});

describe('Moderation — suppression définitive', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ne la propose pas au formateur : rejeter suffit, et se rattrape', async () => {
    const { page } = await monter('/espace/moderation?onglet=rejetes', 'formateur', {
      commentaires: [commentaire({ statut: 'rejete' })],
    });

    expect(actions(page)).toEqual(['Voir dans la leçon', 'Republier', 'Rendre privé']);
  });

  it('la propose à l’administrateur, après confirmation', async () => {
    const { harness, page, moderation } = await monter(
      '/espace/moderation?onglet=rejetes',
      'admin',
      {
        commentaires: [commentaire({ statut: 'rejete' })],
      },
    );

    cliquer(page, 'Supprimer définitivement');
    await stabiliser(harness);
    expect(moderation.supprimerDefinitivement).not.toHaveBeenCalled();
    expect(page.querySelector('.confirmation-suppression')?.textContent).toContain(
      'Supprimer définitivement',
    );

    cliquer(page, 'Confirmer');
    await stabiliser(harness);
    expect(moderation.supprimerDefinitivement).toHaveBeenCalledWith('c-1');
  });
});
