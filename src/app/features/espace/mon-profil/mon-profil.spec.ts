import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { DonneesPersonnellesService } from '../../../core/donnees-personnelles/donnees-personnelles.service';
import { MonProfil } from './mon-profil';

/**
 * Nouveautés par e-mail : un consentement, aussi simple à retirer qu'à donner.
 * Si la base refuse, la case revient à son état réel — laisser croire qu'on
 * s'est désinscrit alors que les e-mails continueraient serait la pire issue.
 */

async function monter(refus: string | null = null) {
  const definirMesNouveautes = vi.fn(() => Promise.resolve(refus));
  const rechargerProfil = vi.fn(() => Promise.resolve());
  TestBed.configureTestingModule({
    imports: [MonProfil],
    providers: [
      provideRouter([]),
      {
        provide: AuthService,
        useValue: {
          profil: signal({
            id_profil: 'lea',
            prenom: 'Léa',
            nom: 'Martin',
            role: 'apprenant',
            date_creation: '2026-10-01T10:00:00Z',
            date_naissance: '1996-06-06',
            doit_changer_mdp: false,
            est_test: false,
            est_proprietaire: false,
            accepte_nouveautes: false,
          }),
          session: signal({ user: { email: 'lea@exemple.com' } }),
          rechargerProfil,
        },
      },
      { provide: DonneesPersonnellesService, useValue: { definirMesNouveautes } },
    ],
  });
  const fixture: ComponentFixture<MonProfil> = TestBed.createComponent(MonProfil);
  fixture.detectChanges();
  await fixture.whenStable();
  const page = fixture.nativeElement as HTMLElement;
  const caseNouveautes = page.querySelector<HTMLInputElement>('.profil-case input');
  return { fixture, page, caseNouveautes, definirMesNouveautes, rechargerProfil };
}

describe('Mon profil — nouveautés par e-mail', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('montre l’accord tel qu’il est enregistré : décoché', async () => {
    const { caseNouveautes } = await monter();

    expect(caseNouveautes?.checked).toBe(false);
  });

  it('donne l’accord d’un clic, puis relit le profil', async () => {
    const { fixture, caseNouveautes, definirMesNouveautes, rechargerProfil } = await monter();

    caseNouveautes?.click();
    await fixture.whenStable();

    expect(definirMesNouveautes).toHaveBeenCalledWith(true);
    expect(rechargerProfil).toHaveBeenCalled();
  });

  it('remet la case dans son état réel si la base refuse', async () => {
    const { fixture, page, caseNouveautes } = await monter(
      'Le réglage n’a pas pu être enregistré.',
    );

    caseNouveautes?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(caseNouveautes?.checked).toBe(false);
    expect(page.querySelector('.message-erreur')?.textContent).toContain(
      'Le réglage n’a pas pu être enregistré.',
    );
  });
});
