import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { MotDePasseOublie } from './mot-de-passe-oublie';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * Cet écran ne fait plus qu'une chose : demander l'envoi d'un lien. Il a
 * longtemps réclamé un code à six chiffres — que le gabarit d'e-mail n'envoie
 * plus depuis qu'il porte un lien. Ces tests verrouillent l'absence de ce
 * champ : un écran qui demande un code introuvable est pire que pas d'écran.
 */
describe('MotDePasseOublie', () => {
  let fixture: ComponentFixture<MotDePasseOublie>;
  let demandes: string[];

  function champ(id: string): HTMLInputElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`#${id}`);
  }

  function texte(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function saisirEtEnvoyer(adresse: string): void {
    const el = champ('email')!;
    el.value = adresse;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));
    fixture.detectChanges();
  }

  async function monter(reponse: { ok: boolean; erreur?: string } = { ok: true }): Promise<void> {
    demandes = [];
    await TestBed.configureTestingModule({
      imports: [MotDePasseOublie],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            demanderReinitialisation: async (email: string) => {
              demandes.push(email);
              return reponse;
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MotDePasseOublie);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  afterEach(() => TestBed.resetTestingModule());

  it('ne demande que l’adresse', async () => {
    await monter();

    expect(champ('email')).not.toBeNull();
    // Aucun de ces champs n'a plus lieu d'être ici.
    expect(champ('code')).toBeNull();
    expect(champ('mdp')).toBeNull();
    expect(champ('dateNaissance')).toBeNull();
    expect(texte()).toContain('un lien');
  });

  it('ne parle jamais de code à six chiffres', async () => {
    await monter();
    expect(texte()).not.toContain('six chiffres');
    expect(texte()).not.toContain('code');
  });

  it('transmet l’adresse saisie', async () => {
    await monter();
    saisirEtEnvoyer('ada@exemple.fr');
    await fixture.whenStable();

    expect(demandes).toEqual(['ada@exemple.fr']);
  });

  it('renvoie vers la boîte mail, sans réclamer quoi que ce soit', async () => {
    await monter();
    saisirEtEnvoyer('ada@exemple.fr');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texte()).toContain('Regarde ta boîte mail');
    expect(texte()).toContain('Récupérer mon compte');
    expect(champ('code')).toBeNull();
  });

  it('ne révèle pas si l’adresse a un compte', async () => {
    // Distinguer « adresse inconnue » de « lien envoyé » offrirait la liste des
    // clients à qui voudrait la deviner.
    await monter();
    saisirEtEnvoyer('inconnu@exemple.fr');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texte()).toContain('Si un compte existe');
  });

  it('dit la panne d’envoi plutôt que de la taire', async () => {
    await monter({ ok: false, erreur: 'SMTP indisponible' });
    saisirEtEnvoyer('ada@exemple.fr');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(texte()).toContain('SMTP indisponible');
    expect(texte()).not.toContain('Regarde ta boîte mail');
  });

  it('n’envoie rien sur une adresse invalide', async () => {
    await monter();
    saisirEtEnvoyer('pas-une-adresse');
    await fixture.whenStable();

    expect(demandes).toEqual([]);
  });
});
