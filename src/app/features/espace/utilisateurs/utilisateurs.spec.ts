import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { AccesFormation, EssaiAccorde, ProfilAdmin } from '../../../core/comptes/comptes.model';
import { ComptesService } from '../../../core/comptes/comptes.service';
import { Utilisateurs } from './utilisateurs';

/**
 * Une élève créée sans être rattachée à la formation n'avait aucune issue :
 * rien dans l'espace ne réparait l'oubli, et rien ne la faisait remarquer.
 * L'administrateur la retrouve maintenant d'un filtre, lui ouvre l'accès d'un
 * clic, et ne le ferme qu'après confirmation — fermer par mégarde priverait un
 * élève de son cours.
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

const TOM = profil({ id_profil: 'tom', prenom: 'Tom', nom: 'Durand', email: 'tom@exemple.com' });

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
  essais: EssaiAccorde[] = [],
) {
  const definirAcces = vi.fn(() => Promise.resolve(refus));
  const listerAcces = vi.fn(() => Promise.resolve(acces));
  const listerEssais = vi.fn(() => Promise.resolve(essais));
  const accorderEssai = vi.fn(() => Promise.resolve(refus));
  const creer = vi.fn(() => Promise.resolve({ motDePasse: 'Temp-1234' }));
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ComptesService,
        useValue: {
          lister: () => Promise.resolve(profils),
          listerAcces,
          definirAcces,
          listerEssais,
          accorderEssai,
          creer,
        },
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
  return { fixture, page, definirAcces, listerAcces, listerEssais, accorderEssai, creer };
}

/** La cellule « Accès » de la première ligne de la liste. */
function acces(page: HTMLElement): string {
  return page.querySelector('tbody .ligne-compte .cellule-acces')?.textContent ?? '';
}

/** La cellule « Accès » de la ligne du compte qui porte ce nom. */
function accesDe(page: HTMLElement, nom: string): string {
  const ligne = [...page.querySelectorAll('tbody .ligne-compte')].find((l) =>
    l.querySelector('.compte-nom')?.textContent?.includes(nom),
  );
  return ligne?.querySelector('.cellule-acces')?.textContent?.replace(/\s+/g, ' ') ?? '';
}

/** Les noms des comptes affichés, dans l'ordre. */
function noms(page: HTMLElement): string[] {
  return [...page.querySelectorAll('tbody .compte-nom')].map(
    (n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '',
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

/** La pastille de filtre dont le libellé commence par `libelle`. */
function filtre(page: HTMLElement, libelle: string): HTMLButtonElement {
  const bouton = [...page.querySelectorAll<HTMLButtonElement>('.filtres .onglet')].find((b) =>
    b.textContent?.trim().startsWith(libelle),
  );
  if (!bouton) {
    throw new Error(`Filtre « ${libelle} » introuvable`);
  }
  return bouton;
}

function saisir(champ: HTMLInputElement, valeur: string): void {
  champ.value = valeur;
  champ.dispatchEvent(new Event('input'));
}

describe('Utilisateurs — accès à la formation', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ouvre d’un clic l’accès d’une élève qui ne l’a pas', async () => {
    const { fixture, page, definirAcces } = await monter([profil({})]);
    expect(acces(page)).toContain('Sans accès');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(acces(page)).toContain('Accès actif');
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain('Accès ouvert');
  });

  it('demande confirmation avant de retirer un accès, en rappelant ce qui est conservé', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'active' }],
    );

    cliquer(page, 'Retirer');
    await stabiliser(fixture);
    expect(definirAcces).not.toHaveBeenCalled();
    const confirmation = page.querySelector('.ligne-confirmation')?.textContent ?? '';
    expect(confirmation).toContain('Retirer l’accès de');
    expect(confirmation).toContain('Léa Martin');
    expect(confirmation).toContain('Sa progression est conservée');

    cliquer(page, 'Retirer l’accès');
    await stabiliser(fixture);
    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', false);
    expect(acces(page)).toContain('Accès retiré');
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
  });

  it('referme la confirmation sans rien retirer', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'active' }],
    );

    cliquer(page, 'Retirer');
    await stabiliser(fixture);
    cliquer(page, 'Annuler');
    await stabiliser(fixture);

    expect(definirAcces).not.toHaveBeenCalled();
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
    expect(acces(page)).toContain('Accès actif');
  });

  it('rend un accès retiré', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'revoquee' }],
    );
    expect(acces(page)).toContain('Accès retiré');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(acces(page)).toContain('Accès actif');
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
    expect(acces(page)).toContain('Sans accès');
  });
});

/**
 * Un élève à qui l'on voulait offrir un essai a reçu l'accès complet, faute
 * d'autre bouton. L'essai a maintenant le sien, sur sa propre ligne : il ne
 * crée aucune inscription, et confirme avant d'envoyer l'e-mail qui l'explique.
 */
describe('Utilisateurs — essai', () => {
  afterEach(() => TestBed.resetTestingModule());

  const TESS = profil({
    id_profil: 'tess',
    prenom: 'Tess',
    nom: 'Test',
    email: 'tess@exemple.com',
    est_test: true,
  });

  it('ne le propose qu’à l’élève sans accès complet, hors compte de test', async () => {
    const { page } = await monter(
      [profil({}), TOM, TESS],
      [{ id_profil: 'tom', id_formation: 'f-1', statut: 'active' }],
    );

    expect(accesDe(page, 'Léa')).toContain('Accorder un essai');
    expect(accesDe(page, 'Tom')).not.toContain('Accorder un essai');
    expect(accesDe(page, 'Tess')).not.toContain('Accorder un essai');
  });

  it('demande confirmation, puis l’accorde sans ouvrir l’accès complet', async () => {
    const { fixture, page, accorderEssai, definirAcces } = await monter([profil({})]);

    cliquer(page, 'Accorder un essai');
    await stabiliser(fixture);
    expect(accorderEssai).not.toHaveBeenCalled();
    const confirmation = page.querySelector('.ligne-confirmation')?.textContent ?? '';
    expect(confirmation).toContain('Léa Martin');
    expect(confirmation).toContain('Aucune inscription n’est créée');
    expect(confirmation).toContain('Un e-mail part aussitôt');

    cliquer(page, 'Accorder l’essai');
    await stabiliser(fixture);

    expect(accorderEssai).toHaveBeenCalledWith('lea');
    expect(definirAcces).not.toHaveBeenCalled();
    expect(accesDe(page, 'Léa')).toContain('Sans accès');
    expect(accesDe(page, 'Léa')).toContain('Essai accordé');
    expect(accesDe(page, 'Léa')).toContain('E-mail envoyé le');
    expect(accesDe(page, 'Léa')).not.toContain('Accorder un essai');
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain('Essai accordé');
  });

  it('referme la confirmation sans rien envoyer', async () => {
    const { fixture, page, accorderEssai } = await monter([profil({})]);

    cliquer(page, 'Accorder un essai');
    await stabiliser(fixture);
    cliquer(page, 'Annuler');
    await stabiliser(fixture);

    expect(accorderEssai).not.toHaveBeenCalled();
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
    expect(accesDe(page, 'Léa')).toContain('Accorder un essai');
  });

  it('montre l’essai envoyé, ou programmé pour la mise en production', async () => {
    const { page } = await monter([profil({}), TOM], [], null, [
      { id_profil: 'lea', accorde_le: '2026-10-12T12:00:00Z', annonce_le: '2026-10-12T12:00:00Z' },
      { id_profil: 'tom', accorde_le: '2026-10-12T12:00:00Z', annonce_le: null },
    ]);

    expect(accesDe(page, 'Léa')).toContain('Essai accordé');
    expect(accesDe(page, 'Léa')).toContain('E-mail envoyé le 12 oct. 2026');
    expect(accesDe(page, 'Tom')).toContain('Essai programmé');
    expect(accesDe(page, 'Tom')).toContain('E-mail à la mise en production');
    expect(page.textContent).not.toContain('Accorder un essai');
  });

  it('ne compte plus l’élève en essai parmi les « Sans accès »', async () => {
    const { page } = await monter([profil({}), TOM], [], null, [
      { id_profil: 'tom', accorde_le: '2026-10-12T12:00:00Z', annonce_le: '2026-10-12T12:00:00Z' },
    ]);

    expect(filtre(page, 'Sans accès').textContent).toContain('1');
  });

  it('relaie le refus de la base et se réaligne', async () => {
    const { fixture, page, listerEssais } = await monter(
      [profil({})],
      [],
      'Un essai a déjà été accordé à cet élève',
    );

    cliquer(page, 'Accorder un essai');
    await stabiliser(fixture);
    cliquer(page, 'Accorder l’essai');
    await stabiliser(fixture);

    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Un essai a déjà été accordé à cet élève',
    );
    expect(listerEssais).toHaveBeenCalledTimes(2);
  });
});

describe('Utilisateurs — retrouver un compte', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('signale les élèves sans accès et les isole d’un clic', async () => {
    const { fixture, page } = await monter(
      [profil({}), TOM],
      [{ id_profil: 'tom', id_formation: 'f-1', statut: 'active' }],
    );

    const sansAcces = filtre(page, 'Sans accès');
    expect(sansAcces.textContent).toContain('1');
    // Compteur ambre : il y a quelqu'un à rattacher.
    expect(sansAcces.querySelector('.onglet-compte')?.classList).not.toContain('est-neutre');

    sansAcces.click();
    await stabiliser(fixture);

    expect(noms(page)).toEqual(['Léa Martin']);
    expect(sansAcces.getAttribute('aria-pressed')).toBe('true');
  });

  it('cherche par nom ou e-mail, sans tenir compte des accents ni des majuscules', async () => {
    const { fixture, page } = await monter([profil({}), TOM]);

    saisir(page.querySelector<HTMLInputElement>('#recherche-comptes')!, 'LEA');
    await stabiliser(fixture);
    expect(noms(page)).toEqual(['Léa Martin']);

    saisir(page.querySelector<HTMLInputElement>('#recherche-comptes')!, 'tom@');
    await stabiliser(fixture);
    expect(noms(page)).toEqual(['Tom Durand']);
  });

  it('propose d’effacer les filtres quand rien ne correspond', async () => {
    const { fixture, page } = await monter([profil({}), TOM]);

    saisir(page.querySelector<HTMLInputElement>('#recherche-comptes')!, 'personne');
    await stabiliser(fixture);
    expect(page.querySelector('.comptes-vide')?.textContent).toContain('Aucun compte');

    cliquer(page, 'Effacer les filtres');
    await stabiliser(fixture);
    expect(noms(page)).toEqual(['Léa Martin', 'Tom Durand']);
  });
});

describe('Utilisateurs — création d’un compte', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('n’ouvre le formulaire qu’à la demande, et le referme', async () => {
    const { fixture, page } = await monter([profil({})]);
    expect(page.querySelector('.creation-form')).toBeNull();

    cliquer(page, 'Nouveau compte');
    await stabiliser(fixture);
    expect(page.querySelector('.creation-form')).not.toBeNull();

    cliquer(page, 'Annuler');
    await stabiliser(fixture);
    expect(page.querySelector('.creation-form')).toBeNull();
  });

  it('garde le mot de passe temporaire affiché une fois le compte créé', async () => {
    const { fixture, page, creer } = await monter([profil({})]);

    cliquer(page, 'Nouveau compte');
    await stabiliser(fixture);
    saisir(page.querySelector<HTMLInputElement>('#creation-email')!, 'nouveau@exemple.com');
    page.querySelector<HTMLFormElement>('.creation-form')!.dispatchEvent(new Event('submit'));
    await stabiliser(fixture);

    expect(creer).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'nouveau@exemple.com', role: 'apprenant' }),
    );
    expect(page.querySelector('.creation-form')).toBeNull();
    expect(page.querySelector('.compte-cree')?.textContent).toContain('Temp-1234');
  });
});
