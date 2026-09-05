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

function fichier(contenu: string): File {
  return new File([contenu], 'participants.csv', { type: 'text/csv' });
}

describe('Migration — lecture de l’export Wix', () => {
  let fixture: ComponentFixture<Migration>;
  let composant: Migration;

  /** Le composant expose son état en `protected` : les tests passent outre. */
  function etat() {
    const c = composant as unknown as {
      lireFichier(f: File): Promise<void>;
      exploitables(): { email: string; etapes: number; nom: string }[];
      ecartes(): { email: string; motif: string | null }[];
      selection(): { email: string }[];
      avecProgression(): { email: string }[];
      basculer(email: string): void;
      toutChoisir(): void;
      neRienChoisir(): void;
      lectureImpossible(): boolean;
      pourcentage(n: number): number;
      intitule(e: { nom: string; email: string }): string;
    };
    return c;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Migration],
      providers: [{ provide: MigrationService, useValue: { executer: async () => ({}) } }],
    }).compileComponents();

    fixture = TestBed.createComponent(Migration);
    composant = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('n’a rien à montrer avant qu’un fichier soit déposé', () => {
    expect(etat().exploitables().length).toBe(0);
  });

  it('lit les colonnes par leur nom, pas par leur rang', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));
    const nathan = etat()
      .exploitables()
      .find((e) => e.email.startsWith('nathan'));
    expect(nathan?.etapes).toBe(29);
  });

  it('coche d’emblée ceux qui ont commencé, et eux seuls', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));

    // Les trois sont proposés — on ne cache personne…
    expect(etat().exploitables().length).toBe(3);
    // …mais celui qui n'a jamais rien ouvert n'est pas retenu d'office.
    expect(etat().selection().length).toBe(2);
    expect(
      etat()
        .selection()
        .map((e) => e.email),
    ).not.toContain('jonathanlombi@gmail.com');
  });

  it('laisse reprendre la main sur la sélection', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));

    etat().basculer('jonathanlombi@gmail.com');
    expect(etat().selection().length).toBe(3);

    etat().neRienChoisir();
    expect(etat().selection().length).toBe(0);

    etat().toutChoisir();
    expect(etat().selection().length).toBe(3);
  });

  it('normalise la casse des adresses', async () => {
    // Wix exporte la même personne tantôt en majuscules, tantôt non : sans
    // normalisation, elle reviendrait sous deux comptes distincts.
    await etat().lireFichier(fichier(EXPORT_WIX));
    const emails = etat()
      .exploitables()
      .map((e) => e.email);

    expect(emails).toContain('mehdaoui.nabil113@gmail.com');
    expect(emails.every((e) => e === e.toLowerCase())).toBe(true);
  });

  it('écarte une adresse répétée dans le fichier', async () => {
    await etat().lireFichier(
      fichier(
        [
          'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
          '"a";"X";"double@exemple.fr";"";"";10;103',
          '"b";"X";"DOUBLE@exemple.fr";"";"";12;103',
        ].join('\n'),
      ),
    );

    expect(etat().exploitables().length).toBe(1);
    expect(etat().ecartes()[0].motif).toContain('deux fois');
  });

  it('écarte une ligne sans adresse exploitable', async () => {
    await etat().lireFichier(
      fichier(
        [
          'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
          '"a";"X";"pas-une-adresse";"";"";10;103',
        ].join('\n'),
      ),
    );

    expect(etat().exploitables().length).toBe(0);
    expect(etat().ecartes()[0].motif).toContain('illisible');
  });

  it('signale un fichier qui n’est pas le bon export', async () => {
    // Typiquement la liste de contacts, qui ne porte aucun avancement.
    await etat().lireFichier(fichier('Prénom,Nom,E-mail 1\nAda,Lovelace,ada@exemple.fr'));

    expect(etat().exploitables().length).toBe(0);
    expect(etat().lectureImpossible()).toBe(true);
  });

  it('affiche l’adresse quand Wix n’a pas donné de nom', async () => {
    await etat().lireFichier(
      fichier(
        [
          'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
          '"a";"";"sans.nom@exemple.fr";"";"";5;103',
        ].join('\n'),
      ),
    );

    const eleve = etat().exploitables()[0];
    expect(etat().intitule(eleve)).toBe('sans.nom@exemple.fr');
  });

  it('exprime l’avancement en pourcentage du parcours', async () => {
    expect(etat().pourcentage(29)).toBe(28);
    expect(etat().pourcentage(103)).toBe(100);
  });
});
