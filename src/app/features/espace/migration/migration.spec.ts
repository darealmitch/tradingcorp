import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Migration } from './migration';
import { MigrationService } from '../../../core/comptes/migration.service';

/** Extrait réel de l'export Wix, casse et guillemets d'origine compris. */
const EXPORT_WIX = [
  'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
  '"7e873d90";"nathan.assimba";"nathan.assimba@icloud.com";"2023-09-25T17:00:22.61Z";"2025-12-04T21:57:47.071Z";29;103',
  '"e924abbf";"Mehdaoui.nabil113";"Mehdaoui.nabil113@gmail.com";"2025-01-27T20:56:27.398Z";"2025-02-01T14:52:39.267Z";18;103',
  '"3cbbf0c0";"Jonathan Lombi";"jonathanlombi@gmail.com";"2024-07-11T19:07:21.99Z";"2024-07-11T19:07:21.99Z";0;103',
].join('\n');

describe('Migration — lecture de l’export Wix', () => {
  let fixture: ComponentFixture<Migration>;
  let composant: Migration & {
    colle: { set(v: string): void };
    inclureSansProgression: { set(v: boolean): void };
    retenues(): { email: string; etapes: number }[];
    ecartees(): { email: string; motif: string | null }[];
    lignes(): unknown[];
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Migration],
      providers: [{ provide: MigrationService, useValue: { executer: async () => ({}) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Migration);
    composant = fixture.componentInstance as never;
    fixture.detectChanges();
  });

  it('ne lit rien tant que rien n’est collé', () => {
    expect(composant.lignes().length).toBe(0);
  });

  it('lit les colonnes par leur nom, pas par leur rang', () => {
    composant.colle.set(EXPORT_WIX);
    const nathan = composant.retenues().find((l) => l.email.startsWith('nathan'));
    expect(nathan?.etapes).toBe(29);
  });

  it('écarte par défaut les inscrits sans aucune étape', () => {
    composant.colle.set(EXPORT_WIX);

    expect(composant.retenues().length).toBe(2);
    expect(composant.ecartees()[0].email).toBe('jonathanlombi@gmail.com');
    expect(composant.ecartees()[0].motif).toContain('aucune étape');
  });

  it('les inclut quand on le demande explicitement', () => {
    composant.colle.set(EXPORT_WIX);
    composant.inclureSansProgression.set(true);

    expect(composant.retenues().length).toBe(3);
  });

  it('normalise la casse des adresses', () => {
    // Wix exporte la même personne tantôt en majuscules, tantôt non : sans
    // normalisation, elle reviendrait sous deux comptes distincts.
    composant.colle.set(EXPORT_WIX);
    const emails = composant.retenues().map((l) => l.email);

    expect(emails).toContain('mehdaoui.nabil113@gmail.com');
    expect(emails.every((e) => e === e.toLowerCase())).toBe(true);
  });

  it('écarte une adresse répétée dans le fichier', () => {
    composant.colle.set(
      [
        'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
        '"a";"X";"double@exemple.fr";"";"";10;103',
        '"b";"X";"DOUBLE@exemple.fr";"";"";12;103',
      ].join('\n'),
    );

    expect(composant.retenues().length).toBe(1);
    expect(composant.ecartees()[0].motif).toContain('double');
  });

  it('écarte une ligne sans adresse exploitable', () => {
    composant.colle.set(
      [
        'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
        '"a";"X";"pas-une-adresse";"";"";10;103',
      ].join('\n'),
    );

    expect(composant.retenues().length).toBe(0);
    expect(composant.ecartees()[0].motif).toContain('illisible');
  });

  it('ne lit rien d’un fichier sans les colonnes attendues', () => {
    composant.colle.set('prenom;nom\nAda;Lovelace');
    expect(composant.lignes().length).toBe(0);
  });
});
