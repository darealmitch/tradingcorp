import { ComponentFixture, TestBed } from '@angular/core/testing';
import { QuestionQuiz, ResultatQuiz } from '../../../core/contenu/apprentissage.model';
import { QuizService } from '../../../core/contenu/quiz.service';
import { QuizLecon } from './quiz-lecon';

/** Même point de vue que le gabarit : les membres `protected` sont son API. */
interface Interne {
  questions: () => QuestionQuiz[];
  reponses: () => Record<string, string | string[]>;
  resultat: () => ResultatQuiz | null;
  estCochee(idQuestion: string, idReponse: string): boolean;
  repondreUnique(idQuestion: string, idReponse: string): void;
  basculerMultiple(idQuestion: string, idReponse: string): void;
  toutesRepondues(): boolean;
  soumettre(): Promise<void>;
  reessayer(): void;
  estBonneReponse(idQuestion: string, idReponse: string): boolean;
  aEteCochee(idQuestion: string, idReponse: string): boolean;
}

const QUESTIONS: QuestionQuiz[] = [
  {
    id_question: 'q1',
    libelle: 'Question à choix unique',
    position: 1,
    type: 'choix_unique',
    reponses: [
      { id_reponse: 'r1', contenu: 'A' },
      { id_reponse: 'r2', contenu: 'B' },
    ],
  },
  {
    id_question: 'q2',
    libelle: 'Question à choix multiple',
    position: 2,
    type: 'choix_multiple',
    reponses: [
      { id_reponse: 'r3', contenu: 'C' },
      { id_reponse: 'r4', contenu: 'D' },
    ],
  },
];

describe('QuizLecon', () => {
  let fixture: ComponentFixture<QuizLecon>;
  let interne: Interne;
  let soumissions: { idQuiz: string; reponses: unknown }[];
  let resultatServeur: ResultatQuiz | null;

  beforeEach(async () => {
    soumissions = [];
    resultatServeur = null;

    await TestBed.configureTestingModule({
      imports: [QuizLecon],
      providers: [
        {
          provide: QuizService,
          useValue: {
            chargerQuestions: () => Promise.resolve(QUESTIONS),
            soumettre: (idQuiz: string, reponses: unknown) => {
              soumissions.push({ idQuiz, reponses });
              return Promise.resolve(resultatServeur);
            },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(QuizLecon);
    fixture.componentRef.setInput('idQuiz', 'quiz-1');
    interne = fixture.componentInstance as unknown as Interne;
    await fixture.whenStable();
  });

  it('charge les questions du quiz reçu en entrée', () => {
    expect(interne.questions().length).toBe(2);
  });

  describe('saisie', () => {
    it('un choix unique remplace le précédent', () => {
      interne.repondreUnique('q1', 'r1');
      interne.repondreUnique('q1', 'r2');

      expect(interne.estCochee('q1', 'r1')).toBe(false);
      expect(interne.estCochee('q1', 'r2')).toBe(true);
    });

    it('un choix multiple cumule puis retire', () => {
      interne.basculerMultiple('q2', 'r3');
      interne.basculerMultiple('q2', 'r4');
      expect(interne.estCochee('q2', 'r3')).toBe(true);
      expect(interne.estCochee('q2', 'r4')).toBe(true);

      interne.basculerMultiple('q2', 'r3');
      expect(interne.estCochee('q2', 'r3')).toBe(false);
      expect(interne.estCochee('q2', 'r4')).toBe(true);
    });

    it('exige une réponse à chaque question avant de permettre l’envoi', () => {
      expect(interne.toutesRepondues()).toBe(false);

      interne.repondreUnique('q1', 'r1');
      expect(interne.toutesRepondues()).toBe(false);

      interne.basculerMultiple('q2', 'r3');
      expect(interne.toutesRepondues()).toBe(true);
    });

    it('ne tient pas un choix multiple vidé pour une réponse', () => {
      interne.repondreUnique('q1', 'r1');
      interne.basculerMultiple('q2', 'r3');
      interne.basculerMultiple('q2', 'r3');

      expect(interne.toutesRepondues()).toBe(false);
    });
  });

  describe('soumission', () => {
    function repondreATout(): void {
      interne.repondreUnique('q1', 'r1');
      interne.basculerMultiple('q2', 'r3');
    }

    it('n’envoie rien tant que le questionnaire est incomplet', async () => {
      interne.repondreUnique('q1', 'r1');
      await interne.soumettre();

      expect(soumissions.length).toBe(0);
    });

    it('transmet l’identifiant du quiz et les réponses saisies', async () => {
      repondreATout();
      resultatServeur = { reussi: true, score: 100, score_requis: 80, detail: [] };

      await interne.soumettre();

      expect(soumissions.length).toBe(1);
      expect(soumissions[0].idQuiz).toBe('quiz-1');
      expect(soumissions[0].reponses).toEqual({ q1: 'r1', q2: ['r3'] });
    });

    it('signale la réussite au parent — c’est lui qui débloque la suite', async () => {
      let emissions = 0;
      fixture.componentInstance.reussi.subscribe(() => emissions++);
      repondreATout();
      resultatServeur = { reussi: true, score: 90, score_requis: 80, detail: [] };

      await interne.soumettre();

      expect(emissions).toBe(1);
    });

    it('ne signale rien au parent en cas d’échec', async () => {
      let emissions = 0;
      fixture.componentInstance.reussi.subscribe(() => emissions++);
      repondreATout();
      resultatServeur = { reussi: false, score: 40, score_requis: 80, detail: [] };

      await interne.soumettre();

      expect(emissions).toBe(0);
      expect(interne.resultat()?.reussi).toBe(false);
    });

    it('remet le questionnaire à zéro lors d’un réessai', async () => {
      repondreATout();
      resultatServeur = { reussi: false, score: 40, score_requis: 80, detail: [] };
      await interne.soumettre();

      interne.reessayer();

      expect(interne.resultat()).toBeNull();
      expect(interne.reponses()).toEqual({});
    });
  });

  describe('correction affichée', () => {
    beforeEach(async () => {
      interne.repondreUnique('q1', 'r2');
      interne.basculerMultiple('q2', 'r3');
      resultatServeur = {
        reussi: false,
        score: 50,
        score_requis: 80,
        detail: [
          {
            id_question: 'q1',
            correcte: false,
            bonnes_reponses: ['r1'],
            reponses_donnees: ['r2'],
            explication: 'La bonne réponse était A.',
          },
        ],
      };
      await interne.soumettre();
    });

    it('révèle la bonne réponse renvoyée par le serveur', () => {
      expect(interne.estBonneReponse('q1', 'r1')).toBe(true);
      expect(interne.estBonneReponse('q1', 'r2')).toBe(false);
    });

    it('distingue ce que l’apprenant avait coché', () => {
      expect(interne.aEteCochee('q1', 'r2')).toBe(true);
      expect(interne.aEteCochee('q1', 'r1')).toBe(false);
    });

    it('ne révèle rien pour une question absente de la correction', () => {
      expect(interne.estBonneReponse('q2', 'r3')).toBe(false);
      expect(interne.aEteCochee('q2', 'r3')).toBe(false);
    });
  });

  it('repart d’un état vierge quand le chapitre change', async () => {
    interne.repondreUnique('q1', 'r1');
    resultatServeur = { reussi: false, score: 0, score_requis: 80, detail: [] };

    // Le composant est réutilisé d'un chapitre à l'autre : sans réinitialisation,
    // les réponses du quiz précédent seraient pré-cochées dans le suivant.
    fixture.componentRef.setInput('idQuiz', 'quiz-2');
    await fixture.whenStable();

    expect(interne.reponses()).toEqual({});
    expect(interne.resultat()).toBeNull();
  });
});
