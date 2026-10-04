import { LeconSuivie } from '../../../core/pilotage/pilotage.model';
import { lireParcours } from './lecture-parcours';

/**
 * La lecture ne fait que regrouper et nommer : ces tests vérifient qu'elle
 * suit les définitions de l'élève (module terminé quand toutes ses leçons le
 * sont, entamé dès la première validée) et qu'elle désigne la bonne prochaine
 * étape — c'est la première chose qu'un administrateur cherche.
 */

function lecon(champs: Partial<LeconSuivie>): LeconSuivie {
  return {
    id_section: 'm-1',
    titre_module: 'Les bases',
    position_module: 1,
    id_lecon: 'l-1',
    titre_lecon: '1.1 Introduction',
    position_lecon: 1,
    type_lecon: 'video',
    video_terminee_le: null,
    terminee_le: null,
    nombre_tentatives: 0,
    meilleur_score: null,
    score_requis: null,
    ...champs,
  };
}

const PROGRAMME: LeconSuivie[] = [
  lecon({ id_lecon: 'l-1', titre_lecon: '1.1', terminee_le: '2026-09-20T10:00:00+00:00' }),
  lecon({ id_lecon: 'l-2', titre_lecon: '1.2', terminee_le: '2026-09-22T10:00:00+00:00' }),
  lecon({
    id_section: 'm-2',
    titre_module: 'Analyse',
    position_module: 2,
    id_lecon: 'l-3',
    titre_lecon: '2.1',
    terminee_le: '2026-09-21T10:00:00+00:00',
  }),
  lecon({
    id_section: 'm-2',
    titre_module: 'Analyse',
    position_module: 2,
    id_lecon: 'l-4',
    titre_lecon: '2.2',
    position_lecon: 2,
    video_terminee_le: '2026-09-23T10:00:00+00:00',
  }),
  lecon({
    id_section: 'm-3',
    titre_module: 'Pratique',
    position_module: 3,
    id_lecon: 'l-5',
    titre_lecon: '3.1',
  }),
];

describe('lireParcours', () => {
  it('compte comme la liste des apprenants : leçons validées sur le programme', () => {
    const lecture = lireParcours(PROGRAMME);

    expect(lecture.terminees).toBe(3);
    expect(lecture.total).toBe(5);
    expect(lecture.pourcentage).toBe(60);
    expect(lecture.restantes).toBe(2);
  });

  it('nomme l’état de chaque module comme la page Parcours de l’élève', () => {
    const etats = lireParcours(PROGRAMME).modules.map((m) => m.etat);

    expect(etats).toEqual(['termine', 'en_cours', 'a_venir']);
    expect(lireParcours(PROGRAMME).modulesTermines).toBe(1);
  });

  it('distingue une vidéo vue d’une leçon validée', () => {
    const module2 = lireParcours(PROGRAMME).modules[1];

    expect(module2.lecons.map((l) => l.etat)).toEqual(['terminee', 'entamee']);
    // La vidéo vue n'entame que la leçon : le module compte ce qui est validé.
    expect(module2.terminees).toBe(1);
  });

  it('désigne comme prochaine étape la première leçon non validée, dans l’ordre', () => {
    const { prochaine } = lireParcours(PROGRAMME);

    expect(prochaine?.lecon.id_lecon).toBe('l-4');
    expect(prochaine?.module.titre).toBe('Analyse');
  });

  it('retient la validation la plus récente, pas la dernière dans l’ordre', () => {
    expect(lireParcours(PROGRAMME).derniereValidation?.id_lecon).toBe('l-2');
  });

  it('signale un quiz qui bloque, et seulement s’il a déjà été tenté', () => {
    const quiz = lecon({ id_lecon: 'q-1', type_lecon: 'quiz', score_requis: 70 });

    expect(lireParcours([quiz]).quizBloquant).toBeNull();
    expect(
      lireParcours([{ ...quiz, nombre_tentatives: 2, meilleur_score: 60 }]).quizBloquant?.id_lecon,
    ).toBe('q-1');
  });

  it('n’a plus de prochaine étape quand tout est validé', () => {
    const fini = PROGRAMME.map((l) => ({ ...l, terminee_le: '2026-09-30T10:00:00+00:00' }));
    const lecture = lireParcours(fini);

    expect(lecture.prochaine).toBeNull();
    expect(lecture.pourcentage).toBe(100);
    expect(lecture.modulesTermines).toBe(3);
  });

  it('reste à zéro sans parcours, sans diviser par zéro', () => {
    const lecture = lireParcours([]);

    expect(lecture.pourcentage).toBe(0);
    expect(lecture.modules).toEqual([]);
    expect(lecture.prochaine).toBeNull();
  });
});
