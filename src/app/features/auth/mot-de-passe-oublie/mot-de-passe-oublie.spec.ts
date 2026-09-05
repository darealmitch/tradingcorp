import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { MotDePasseOublie } from './mot-de-passe-oublie';
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
    date_modification: '2026-01-01',
    ...surcharge,
  } as Profil;
}

/**
 * Ce que vérifient ces tests : la date de naissance est réclamée à qui ne l'a
 * pas, jamais aux autres, et toujours AVANT le mot de passe. Les anciens élèves
 * repris de Wix arrivent sans elle — l'export n'en portait aucune — et un
 * compte ne doit pas devenir utilisable sans que la majorité soit établie.
 */
describe('MotDePasseOublie — étape date de naissance', () => {
  let fixture: ComponentFixture<MotDePasseOublie>;
  let appels: string[];
  let profil: ReturnType<typeof signal<Profil | null>>;

  function html(): string {
    return (fixture.nativeElement as HTMLElement).innerHTML;
  }

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
    profil = signal<Profil | null>(profilRendu);

    const doubleAuth = {
      profil,
      demanderReinitialisation: async () => {
        appels.push('demande');
        return { ok: true };
      },
      verifierCodeReinitialisation: async () => {
        appels.push('verifierCode');
        return { ok: true };
      },
      definirDateNaissance: async () => {
        appels.push('definirDateNaissance');
        return { ok: true };
      },
      definirNouveauMotDePasse: async () => {
        appels.push('definirNouveauMotDePasse');
        return { ok: true };
      },
    };

    await TestBed.configureTestingModule({
      imports: [MotDePasseOublie],
      providers: [
        // La route d'arrivée doit exister : le composant y navigue en fin de
        // parcours, et un routeur vide rejetait la navigation — une erreur hors
        // test, invisible en local mais fatale à l'intégration continue.
        provideRouter([{ path: 'espace', children: [] }]),
        { provide: AuthService, useValue: doubleAuth },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MotDePasseOublie);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Va jusqu'à l'écran de finalisation : adresse, puis code. */
  async function allerJusquAuMotDePasse(): Promise<void> {
    saisir('email', 'ada@exemple.fr');
    soumettre();
    await fixture.whenStable();
    fixture.detectChanges();

    saisir('code', '123456');
    soumettre();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('ne réclame pas la date à qui la connaît déjà', async () => {
    await monter(unProfil({ date_naissance: '1990-01-01' }));
    await allerJusquAuMotDePasse();

    expect(champ('dateNaissance')).toBeNull();
    expect(champ('mdp')).not.toBeNull();
  });

  it('réclame la date à un apprenant qui ne l’a pas', async () => {
    // Le cas des anciens élèves migrés depuis Wix.
    await monter(unProfil({ date_naissance: null }));
    await allerJusquAuMotDePasse();

    expect(champ('dateNaissance')).not.toBeNull();
    expect(html()).toContain('personnes majeures');
  });

  it('ne la réclame pas au personnel', async () => {
    // La règle des dix-huit ans vise les apprenants, pas l'équipe.
    await monter(unProfil({ role: 'formateur', date_naissance: null }));
    await allerJusquAuMotDePasse();

    expect(champ('dateNaissance')).toBeNull();
  });

  it('refuse de finaliser tant que la date manque', async () => {
    await monter(unProfil({ date_naissance: null }));
    await allerJusquAuMotDePasse();

    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    // Ni date, ni mot de passe : la récupération n'est pas finalisée.
    expect(appels).not.toContain('definirDateNaissance');
    expect(appels).not.toContain('definirNouveauMotDePasse');
  });

  it('enregistre la date AVANT le mot de passe', async () => {
    await monter(unProfil({ date_naissance: null }));
    await allerJusquAuMotDePasse();

    saisir('dateNaissance', '1990-05-04');
    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    // L'ordre est le fond du sujet : poser l'inverse laisserait un compte
    // utilisable sans que la majorité ait été établie.
    expect(appels.indexOf('definirDateNaissance')).toBeGreaterThan(-1);
    expect(appels.indexOf('definirDateNaissance')).toBeLessThan(
      appels.indexOf('definirNouveauMotDePasse'),
    );
  });

  it('n’appelle pas la date quand elle est déjà connue', async () => {
    await monter(unProfil({ date_naissance: '1990-01-01' }));
    await allerJusquAuMotDePasse();

    saisir('mdp', 'un-mot-de-passe-long');
    saisir('confirmation', 'un-mot-de-passe-long');
    soumettre();
    await fixture.whenStable();

    expect(appels).not.toContain('definirDateNaissance');
    expect(appels).toContain('definirNouveauMotDePasse');
  });

  it('vérifie le code avant de montrer le mot de passe', async () => {
    await monter(unProfil());
    saisir('email', 'ada@exemple.fr');
    soumettre();
    await fixture.whenStable();
    fixture.detectChanges();

    // À l'étape du code, aucun champ de mot de passe : le code seul d'abord.
    expect(champ('code')).not.toBeNull();
    expect(champ('mdp')).toBeNull();
  });
});
