import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { AccesFormation, ProfilAdmin } from '../../../core/comptes/comptes.model';
import { ComptesService } from '../../../core/comptes/comptes.service';
import { Utilisateurs } from './utilisateurs';

/**
 * Une élève créée sans être rattachée à la formation n'avait aucune issue :
 * rien dans l'espace ne réparait l'oubli. L'administrateur ouvre maintenant
 * l'accès d'un clic, et le ferme après confirmation — fermer par mégarde
 * priverait un élève de son cours.
 */

const FORMATION: Formation = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  slug: 'trader-pro',
  description: null,
  prix_centimes: 99700,
  devise: 'eur',
};

function profil(champs: Partial<ProfilAdmin>): ProfilAdmin {
  return {
    id_profil: 'lea',
    prenom: 'Léa',
    nom: 'Martin',
    email: 'lea@exemple.com',
    role: 'apprenant',
    date_creation: '2026-10-01T10:00:00Z',
    doit_changer_mdp: false,
    est_test: false,
    est_proprietaire: false,
    ...champs,
  };
}

async function stabiliser(fixture: ComponentFixture<Utilisateurs>): Promise<void> {
  for (let i = 0; i < 3; i++) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
}

async function monter(
  profils: ProfilAdmin[],
  acces: AccesFormation[] = [],
  refus: string | null = null,
) {
  const definirAcces = vi.fn(() => Promise.resolve(refus));
  const listerAcces = vi.fn(() => Promise.resolve(acces));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ComptesService,
        useValue: { lister: () => Promise.resolve(profils), listerAcces, definirAcces },
      },
      {
        provide: CommerceService,
        useValue: { chargerFormations: () => Promise.resolve([FORMATION]) },
      },
      {
        provide: AuthService,
        useValue: { profil: signal({ id_profil: 'mitch', est_proprietaire: true }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(Utilisateurs);
  await stabiliser(fixture);
  const page = fixture.nativeElement as HTMLElement;
  return { fixture, page, definirAcces, listerAcces };
}

/** La cellule « Accès » de la première ligne du tableau des comptes. */
function acces(page: HTMLElement): string {
  return page.querySelectorAll('tbody tr')[0].querySelectorAll('td')[4].textContent ?? '';
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

describe('Utilisateurs — accès à la formation', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ouvre d’un clic l’accès d’une élève qui ne l’a pas', async () => {
    const { fixture, page, definirAcces } = await monter([profil({})]);
    expect(acces(page)).toContain('Aucun');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(acces(page)).toContain('Ouvert');
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain('Accès ouvert');
  });

  it('demande confirmation avant de retirer un accès', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'active' }],
    );

    cliquer(page, 'Retirer');
    await stabiliser(fixture);
    expect(definirAcces).not.toHaveBeenCalled();
    expect(acces(page)).toContain('Retirer l’accès ?');

    cliquer(page, 'Confirmer');
    await stabiliser(fixture);
    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', false);
    expect(acces(page)).toContain('Retiré');
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain(
      'Sa progression est conservée',
    );
  });

  it('rend un accès retiré', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'revoquee' }],
    );
    expect(acces(page)).toContain('Retiré');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(acces(page)).toContain('Ouvert');
  });

  it('ne propose rien pour l’équipe, qui voit déjà tout le contenu', async () => {
    const { page } = await monter([profil({ role: 'formateur' })]);

    expect(acces(page)).toContain('Tout le contenu');
    expect(acces(page)).not.toContain('Donner l’accès');
  });

  it('se réaligne sur la base quand le serveur refuse', async () => {
    const { fixture, page, listerAcces } = await monter(
      [profil({})],
      [],
      'Réservé aux administrateurs',
    );

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Réservé aux administrateurs',
    );
    expect(listerAcces).toHaveBeenCalledTimes(2);
    expect(acces(page)).toContain('Aucun');
  });
});
