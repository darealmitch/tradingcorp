import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Ressource } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { MediaService } from '../../../core/media/media.service';
import { RessourcesLecon } from './ressources-lecon';

/**
 * Les membres visés sont `protected` : ils forment l'API du gabarit, donc le
 * contrat réellement observable du composant.
 */
interface Interne {
  videos(): Ressource[];
  liens(): Ressource[];
  videoPrete(r: Ressource): boolean;
  srcVideo(r: Ressource): string | null;
}

function ressource(partiel: Partial<Ressource> = {}): Ressource {
  return {
    id_ressource: 'r-1',
    nom: 'Ressource',
    type: 'video',
    description: null,
    type_mime: null,
    cloudinary_public_id: null,
    chemin_storage: null,
    url: null,
    a_video_hebergee: false,
    contenu: null,
    langage: null,
    taille: null,
    position: 1,
    ...partiel,
  };
}

describe('RessourcesLecon', () => {
  let fixture: ComponentFixture<RessourcesLecon>;
  let interne: Interne;
  let demandes: string[];
  let adresseRendue: string | null;

  /** Pose les ressources et laisse les effets tourner. */
  async function poser(ressources: Ressource[]): Promise<void> {
    fixture.componentRef.setInput('ressources', ressources);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    demandes = [];
    adresseRendue = 'https://cdn/bcdn_token=abc&expires=1/v/playlist.m3u8';

    await TestBed.configureTestingModule({
      imports: [RessourcesLecon],
      providers: [
        {
          provide: ContenuService,
          useValue: {
            urlVideoRessourceSignee: (id: string) => {
              demandes.push(id);
              return Promise.resolve(adresseRendue);
            },
          },
        },
        {
          provide: MediaService,
          useValue: {
            videoUrl: (id: string) => `cloudinary://${id}`,
            pdfUrl: (id: string) => `pdf://${id}`,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RessourcesLecon);
    interne = fixture.componentInstance as unknown as Interne;
  });

  describe('vidéos hébergées par le projet', () => {
    it('les lit dans la page au lieu d’en proposer le lien', async () => {
      // Le lien menait au lecteur d'embed Bunny, consultable sans compte par
      // quiconque avait l'adresse : c'est ce lien qui ne doit plus exister.
      const video = ressource({ type: 'video', a_video_hebergee: true });

      await poser([video]);

      expect(interne.videos().map((r) => r.id_ressource)).toEqual(['r-1']);
      expect(interne.liens()).toEqual([]);
    });

    it('demande son adresse signée, une seule fois', async () => {
      const video = ressource({ type: 'video', a_video_hebergee: true });

      await poser([video]);
      await poser([video]);

      expect(demandes).toEqual(['r-1']);
      expect(interne.videoPrete(video)).toBe(true);
    });

    it('laisse la balise sans src — hls.js alimente l’élément', async () => {
      const video = ressource({ type: 'video', a_video_hebergee: true });

      await poser([video]);

      // Un `src` concurrent ferait échouer la lecture par MediaSource.
      expect(interne.srcVideo(video)).toBeNull();
    });

    it('n’annonce pas la vidéo prête tant que l’adresse est refusée', async () => {
      adresseRendue = null;
      const video = ressource({ type: 'video', a_video_hebergee: true });

      await poser([video]);

      expect(interne.videoPrete(video)).toBe(false);
    });
  });

  describe('ressources servies par un lien', () => {
    it('garde une vidéo externe dans la liste des liens', async () => {
      // Une vidéo tierce (YouTube, par exemple) n'est pas la nôtre : rien à
      // signer, et rien à lire dans la page.
      const externe = ressource({
        type: 'video',
        a_video_hebergee: false,
        url: 'https://www.youtube.com/watch?v=abc',
      });

      await poser([externe]);

      expect(interne.liens().map((r) => r.id_ressource)).toEqual(['r-1']);
      expect(interne.videos()).toEqual([]);
      expect(demandes).toEqual([]);
    });

    it('n’envoie aucune demande pour un PDF', async () => {
      await poser([ressource({ type: 'pdf', cloudinary_public_id: 'doc' })]);

      expect(demandes).toEqual([]);
    });
  });
});
