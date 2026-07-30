import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { convertToParamMap } from '@angular/router';
import { LeconJouable } from '../../../core/contenu/apprentissage.model';
import { AuthService } from '../../../core/auth/auth.service';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { QuizService } from '../../../core/contenu/quiz.service';
import { MediaService } from '../../../core/media/media.service';
import { LeconPlayer } from './lecon-player';

/**
 * Les méthodes visées sont `protected` : elles constituent l'API du gabarit,
 * donc le contrat réellement observable du composant. Le cast donne au test le
 * même point de vue que le template, sans élargir la visibilité en production.
 */
interface Interne {
  lecon: ReturnType<typeof signal<LeconJouable | null>>;
  videoFinie: ReturnType<typeof signal<boolean>>;
  tempsMax: number;
  videoUrl(l: LeconJouable): string | null;
  srcDirect(l: LeconJouable): string | null;
  poster(l: LeconJouable): string;
  paragraphes(l: LeconJouable): string[];
  peutValider(l: LeconJouable): boolean;
  surSeek(): void;
  reprendre(l: LeconJouable): void;
  sauverPosition(): void;
}

function lecon(partiel: Partial<LeconJouable> = {}): LeconJouable {
  return {
    id_lecon: 'l-1',
    id_section: 's-1',
    titre: 'Chapitre',
    type: 'video',
    description: null,
    contenu: null,
    duree_s: 600,
    video_provider: 'bunny',
    video_provider_id: null,
    video_url: null,
    video_metadata: null,
    pdf_public_id: null,
    position: 1,
    position_video_s: 0,
    video_terminee_le: null,
    terminee_le: null,
    id_quiz: null,
    ressources: [],
    ...partiel,
  };
}

describe('LeconPlayer', () => {
  let fixture: ComponentFixture<LeconPlayer>;
  let interne: Interne;
  let estCompteTest: ReturnType<typeof signal<boolean>>;
  let positionsEnregistrees: { id: string; secondes: number }[];

  beforeEach(async () => {
    estCompteTest = signal(false);
    positionsEnregistrees = [];

    const contenuDouble = {
      chargerLeconJouable: () => Promise.resolve(null),
      etatsLecons: () => Promise.resolve([]),
      terminerLecon: () => Promise.resolve(),
      marquerVideoTerminee: () => Promise.resolve(),
      enregistrerPosition: (id: string, secondes: number) => {
        positionsEnregistrees.push({ id, secondes });
        return Promise.resolve();
      },
    };

    await TestBed.configureTestingModule({
      imports: [LeconPlayer],
      providers: [
        provideRouter([]),
        { provide: ContenuService, useValue: contenuDouble },
        { provide: QuizService, useValue: { chargerQuestions: () => Promise.resolve([]) } },
        { provide: AuthService, useValue: { estCompteTest } },
        { provide: MediaService, useValue: { videoUrl: (id: string) => `cloudinary://${id}` } },
        {
          // Sans paramètre d'URL, le composant ne déclenche aucun chargement :
          // chaque test pose lui-même la leçon qu'il veut éprouver.
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({})) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeconPlayer);
    interne = fixture.componentInstance as unknown as Interne;
  });

  describe('résolution de la source vidéo', () => {
    it('privilégie video_url sur le repli Cloudinary', () => {
      const l = lecon({ video_url: 'https://cdn/x.mp4', video_provider_id: 'abc' });
      expect(interne.videoUrl(l)).toBe('https://cdn/x.mp4');
    });

    it('retombe sur Cloudinary quand seul un public_id est présent', () => {
      const l = lecon({ video_provider: 'cloudinary', video_provider_id: 'abc' });
      expect(interne.videoUrl(l)).toBe('cloudinary://abc');
    });

    it("n'invente aucune source quand la leçon n'en a pas", () => {
      expect(interne.videoUrl(lecon())).toBeNull();
    });

    it('laisse la balise sans src pour un flux HLS — hls.js alimente l’élément', () => {
      const l = lecon({ video_url: 'https://cdn/v/playlist.m3u8' });
      // Un `src` concurrent ferait échouer la lecture par MediaSource.
      expect(interne.srcDirect(l)).toBeNull();
    });

    it('pose le src directement pour un MP4', () => {
      const l = lecon({ video_url: 'https://cdn/v/play_720p.mp4' });
      expect(interne.srcDirect(l)).toBe('https://cdn/v/play_720p.mp4');
    });
  });

  describe('image de couverture', () => {
    it('utilise la couverture de marque par défaut', () => {
      // Chemin relatif : le site est déployé sous un sous-chemin.
      expect(interne.poster(lecon())).toBe('tradingCorp.png');
    });

    it('préfère une couverture propre à la vidéo si elle existe', () => {
      const l = lecon({ video_metadata: { poster: 'https://cdn/vignette.jpg' } });
      expect(interne.poster(l)).toBe('https://cdn/vignette.jpg');
    });

    it('ignore une valeur de poster inexploitable', () => {
      expect(interne.poster(lecon({ video_metadata: { poster: '' } }))).toBe('tradingCorp.png');
      expect(interne.poster(lecon({ video_metadata: { poster: 42 } }))).toBe('tradingCorp.png');
    });
  });

  describe('paragraphes d’un article', () => {
    it('sépare sur les lignes vides et ignore le vide résiduel', () => {
      const l = lecon({ type: 'article', contenu: 'Un.\n\n  \n\nDeux.\n\n' });
      expect(interne.paragraphes(l)).toEqual(['Un.', 'Deux.']);
    });

    it('retourne une liste vide sans contenu', () => {
      expect(interne.paragraphes(lecon({ type: 'article' }))).toEqual([]);
    });
  });

  describe('activation du bouton de validation', () => {
    it('refuse tant que la vidéo n’a pas été vue', () => {
      expect(interne.peutValider(lecon())).toBe(false);
    });

    it('accepte lorsque la vidéo vient de se terminer', () => {
      interne.videoFinie.set(true);
      expect(interne.peutValider(lecon())).toBe(true);
    });

    it('accepte quand le serveur a déjà mémorisé la fin de vidéo', () => {
      // Robustesse au rechargement : l'information vient de la base.
      expect(interne.peutValider(lecon({ video_terminee_le: '2026-01-01T00:00:00Z' }))).toBe(true);
    });

    it('accepte pour un compte de test, sans visionnage', () => {
      estCompteTest.set(true);
      expect(interne.peutValider(lecon())).toBe(true);
    });

    it('refuse une leçon déjà validée — il n’y a plus rien à valider', () => {
      estCompteTest.set(true);
      expect(interne.peutValider(lecon({ terminee_le: '2026-01-01T00:00:00Z' }))).toBe(false);
    });
  });

  describe('anti-avance au premier visionnage', () => {
    /**
     * Garde-fou pédagogique : sans lui, glisser le curseur jusqu'à la fin
     * suffirait à valider un chapitre sans l'avoir regardé — et à débloquer
     * la suite du parcours.
     */
    function poserVideo(l: LeconJouable, currentTime: number): HTMLVideoElement {
      interne.lecon.set(l);
      fixture.detectChanges();
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: currentTime, writable: true });
      return video;
    }

    it('ramène la lecture au point réellement atteint lors d’un saut en avant', () => {
      const video = poserVideo(lecon({ video_url: 'https://cdn/x.mp4' }), 0);
      interne.tempsMax = 30;
      video.currentTime = 500;

      interne.surSeek();

      expect(video.currentTime).toBe(30);
    });

    it('laisse le retour en arrière libre', () => {
      const video = poserVideo(lecon({ video_url: 'https://cdn/x.mp4' }), 0);
      interne.tempsMax = 300;
      video.currentTime = 10;

      interne.surSeek();

      expect(video.currentTime).toBe(10);
    });

    it('n’entrave plus une leçon déjà validée', () => {
      const l = lecon({ video_url: 'https://cdn/x.mp4', terminee_le: '2026-01-01T00:00:00Z' });
      const video = poserVideo(l, 0);
      interne.tempsMax = 5;
      video.currentTime = 400;

      interne.surSeek();

      expect(video.currentTime).toBe(400);
    });

    it('n’entrave pas un compte de test', () => {
      estCompteTest.set(true);
      const video = poserVideo(lecon({ video_url: 'https://cdn/x.mp4' }), 0);
      interne.tempsMax = 5;
      video.currentTime = 400;

      interne.surSeek();

      expect(video.currentTime).toBe(400);
    });

    it('avance le point atteint au fil d’une lecture continue', () => {
      const video = poserVideo(lecon({ video_url: 'https://cdn/x.mp4' }), 0);
      interne.tempsMax = 10;
      video.currentTime = 10.5;

      interne.sauverPosition();

      // Progression naturelle (moins d'une seconde d'écart) : le repère suit.
      expect(interne.tempsMax).toBe(10.5);
      expect(positionsEnregistrees).toEqual([{ id: 'l-1', secondes: 10.5 }]);
    });

    it('ne déplace pas le point atteint sur un saut hors tolérance', () => {
      const video = poserVideo(lecon({ video_url: 'https://cdn/x.mp4' }), 0);
      interne.tempsMax = 10;
      video.currentTime = 300;

      interne.sauverPosition();

      expect(interne.tempsMax).toBe(10);
    });
  });

  describe('reprise de lecture', () => {
    it('replace la vidéo à la position enregistrée', () => {
      const l = lecon({ video_url: 'https://cdn/x.mp4', position_video_s: 120 });
      interne.lecon.set(l);
      fixture.detectChanges();
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 0, writable: true });

      interne.reprendre(l);

      expect(video.currentTime).toBe(120);
      // La position reprise vaut comme déjà visionnée : sans cela, l'anti-avance
      // ramènerait l'apprenant au début à chaque retour sur le chapitre.
      expect(interne.tempsMax).toBe(120);
    });

    it('ne touche à rien sans position enregistrée', () => {
      const l = lecon({ video_url: 'https://cdn/x.mp4' });
      interne.lecon.set(l);
      fixture.detectChanges();
      const video = fixture.nativeElement.querySelector('video') as HTMLVideoElement;
      Object.defineProperty(video, 'currentTime', { value: 45, writable: true });

      interne.reprendre(l);

      expect(video.currentTime).toBe(45);
    });
  });
});
