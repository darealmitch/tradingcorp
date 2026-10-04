import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Commentaire, FilCommentaire } from '../../../core/communaute/communaute.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { CommentairesLecon } from './commentaires-lecon';

/**
 * Une réponse privée doit se distinguer au premier regard d'une réponse
 * publique — c'est la demande même. Et un élève ne doit jamais lire « Compte
 * supprimé » sous une réponse de l'équipe : il ne voit pas les profils de
 * l'équipe, l'écran doit s'appuyer sur le marqueur posé par le serveur.
 */

function commentaire(champs: Partial<Commentaire>): Commentaire {
  return {
    id_commentaire: 'c-1',
    id_parent: null,
    contenu: 'Une question',
    statut: 'approuve',
    date_creation: '2026-10-01T10:00:00Z',
    id_profil: 'eleve',
    profils: { prenom: 'Léa', nom: 'Martin', role: 'apprenant' },
    par_equipe: false,
    est_prive: false,
    ...champs,
  };
}

/** Méthodes protégées du composant, utilisées par le gabarit. */
interface Interne {
  basculerReponse(id: string, privee?: boolean): void;
  texteReponse: WritableSignal<string>;
  publierReponse(id: string): Promise<void>;
}

async function monter(fils: FilCommentaire[], equipe: boolean, idProfil: string) {
  const repondreEnEquipe = vi.fn(() => Promise.resolve(null));
  const publierCommentaire = vi.fn(() => Promise.resolve(null));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CommunauteService,
        useValue: {
          commentaires: () => Promise.resolve(fils),
          repondreEnEquipe,
          publierCommentaire,
          supprimerCommentaire: () => Promise.resolve(null),
        },
      },
      {
        provide: AuthService,
        useValue: { profil: signal({ id_profil: idProfil }), estFormateurOuAdmin: signal(equipe) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CommentairesLecon);
  fixture.componentRef.setInput('idLecon', 'l-1');
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  return {
    fixture,
    page: fixture.nativeElement as HTMLElement,
    interne: fixture.componentInstance as unknown as Interne,
    repondreEnEquipe,
    publierCommentaire,
  };
}

/** Libellés des boutons sous le message d'origine. */
function boutons(page: HTMLElement): string[] {
  return [
    ...page.querySelectorAll('.commentaire-liste > .commentaire > .commentaire-boutons button'),
  ].map((b) => b.textContent?.trim() ?? '');
}

describe('CommentairesLecon — réponses de l’équipe', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('montre à l’élève une réponse privée, clairement signalée et signée de l’équipe', async () => {
    const message = commentaire({
      statut: 'en_attente',
      profils: { prenom: 'Léa', nom: 'Martin' },
    });
    const reponse = commentaire({
      id_commentaire: 'r-1',
      id_parent: 'c-1',
      id_profil: 'admin',
      contenu: 'Je te réponds ici.',
      par_equipe: true,
      est_prive: true,
      // Ce que l'élève reçoit réellement : le profil de l'équipe lui est fermé.
      profils: null,
    });
    const { page } = await monter([{ message, reponses: [reponse] }], false, 'eleve');

    const privee = page.querySelector('.commentaire.est-privee');
    expect(privee).not.toBeNull();
    expect(privee?.textContent).toContain('Réponse privée');
    expect(privee?.textContent).toContain('Équipe TradingCorp');
    expect(privee?.textContent).not.toContain('Compte supprimé');
    expect(privee?.textContent).toContain('Visible uniquement par toi');
  });

  it('ne propose aucune réponse privée à un élève', async () => {
    const { page } = await monter([{ message: commentaire({}), reponses: [] }], false, 'autre');

    expect(boutons(page)).toEqual(['Répondre']);
  });

  it('propose à l’équipe une réponse privée sous un message encore en attente, et seulement celle-là', async () => {
    const { page } = await monter(
      [{ message: commentaire({ statut: 'en_attente' }), reponses: [] }],
      true,
      'admin',
    );

    // Une réponse publique sous un message non publié serait lue seule par
    // les autres élèves : le serveur la refuse, l'écran ne la propose pas.
    expect(boutons(page)).toEqual(['Répondre en privé']);
  });

  it('propose les deux réponses à l’équipe sous un message publié', async () => {
    const { page } = await monter([{ message: commentaire({}), reponses: [] }], true, 'admin');

    expect(boutons(page)).toEqual(['Répondre', 'Répondre en privé']);
  });

  it('envoie la réponse privée de l’équipe par sa voie dédiée', async () => {
    const { fixture, interne, repondreEnEquipe, publierCommentaire } = await monter(
      [{ message: commentaire({}), reponses: [] }],
      true,
      'admin',
    );

    interne.basculerReponse('c-1', true);
    interne.texteReponse.set('Réponse confidentielle');
    fixture.detectChanges();
    await interne.publierReponse('c-1');

    expect(repondreEnEquipe).toHaveBeenCalledWith('c-1', 'Réponse confidentielle', true);
    expect(publierCommentaire).not.toHaveBeenCalled();
  });
});
