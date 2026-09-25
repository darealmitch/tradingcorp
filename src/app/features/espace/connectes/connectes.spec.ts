import { TestBed } from '@angular/core/testing';
import { EleveConnecte } from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import { SIGNAL_PRESENCE_S } from '../../../core/presence/presence.service';
import { Connectes, lirePresence } from './connectes';

function eleve(prenom: string, inactifDepuisS: number): EleveConnecte {
  return {
    id_profil: `id-${prenom}`,
    prenom,
    nom: 'Essai',
    est_test: false,
    inscrit: true,
    depuis: '2026-09-25T14:02:00Z',
    inactif_depuis_s: inactifDepuisS,
  };
}

describe('lirePresence', () => {
  // Les bornes ci-dessous ne fixent pas LE seuil : elles encadrent ce que tout
  // seuil raisonnable doit respecter, compte tenu de la cadence du signal.

  it('tient pour en ligne l’élève qui vient de donner signe de vie', () => {
    expect(lirePresence(5).enLigne).toBe(true);
  });

  it('ne fait pas « partir » un élève dont le signal a un peu de retard', () => {
    expect(lirePresence(SIGNAL_PRESENCE_S + 15).enLigne).toBe(true);
  });

  it('ne tient plus pour en ligne l’élève silencieux depuis des heures', () => {
    expect(lirePresence(3 * 3600).enLigne).toBe(false);
  });

  it('donne toujours un libellé à afficher', () => {
    for (const secondes of [0, 45, 600, 7200, 86_000]) {
      expect(lirePresence(secondes).libelle.trim()).not.toBe('');
    }
  });
});

describe('Connectes', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sépare les élèves en ligne de ceux passés dans la journée', async () => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: PilotageService,
          useValue: {
            elevesConnectes: () => Promise.resolve([eleve('Nina', 5), eleve('Omar', 3 * 3600)]),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(Connectes);
    for (let i = 0; i < 3; i++) {
      fixture.detectChanges();
      await fixture.whenStable();
    }

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.tableau-en-ligne')?.textContent).toContain('Nina');
    expect(page.querySelector('.tableau-en-ligne')?.textContent).not.toContain('Omar');
    expect(page.querySelector('.tableau-recents')?.textContent).toContain('Omar');
    expect(page.textContent).toContain('1 en ligne');
  });
});
