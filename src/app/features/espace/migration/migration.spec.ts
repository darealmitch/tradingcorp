import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Migration } from './migration';
import { MigrationService } from '../../../core/comptes/migration.service';

/** Extrait de l'export Wix, casse et guillemets d'origine compris — personnes fictives. */
const EXPORT_WIX = [
  'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
  '"0a0a0a01";"camille.durand";"camille.durand@example.com";"2023-09-25T17:00:22.61Z";"2025-12-04T21:57:47.071Z";29;103',
  '"0a0a0a02";"Moreau.lea42";"Moreau.lea42@example.com";"2025-01-27T20:56:27.398Z";"2025-02-01T14:52:39.267Z";18;103',
  '"0a0a0a03";"Hugo Bernard";"hugobernard@example.com";"2024-07-11T19:07:21.99Z";"2024-07-11T19:07:21.99Z";0;103',
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
      identite(email: string): string;
      corrigerIdentite(email: string, valeur: string): void;
      identiteDeduite(e: { nom: string; email: string }): boolean;
      aMigrer(): { email: string; prenom: string; nom: string }[];
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
    const camille = etat()
      .exploitables()
      .find((e) => e.email.startsWith('camille'));
    expect(camille?.etapes).toBe(29);
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
    ).not.toContain('hugobernard@example.com');
  });

  it('laisse reprendre la main sur la sélection', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));

    etat().basculer('hugobernard@example.com');
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

    expect(emails).toContain('moreau.lea42@example.com');
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

  it('tire une identité lisible d’un identifiant, plutôt que de renoncer', async () => {
    // Laisser le champ vide revenait à le laisser vide pour de bon : le premier
    // élève repris est arrivé en base sans prénom ni nom (24/09/2026), et c'est
    // ce nom-là que `generer-certificat` imprime sur un diplôme.
    await etat().lireFichier(fichier(EXPORT_WIX));

    expect(etat().identite('camille.durand@example.com')).toBe('Camille Durand');
    // Les chiffres tombent ; l'ordre reste celui de Wix, d'où l'avertissement.
    expect(etat().identite('moreau.lea42@example.com')).toBe('Moreau Lea');

    const camille = etat()
      .exploitables()
      .find((e) => e.email.startsWith('camille'))!;
    expect(etat().identiteDeduite(camille)).toBe(true);
  });

  it('garde et capitalise un nom qui en est un', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));
    expect(etat().identite('hugobernard@example.com')).toBe('Hugo Bernard');
  });

  it('laisse corriger l’identité avant la reprise', async () => {
    await etat().lireFichier(fichier(EXPORT_WIX));
    etat().corrigerIdentite('camille.durand@example.com', 'Camille Durand');

    const camille = etat()
      .aMigrer()
      .find((e) => e.email.startsWith('camille'));
    expect(camille?.prenom).toBe('Camille');
    expect(camille?.nom).toBe('Durand');
  });

  it('retombe sur l’adresse quand Wix ne donne aucun nom', async () => {
    await etat().lireFichier(
      fichier(
        [
          'participantId;name;email;joinDate;lastActivity;nStepsCompleted;nStepsAvailable',
          '"a";"";"sans.nom@exemple.fr";"";"";5;103',
        ].join('\n'),
      ),
    );

    // Faute de mieux, la partie gauche de l'adresse : c'est encore ce qui
    // ressemble le plus à une identité, et l'écran le signale.
    expect(etat().identite('sans.nom@exemple.fr')).toBe('Sans Nom');
    expect(etat().identiteDeduite(etat().exploitables()[0])).toBe(true);
  });

  it('exprime l’avancement en pourcentage du parcours', async () => {
    expect(etat().pourcentage(29)).toBe(28);
    expect(etat().pourcentage(103)).toBe(100);
  });
});
