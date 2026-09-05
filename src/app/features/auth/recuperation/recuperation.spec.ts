import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { convertToParamMap } from '@angular/router';
import { Recuperation } from './recuperation';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * La porte d'entrée du lien reçu par e-mail. Ce qui est éprouvé ici : le jeton
 * haché est bien transmis au service, et l'écran ne laisse jamais quelqu'un
 * devant une page muette quand le lien a expiré.
 */
describe('Recuperation', () => {
  let fixture: ComponentFixture<Recuperation>;
  let recus: { jeton: string; type: string }[];
  let navigations: string[];

  async function monter(
    params: Record<string, string>,
    reponse: { ok: boolean; erreur?: string } = { ok: true },
  ): Promise<void> {
    recus = [];
    navigations = [];

    await TestBed.configureTestingModule({
      imports: [Recuperation],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(params) } },
        },
        {
          provide: AuthService,
          useValue: {
            ouvrirSessionDepuisLien: async (jeton: string, type: string) => {
              recus.push({ jeton, type });
              return reponse;
            },
          },
        },
      ],
    }).compileComponents();

    const router = TestBed.inject(Router);
    router.navigateByUrl = async (url: string) => {
      navigations.push(url);
      return true;
    };

    fixture = TestBed.createComponent(Recuperation);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  function texte(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  it('transmet le jeton haché du lien, avec son type', async () => {
    await monter({ token_hash: 'abc123', type: 'recovery' });

    expect(recus).toEqual([{ jeton: 'abc123', type: 'recovery' }]);
  });

  it('mène à l’écran de choix du mot de passe quand le lien est bon', async () => {
    await monter({ token_hash: 'abc123', type: 'recovery' });

    expect(navigations).toEqual(['/nouveau-mot-de-passe']);
  });

  it('accepte aussi une invitation', async () => {
    // Les anciens élèves repris de Wix reçoivent ce type-là.
    await monter({ token_hash: 'xyz789', type: 'invite' });

    expect(recus[0].type).toBe('invite');
    expect(navigations).toEqual(['/nouveau-mot-de-passe']);
  });

  it('explique quoi faire quand le lien a expiré', async () => {
    await monter(
      { token_hash: 'perime', type: 'recovery' },
      { ok: false, erreur: 'Code incorrect ou expiré. Demande un nouveau code.' },
    );

    expect(navigations).toEqual([]);
    expect(texte()).toContain('Ce lien n');
    // Une issue, pas seulement un constat d'échec.
    const lien = (fixture.nativeElement as HTMLElement).querySelector('a');
    expect(lien?.getAttribute('href')).toBe('/mot-de-passe-oublie');
  });

  it('ne tente rien avec un lien tronqué', async () => {
    await monter({ type: 'recovery' });

    expect(recus).toEqual([]);
    expect(navigations).toEqual([]);
    expect(texte()).toContain('incomplet');
  });
});
