import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { Role } from '../../../core/auth/profil.model';
import { Commentaire, FilCommentaire } from '../../../core/communaute/communaute.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { CommentairesLecon } from './commentaires-lecon';

/**
 * Un échange privé doit se distinguer au premier regard d'un échange public —
 * c'est la demande même — et l'élève doit pouvoir le poursuivre au même
 * endroit. Chaque rôle est monté pour de bon : l'élève auteur du fil, un autre
 * élève, et l'équipe, formateur comme administrateur.
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

/** Réponse privée de l'équipe sous `c-1`, telle que l'élève la reçoit : sans profil. */
function reponsePriveeDeLEquipe(champs: Partial<Commentaire> = {}): Commentaire {
  return commentaire({
    id_commentaire: 'r-1',
    id_parent: 'c-1',
    id_profil: 'admin',
    contenu: 'Je te réponds ici.',
    par_equipe: true,
    est_prive: true,
    profils: null,
    ...champs,
  });
}

/** Méthodes protégées du composant, utilisées par le gabarit. */
interface Interne {
  basculerReponse(id: string, privee?: boolean): void;
  texteReponse: WritableSignal<string>;
  publierReponse(id: string): Promise<void>;
}

async function monter(fils: FilCommentaire[], role: Role, idProfil: string) {
  const repondreEnEquipe = vi.fn(() => Promise.resolve(null));
  const repondreEnPrive = vi.fn(() => Promise.resolve(null));
  const publierCommentaire = vi.fn(() => Promise.resolve(null));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CommunauteService,
        useValue: {
          commentaires: () => Promise.resolve(fils),
          repondreEnEquipe,
          repondreEnPrive,
          publierCommentaire,
          supprimerCommentaire: () => Promise.resolve(null),
        },
      },
      {
        provide: AuthService,
        useValue: {
          profil: signal({ id_profil: idProfil }),
          role: signal(role),
          estFormateurOuAdmin: signal(role !== 'apprenant'),
        },
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
    repondreEnPrive,
    publierCommentaire,
  };
}

/** Libellés des boutons sous le message d'origine. */
function boutons(page: HTMLElement): string[] {
  return [
    ...page.querySelectorAll('.commentaire-liste > .commentaire > .commentaire-boutons button'),
  ].map((b) => b.textContent?.trim() ?? '');
}

describe('CommentairesLecon — côté élève', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('montre la réponse privée de l’équipe dans un échange clairement signalé', async () => {
    const message = commentaire({
      statut: 'en_attente',
      profils: { prenom: 'Léa', nom: 'Martin' },
    });
    const { page } = await monter(
      [{ message, reponses: [reponsePriveeDeLEquipe()] }],
      'apprenant',
      'eleve',
    );

    const echange = page.querySelector('.echange-prive');
    expect(echange).not.toBeNull();
    expect(echange?.textContent).toContain('Échange privé avec l');
    expect(echange?.textContent).toContain('Équipe TradingCorp');
    expect(echange?.textContent).not.toContain('Compte supprimé');
    expect(echange?.textContent).toContain('Visible uniquement par toi');
  });

  it('laisse l’élève poursuivre l’échange privé, par sa voie dédiée', async () => {
    const { fixture, page, interne, repondreEnPrive, publierCommentaire } = await monter(
      [{ message: commentaire({}), reponses: [reponsePriveeDeLEquipe()] }],
      'apprenant',
      'eleve',
    );

    // La saisie se trouve au bas de l'échange, là où se lit la conversation.
    expect(page.querySelector('.echange-prive .bouton-prive')?.textContent).toContain(
      'Répondre en privé',
    );

    interne.basculerReponse('c-1', true);
    interne.texteReponse.set('Merci, c’est plus clair');
    fixture.detectChanges();
    await interne.publierReponse('c-1');

    expect(repondreEnPrive).toHaveBeenCalledWith('c-1', 'Merci, c’est plus clair');
    expect(publierCommentaire).not.toHaveBeenCalled();
  });

  it('ne propose aucune réponse privée sous le message d’un autre', async () => {
    const { page } = await monter(
      [{ message: commentaire({}), reponses: [] }],
      'apprenant',
      'autre',
    );

    expect(boutons(page)).toEqual(['Répondre']);
    expect(page.querySelector('.echange-prive')).toBeNull();
  });

  it('ne laisse pas un élève ouvrir un échange privé de lui-même', async () => {
    const { page } = await monter(
      [{ message: commentaire({}), reponses: [] }],
      'apprenant',
      'eleve',
    );

    expect(page.querySelector('.bouton-prive')).toBeNull();
  });

  it('présente un fil rendu privé comme un échange, sans réponse publique possible', async () => {
    const { page } = await monter(
      [{ message: commentaire({ est_prive: true }), reponses: [] }],
      'apprenant',
      'eleve',
    );

    expect(page.querySelector('.commentaire.est-fil-prive')?.textContent).toContain(
      "personne d'autre ne le voit",
    );
    expect(boutons(page)).not.toContain('Répondre');
    expect(page.querySelector('.echange-prive .bouton-prive')).not.toBeNull();
  });

  it('signale à son auteur un message rejeté, qu’il croirait sinon publié', async () => {
    const { page } = await monter(
      [{ message: commentaire({ statut: 'rejete' }), reponses: [] }],
      'apprenant',
      'eleve',
    );

    expect(page.querySelector('.est-non-publie')?.textContent).toContain('non publié');
  });

  it('affiche « Prénom I. » sous le message d’un camarade, jamais « Compte supprimé »', async () => {
    const message = commentaire({ id_profil: 'lea', profils: null, nom_public: 'Léa M.' });
    const { page } = await monter([{ message, reponses: [] }], 'apprenant', 'moi');

    const auteur = page.querySelector('.commentaire-auteur')?.textContent;
    expect(auteur).toBe('Léa M.');
  });
});

describe.each<Role>(['formateur', 'admin'])('CommentairesLecon — côté équipe (%s)', (role) => {
  afterEach(() => TestBed.resetTestingModule());

  it('propose une réponse privée sous un message encore en attente, et seulement celle-là', async () => {
    const { page } = await monter(
      [{ message: commentaire({ statut: 'en_attente' }), reponses: [] }],
      role,
      'equipe',
    );

    // Une réponse publique sous un message non publié serait lue seule par
    // les autres élèves : le serveur la refuse, l'écran ne la propose pas.
    expect(boutons(page)).toEqual(['Répondre en privé']);
  });

  it('propose les deux réponses sous un message publié', async () => {
    const { page } = await monter([{ message: commentaire({}), reponses: [] }], role, 'equipe');

    expect(boutons(page)).toEqual(['Répondre', 'Répondre en privé']);
  });

  it('envoie sa réponse privée par la voie de l’équipe', async () => {
    const { fixture, interne, repondreEnEquipe, repondreEnPrive } = await monter(
      [{ message: commentaire({}), reponses: [] }],
      role,
      'equipe',
    );

    interne.basculerReponse('c-1', true);
    interne.texteReponse.set('Réponse confidentielle');
    fixture.detectChanges();
    await interne.publierReponse('c-1');

    expect(repondreEnEquipe).toHaveBeenCalledWith('c-1', 'Réponse confidentielle', true);
    expect(repondreEnPrive).not.toHaveBeenCalled();
  });

  it('lit l’échange privé d’un élève, avec le membre de l’équipe qui a signé', async () => {
    const reponse = reponsePriveeDeLEquipe({
      profils: { prenom: 'Ada', nom: 'Admin', role: 'admin' },
    });
    const { page } = await monter(
      [{ message: commentaire({}), reponses: [reponse] }],
      role,
      'equipe',
    );

    const echange = page.querySelector('.echange-prive')?.textContent ?? '';
    expect(echange).toContain('Échange privé avec Léa');
    expect(echange).toContain('Ada Admin');
    expect(echange).toContain('Visible uniquement par Léa et l');
  });
});
