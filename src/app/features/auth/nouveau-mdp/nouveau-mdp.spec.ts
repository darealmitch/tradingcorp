import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { NouveauMdp } from './nouveau-mdp';
import { AuthService } from '../../../core/auth/auth.service';
import { Profil } from '../../../core/auth/profil.model';

function unProfil(surcharge: Partial<Profil> = {}): Profil {
  return {
    id_profil: 'p-1',
    prenom: 'Ada',
    nom: 'Lovelace',
    role: 'apprenant',
    date_naissance: '1990-01-01',
    doit_changer_mdp: false,
    est_test: false,
    est_proprietaire: false,
    date_creation: '2026-01-01',
    ...surcharge,
  } as Profil;
}

/**
 * Dernière étape de la récupération, quel que soit le chemin emprunté : le lien
 * de l'e-mail y conduit via `/recuperation`, et les comptes créés par un
 * administrateur y arrivent par la garde de changement imposé.
 *
 * Ce qui est éprouvé ici : la date de naissance est réclamée à qui ne l'a pas —
 * le cas de tous les anciens élèves repris de Wix, dont l'export n'en portait
 * aucune —, jamais aux autres, et toujours AVANT le mot de passe.
 */
describe('NouveauMdp — date de naissance', () => {
  let fixture: ComponentFixture<NouveauMdp>;
  let appels: string[];

  function champ(id: string): HTMLInputElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`#${id}`);
  }

  function saisir(id: string, valeur: string): void {
    const el = champ(id)!;
    el.value = valeur;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function soumettre(): void {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  async function monter(profilRendu: Profil | null): Promise<void> {
    appels = [];
    await TestBed.configureTestingModule({
      imports: [NouveauMdp],
      providers: [
        // La route d'arrivée doit exister : le composant y navigue en fin de
        // parcours, et un routeur vide rejetterait la navigation.
        provideRouter([{ path: 'espace', children: [] }]),
        {
          provide: AuthService,
          useValue: {
            profil: signal<Profil | null>(profilRendu),
            definirDateNaissance: async () => {
              appels.push('definirDateNaissance');
              return { ok: true };
            },
            definirNouveauMotDePasse: async () => {
              appels.push('definirNouveauMotDePasse');
              return { ok: true };
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(NouveauMdp);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('ne réclame pas la date à qui la connaît déjà', async () => {
    await monter(unProfil({ date_naissance: '1990-01-01' }));

    expect(champ('dateNaissance')).toBeNull();
    expect(champ('mdp')).not.toBeNull();
  });

  it('réclame la date à un apprenant qui ne l’a pas', async () => {
    await monter(unProfil({ date_naissance: null }));

    expect(champ('dateNaissance')).not.toBeNull();
  });

  it('ne la réclame pas au personnel', async () => {
    // La règle des dix-huit ans vise les apprenants, pas l'équipe.
    await monter(unProfil({ role: 'formateur', date_naissance: null }));

    expect(champ('dateNaissance')).toBeNull();
  });

  it('refuse de finaliser tant que la date manque', async () => {
    await monter(unProfil({ date_naissance: null }));

    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    expect(appels).not.toContain('definirDateNaissance');
    expect(appels).not.toContain('definirNouveauMotDePasse');
  });

  it('enregistre la date AVANT le mot de passe', async () => {
    await monter(unProfil({ date_naissance: null }));

    saisir('dateNaissance', '1990-05-04');
    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    // L'ordre est le fond du sujet : l'inverse laisserait un compte utilisable
    // sans que la majorité ait été établie.
    expect(appels.indexOf('definirDateNaissance')).toBeGreaterThan(-1);
    expect(appels.indexOf('definirDateNaissance')).toBeLessThan(
      appels.indexOf('definirNouveauMotDePasse'),
    );
  });

  it('exige la longueur que le serveur exige, ni plus ni moins', async () => {
    // Le front en demandait huit quand l'authentification en exigeait dix : la
    // personne passait la validation, se voyait refuser par le serveur, et
    // lisait « au moins 8 caractères ». Sans issue, et sans explication.
    await monter(unProfil({ date_naissance: '1990-01-01' }));

    saisir('mdp', '123456789'); // neuf
    saisir('confirmation', '123456789');
    soumettre();
    await fixture.whenStable();
    expect(appels).not.toContain('definirNouveauMotDePasse');

    saisir('mdp', '1234567890'); // dix
    saisir('confirmation', '1234567890');
    soumettre();
    await fixture.whenStable();
    expect(appels).toContain('definirNouveauMotDePasse');
  });

  it('n’appelle pas la date quand elle est déjà connue', async () => {
    await monter(unProfil({ date_naissance: '1990-01-01' }));

    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    expect(appels).not.toContain('definirDateNaissance');
    expect(appels).toContain('definirNouveauMotDePasse');
  });
});
