import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { DonneesPersonnellesService } from '../../core/donnees-personnelles/donnees-personnelles.service';
import { Desinscription } from './desinscription';

/**
 * Le lien de chaque e-mail d'annonce mène ici, sans connexion. La personne
 * confirme d'un clic — la page ne désinscrit personne à la simple ouverture,
 * puisque certaines messageries visitent les liens pour les analyser.
 */

const JETON = '3f2b8c1e-9a4d-4b7e-8c21-0d5e6f7a8b9c';

async function monter(jeton: string | null, reponse: boolean | null = true) {
  const desinscrireNouveautes = vi.fn(() => Promise.resolve(reponse));
  TestBed.configureTestingModule({
    imports: [Desinscription],
    providers: [
      provideRouter([]),
      { provide: DonneesPersonnellesService, useValue: { desinscrireNouveautes } },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: { queryParamMap: convertToParamMap(jeton === null ? {} : { jeton }) },
        },
      },
    ],
  });
  const fixture: ComponentFixture<Desinscription> = TestBed.createComponent(Desinscription);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  return { fixture, page, desinscrireNouveautes };
}

function texte(page: HTMLElement): string {
  return page.textContent?.replace(/\s+/g, ' ') ?? '';
}

async function cliquerDesinscrire(fixture: ComponentFixture<Desinscription>): Promise<void> {
  const page = fixture.nativeElement as HTMLElement;
  page.querySelector<HTMLButtonElement>('button')?.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('Désinscription des nouveautés', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('ne désinscrit personne à l’ouverture de la page', async () => {
    const { page, desinscrireNouveautes } = await monter(JETON);

    expect(desinscrireNouveautes).not.toHaveBeenCalled();
    expect(page.querySelector('button')?.textContent).toContain('Me désinscrire');
  });

  it('désinscrit d’un clic, et le confirme', async () => {
    const { fixture, page, desinscrireNouveautes } = await monter(JETON);

    await cliquerDesinscrire(fixture);

    expect(desinscrireNouveautes).toHaveBeenCalledWith(JETON);
    expect(texte(page)).toContain('tu ne recevras plus les nouveautés');
    expect(page.querySelector('button')).toBeNull();
  });

  it('dit qu’un lien incomplet ne peut rien faire, sans appeler la base', async () => {
    const { page, desinscrireNouveautes } = await monter('pas-un-jeton');

    expect(texte(page)).toContain('Ce lien de désinscription est incomplet');
    expect(page.querySelector('button')).toBeNull();
    expect(desinscrireNouveautes).not.toHaveBeenCalled();
  });

  it('dit qu’un lien n’est plus valable quand la base ne reconnaît pas le jeton', async () => {
    const { fixture, page } = await monter(JETON, false);

    await cliquerDesinscrire(fixture);

    expect(texte(page)).toContain("Ce lien n'est plus valable");
  });

  it('propose de réessayer si la base n’a pas répondu', async () => {
    const { fixture, page } = await monter(JETON, null);

    await cliquerDesinscrire(fixture);

    expect(texte(page)).toContain("La désinscription n'a pas pu aboutir");
    expect(page.querySelector('button')?.disabled).toBe(false);
  });
});
