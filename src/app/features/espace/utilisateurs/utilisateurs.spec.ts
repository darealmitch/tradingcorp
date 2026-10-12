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
  const retirerEssai = vi.fn(() => Promise.resolve(refus));
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
          retirerEssai,
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
  return {
    fixture,
    page,
    definirAcces,
    listerAcces,
    listerEssais,
    accorderEssai,
    retirerEssai,
    creer,
  };
}

/** La cellule « Accès » de la première ligne de la liste. */
function acces(page: HTMLElement): string {
  return page.querySelector('tbody .ligne-compte .cellule-acces')?.textContent ?? '';
}

/**
 * Les deux lignes de droits du compte qui porte ce nom : l'accès complet,
 * puis l'essai — vide quand l'écran ne la propose pas.
 */
function droits(page: HTMLElement, nom = 'Léa'): { complet: string; essai: string } {
  const ligne = [...page.querySelectorAll('tbody .ligne-compte')].find((l) =>
    l.querySelector('.compte-nom')?.textContent?.includes(nom),
  );
  const [complet = '', essai = ''] = [...(ligne?.querySelectorAll('.acces-ligne') ?? [])].map(
    (l) => l.textContent?.replace(/\s+/g, ' ').trim() ?? '',
  );
  // La date de l'essai court sous sa ligne, et en fait partie.
  const detail = ligne?.querySelector('.acces-detail')?.textContent?.trim() ?? '';
  return { complet, essai: essai && detail ? `${essai} ${detail}` : essai };
}

/** Le bouton qui valide la confirmation ouverte : il répète souvent l'action du tableau. */
function confirmer(page: HTMLElement): void {
  const bouton = page.querySelector<HTMLButtonElement>(
    '.ligne-confirmation .btn-danger, .ligne-confirmation .btn-accent',
  );
  if (!bouton) {
    throw new Error('Aucune confirmation ouverte');
  }
  bouton.click();
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
    expect(droits(page).complet).toContain('Aucun');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(droits(page).complet).toContain('Actif');
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
    expect(droits(page).complet).toContain('Retiré');
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
    expect(droits(page).complet).toContain('Actif');
  });

  it('rend un accès retiré', async () => {
    const { fixture, page, definirAcces } = await monter(
      [profil({})],
      [{ id_profil: 'lea', id_formation: 'f-1', statut: 'revoquee' }],
    );
    expect(droits(page).complet).toContain('Retiré');

    cliquer(page, 'Donner l’accès');
    await stabiliser(fixture);

    expect(definirAcces).toHaveBeenCalledWith('lea', 'f-1', true);
    expect(droits(page).complet).toContain('Actif');
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
    expect(droits(page).complet).toContain('Aucun');
  });
});

/**
 * Un élève à qui l'on voulait offrir un essai a reçu l'accès complet, faute
 * d'autre bouton. L'essai a maintenant sa ligne, sous l'accès complet : il ne
 * crée aucune inscription, et chaque geste — l'accorder, le retirer — passe
 * par une confirmation qui dit ses conséquences.
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

  const EN_COURS: EssaiAccorde = {
    id_profil: 'lea',
    accorde_le: '2026-10-12T12:00:00Z',
    annonce_le: '2026-10-12T12:00:00Z',
    retire_le: null,
  };

  it('montre, retirable, l’essai d’un élève coché « Test » après coup', async () => {
    const { page } = await monter([TESS], [], null, [{ ...EN_COURS, id_profil: 'tess' }]);

    expect(droits(page, 'Tess').essai).toContain('En cours');
    expect(droits(page, 'Tess').essai).toContain('Retirer l’essai');
    expect(droits(page, 'Tess').essai).not.toContain('Accorder un essai');
  });

  it('ne le propose qu’à l’élève sans accès complet, hors compte de test', async () => {
    const { page } = await monter(
      [profil({}), TOM, TESS],
      [{ id_profil: 'tom', id_formation: 'f-1', statut: 'active' }],
      null,
      [{ ...EN_COURS, id_profil: 'tom' }],
    );

    expect(droits(page).essai).toContain('Essai gratuit');
    expect(droits(page).essai).toContain('Aucun');
    expect(droits(page).essai).toContain('Accorder un essai');
    // L'accès complet contient l'essai ; un compte de test voit déjà tout.
    expect(droits(page, 'Tom').essai).toBe('');
    expect(droits(page, 'Tess').essai).toBe('');
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

    confirmer(page);
    await stabiliser(fixture);

    expect(accorderEssai).toHaveBeenCalledWith('lea');
    expect(definirAcces).not.toHaveBeenCalled();
    expect(droits(page).complet).toContain('Aucun');
    expect(droits(page).essai).toContain('En cours');
    expect(droits(page).essai).toContain('E-mail envoyé le');
    expect(droits(page).essai).toContain('Retirer l’essai');
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
    expect(droits(page).essai).toContain('Accorder un essai');
  });

  it('montre l’essai en cours, programmé ou retiré, avec sa date', async () => {
    const { page } = await monter(
      [profil({}), TOM, profil({ id_profil: 'jade', prenom: 'Jade', nom: 'Petit' })],
      [],
      null,
      [
        EN_COURS,
        { ...EN_COURS, id_profil: 'tom', annonce_le: null },
        { ...EN_COURS, id_profil: 'jade', retire_le: '2026-10-13T08:00:00Z' },
      ],
    );

    expect(droits(page).essai).toContain('En cours');
    expect(droits(page).essai).toContain('E-mail envoyé le 12 oct. 2026');
    expect(droits(page).essai).toContain('Retirer l’essai');
    expect(droits(page, 'Tom').essai).toContain('Programmé');
    expect(droits(page, 'Tom').essai).toContain('E-mail à la mise en production');
    expect(droits(page, 'Tom').essai).toContain('Retirer l’essai');
    expect(droits(page, 'Jade').essai).toContain('Retiré');
    expect(droits(page, 'Jade').essai).toContain('Retiré le 13 oct. 2026');
    expect(droits(page, 'Jade').essai).toContain('Accorder un essai');
  });

  it('retire l’essai après confirmation, sans toucher à l’accès complet', async () => {
    const { fixture, page, retirerEssai, definirAcces } = await monter([profil({})], [], null, [
      EN_COURS,
    ]);

    cliquer(page, 'Retirer l’essai');
    await stabiliser(fixture);
    expect(retirerEssai).not.toHaveBeenCalled();
    const confirmation = page.querySelector('.ligne-confirmation')?.textContent ?? '';
    expect(confirmation).toContain('Retirer l’essai de');
    expect(confirmation).toContain('Léa Martin');
    expect(confirmation).toContain('ne lui seront plus ouvertes');
    expect(confirmation).toContain('Sa progression est conservée');
    expect(confirmation).toContain('sans e-mail');

    confirmer(page);
    await stabiliser(fixture);

    expect(retirerEssai).toHaveBeenCalledWith('lea');
    expect(definirAcces).not.toHaveBeenCalled();
    expect(droits(page).complet).toContain('Aucun');
    expect(droits(page).essai).toContain('Retiré');
    expect(droits(page).essai).toContain('Retiré le');
    expect(droits(page).essai).toContain('Accorder un essai');
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
    expect(page.querySelector('.alerte.est-succes')?.textContent).toContain('Essai retiré');
    expect(page.querySelector('.ligne-compte.est-modifie')).not.toBeNull();
  });

  it('referme la confirmation du retrait sans rien retirer', async () => {
    const { fixture, page, retirerEssai } = await monter([profil({})], [], null, [EN_COURS]);

    cliquer(page, 'Retirer l’essai');
    await stabiliser(fixture);
    cliquer(page, 'Annuler');
    await stabiliser(fixture);

    expect(retirerEssai).not.toHaveBeenCalled();
    expect(page.querySelector('.ligne-confirmation')).toBeNull();
    expect(droits(page).essai).toContain('En cours');
  });

  it('réaccorde un essai retiré', async () => {
    const { fixture, page, accorderEssai } = await monter([profil({})], [], null, [
      { ...EN_COURS, retire_le: '2026-10-13T08:00:00Z' },
    ]);

    cliquer(page, 'Accorder un essai');
    await stabiliser(fixture);
    confirmer(page);
    await stabiliser(fixture);

    expect(accorderEssai).toHaveBeenCalledWith('lea');
    expect(droits(page).essai).toContain('En cours');
    expect(droits(page).essai).not.toContain('Retiré');
  });

  it('compte parmi les « Sans accès » l’élève dont l’essai est retiré, pas celui en essai', async () => {
    const { page } = await monter([profil({}), TOM], [], null, [
      { ...EN_COURS, retire_le: '2026-10-13T08:00:00Z' },
      { ...EN_COURS, id_profil: 'tom' },
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
    confirmer(page);
    await stabiliser(fixture);

    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Un essai a déjà été accordé à cet élève',
    );
    expect(listerEssais).toHaveBeenCalledTimes(2);
  });

  it('relaie le refus d’un retrait et se réaligne', async () => {
    const { fixture, page, listerEssais } = await monter(
      [profil({})],
      [],
      'Aucun essai en cours pour cet élève',
      [EN_COURS],
    );

    cliquer(page, 'Retirer l’essai');
    await stabiliser(fixture);
    confirmer(page);
    await stabiliser(fixture);

    expect(page.querySelector('.alerte.est-erreur')?.textContent).toContain(
      'Aucun essai en cours pour cet élève',
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
