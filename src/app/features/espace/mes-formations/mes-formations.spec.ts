import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { Vitrine } from '../../../core/commerce/vitrine.model';
import { VitrineService } from '../../../core/commerce/vitrine.service';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { Certificat } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { MesFormations } from './mes-formations';

const FORMATION: Formation = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  slug: 'trader-pro',
  description: null,
  prix_centimes: 99_700,
  devise: 'eur',
};

const VITRINE: Vitrine = {
  id_formation: 'f-1',
  titre: 'Formation Trader Pro',
  prix_centimes: 99_700,
  devise: 'eur',
  delivre_certificat: true,
  modules: 8,
  lecons_video: 64,
  secondes_video: 145_044,
  quiz: 30,
  ressources: 15,
  lecons_offertes: [],
  programme: [],
};

const CERTIFICAT: Certificat = {
  id_certificat: 'c-1',
  id_formation: 'f-1',
  numero: 'TC-ABCD-EFGH',
  date_obtention: '2026-10-01T10:00:00Z',
  formations: { titre: 'Formation Trader Pro' },
};

/**
 * L'écran d'achat est le point de décision : 997 € s'y paient. Il doit dire ce
 * que l'achat comprend, rappeler le risque, et ne parler que de certificat.
 */
describe('Ma formation — écran d’achat', () => {
  let fixture: ComponentFixture<MesFormations>;

  async function monter(inscrit: boolean, certificats: Certificat[] = []): Promise<HTMLElement> {
    const v = signal<Vitrine | null>(VITRINE);
    TestBed.configureTestingModule({
      imports: [MesFormations],
      providers: [
        provideRouter([]),
        {
          provide: CommerceService,
          useValue: {
            chargerFormations: () => Promise.resolve([FORMATION]),
            chargerInscriptions: () =>
              Promise.resolve(
                inscrit ? [{ id_inscription: 'i-1', id_formation: 'f-1', statut: 'active' }] : [],
              ),
            lancerCheckout: vi.fn(() => Promise.resolve(null)),
          },
        },
        {
          provide: ContenuService,
          useValue: {
            chargerParcours: () => Promise.resolve(null),
            mesCertificats: () => Promise.resolve(certificats),
          },
        },
        {
          provide: VitrineService,
          useValue: { vitrine: v, charger: () => Promise.resolve(v()), prix: computed(() => null) },
        },
        {
          provide: CommunauteService,
          useValue: { monAvis: () => Promise.resolve(null) },
        },
      ],
    });
    fixture = TestBed.createComponent(MesFormations);
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resoudre) => setTimeout(resoudre, 0));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function texte(page: HTMLElement): string {
    return (page.textContent ?? '').replace(/[\s\u00a0]+/g, ' ');
  }

  afterEach(() => TestBed.resetTestingModule());

  it('dit ce que l’achat comprend, à côté du bouton', async () => {
    const page = await monter(false);

    expect(texte(page)).toContain('Acheter — 997 €');
    expect(texte(page)).toContain('64 leçons vidéo, soit plus de 40 heures de vidéo');
    expect(texte(page)).toContain('Un accès sans limite de durée');
  });

  it('rappelle le risque et la sécurité du paiement au point de décision', async () => {
    const page = await monter(false);

    expect(texte(page)).toContain('risque de perte en capital');
    expect(texte(page)).toContain("n'a jamais accès à tes données bancaires");
    expect(texte(page)).toContain('droit de rétractation de 14 jours');
  });

  it('ne détaille plus l’offre à qui l’a déjà', async () => {
    const page = await monter(true);

    expect(texte(page)).toContain('Accès actif');
    expect(texte(page)).not.toContain('64 leçons vidéo');
    expect(texte(page)).not.toContain('risque de perte en capital');
  });

  it('propose de télécharger un certificat, pas un diplôme', async () => {
    const page = await monter(true, [CERTIFICAT]);

    expect(texte(page)).toContain('Télécharger mon certificat (PDF)');
    expect(texte(page)).not.toContain('diplôme');
  });
});
