import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { VitrineService } from '../../../core/commerce/vitrine.service';
import { MesureService } from '../../../core/mesure/mesure.service';
import { Inscription } from './inscription';

/**
 * L'inscription est la porte du tunnel d'achat. Deux promesses y sont
 * éprouvées : l'acheteur décidé arrive sur l'écran d'achat sans détour, et la
 * page ne promet des leçons offertes que s'il y en a.
 */
describe('Inscription', () => {
  let fixture: ComponentFixture<Inscription>;
  let navigateByUrl: ReturnType<typeof vi.fn>;
  let compterInscription: ReturnType<typeof vi.fn>;

  async function monter(
    retour: string | null,
    offertes = 3,
    resultat: { ok: boolean; erreur?: string } = { ok: true },
  ): Promise<HTMLElement> {
    compterInscription = vi.fn();
    TestBed.configureTestingModule({
      imports: [Inscription],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap(retour ? { retour } : {}) },
          },
        },
        {
          provide: AuthService,
          useValue: { inscription: () => Promise.resolve(resultat) },
        },
        { provide: VitrineService, useValue: { nombreOffertes: signal(offertes) } },
        { provide: MesureService, useValue: { inscription: compterInscription } },
      ],
    });
    navigateByUrl = vi
      .spyOn(TestBed.inject(Router), 'navigateByUrl')
      .mockResolvedValue(true) as unknown as ReturnType<typeof vi.fn>;
    fixture = TestBed.createComponent(Inscription);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  function saisir(page: HTMLElement, id: string, valeur: string): void {
    const champ = page.querySelector<HTMLInputElement>(`#${id}`)!;
    champ.value = valeur;
    champ.dispatchEvent(new Event('input'));
  }

  async function remplirEtEnvoyer(page: HTMLElement): Promise<void> {
    saisir(page, 'prenom', 'Lea');
    saisir(page, 'nom', 'Essai');
    saisir(page, 'date_naissance', '1990-01-01');
    saisir(page, 'email', 'lea@exemple.invalid');
    saisir(page, 'mdp', 'motdepasse-solide');
    saisir(page, 'confirmation', 'motdepasse-solide');
    page.querySelector<HTMLInputElement>('input[formcontrolname="conditions"]')!.click();
    fixture.detectChanges();
    page.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  function sousTitre(page: HTMLElement): string {
    return (page.querySelector('.auth-sub')?.textContent ?? '').replace(/\s+/g, ' ').trim();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('mène l’acheteur décidé à l’écran d’achat, en le lui annonçant', async () => {
    const page = await monter('/espace/formations');

    expect(sousTitre(page)).toContain('Étape 1 sur 2');
    await remplirEtEnvoyer(page);

    expect(navigateByUrl).toHaveBeenCalledWith('/espace/formations');
  });

  it('ignore une destination hors du site', async () => {
    const page = await monter('//exemple.com/fausse-confirmation');

    await remplirEtEnvoyer(page);

    expect(navigateByUrl).toHaveBeenCalledWith('/espace');
  });

  it('annonce les leçons offertes quand il y en a', async () => {
    const page = await monter(null, 3);

    expect(sousTitre(page)).toContain('gratuit');
    expect(sousTitre(page)).toContain('3 leçons offertes');
    expect(sousTitre(page)).toContain('sans carte bancaire');
  });

  it('n’en promet aucune quand il n’y en a pas', async () => {
    const page = await monter(null, 0);

    expect(sousTitre(page)).not.toContain('offerte');
  });

  it('compte la provenance d’un compte ouvert, et seulement d’un compte ouvert', async () => {
    let page = await monter(null);
    await remplirEtEnvoyer(page);
    expect(compterInscription).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    page = await monter(null, 3, { ok: false, erreur: 'Adresse déjà utilisée.' });
    await remplirEtEnvoyer(page);
    expect(compterInscription).not.toHaveBeenCalled();
  });

  it('garde la destination sur le lien « Se connecter », pour qui a déjà un compte', async () => {
    const page = await monter('/espace/formations');

    const lien = [...page.querySelectorAll<HTMLAnchorElement>('a')].find(
      (a) => a.textContent?.trim() === 'Se connecter',
    );
    expect(lien?.getAttribute('href')).toBe('/connexion?retour=%2Fespace%2Fformations');
  });
});
