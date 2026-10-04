import { LeconSuivie } from '../../../core/pilotage/pilotage.model';

/**
 * Lecture du parcours d'un élève, pour l'équipe.
 *
 * Rien n'est décidé ici sur ce qui « compte » : `parcours_apprenant` ne rend
 * que le programme publié, et une leçon y est terminée quand `terminee_le` est
 * posé — les définitions de l'élève lui-même. Cette fonction ne fait que
 * regrouper et nommer, pour qu'un administrateur lise en quelques secondes ce
 * que la liste résume en « 29 / 103 ».
 *
 * Les états d'un module suivent `etats_modules` : terminé quand toutes ses
 * leçons le sont, en cours dès la première leçon validée. Une vidéo vue sans
 * validation entame la LEÇON, pas le module — comme sur la page Parcours de
 * l'élève.
 */

export type EtatLecon = 'terminee' | 'entamee' | 'a_faire';
export type EtatModule = 'termine' | 'en_cours' | 'a_venir';

export interface LeconLue extends LeconSuivie {
  etat: EtatLecon;
}

export interface ModuleLu {
  id_section: string;
  titre: string;
  position: number;
  lecons: LeconLue[];
  terminees: number;
  total: number;
  etat: EtatModule;
}

export interface LectureParcours {
  modules: ModuleLu[];
  terminees: number;
  total: number;
  /** Même arrondi que la liste des apprenants : les deux écrans affichent le même chiffre. */
  pourcentage: number;
  modulesTermines: number;
  restantes: number;
  /** Première leçon non validée, dans l'ordre du programme ; null si tout est fait. */
  prochaine: { lecon: LeconLue; module: ModuleLu } | null;
  derniereValidation: LeconLue | null;
  /** La prochaine leçon, si c'est un quiz déjà tenté sans succès : l'élève y bloque. */
  quizBloquant: LeconLue | null;
}

function etatLecon(lecon: LeconSuivie): EtatLecon {
  if (lecon.terminee_le) {
    return 'terminee';
  }
  return lecon.video_terminee_le ? 'entamee' : 'a_faire';
}

function etatModule(terminees: number, total: number): EtatModule {
  if (total > 0 && terminees >= total) {
    return 'termine';
  }
  return terminees > 0 ? 'en_cours' : 'a_venir';
}

/** Les lignes arrivent déjà triées par module puis par leçon : l'ordre est conservé. */
export function lireParcours(lignes: LeconSuivie[]): LectureParcours {
  const parModule = new Map<string, ModuleLu>();
  for (const ligne of lignes) {
    let module = parModule.get(ligne.id_section);
    if (!module) {
      module = {
        id_section: ligne.id_section,
        titre: ligne.titre_module,
        position: ligne.position_module,
        lecons: [],
        terminees: 0,
        total: 0,
        etat: 'a_venir',
      };
      parModule.set(ligne.id_section, module);
    }
    const lecon: LeconLue = { ...ligne, etat: etatLecon(ligne) };
    module.lecons.push(lecon);
    module.total += 1;
    if (lecon.etat === 'terminee') {
      module.terminees += 1;
    }
  }

  const modules = [...parModule.values()];
  for (const module of modules) {
    module.etat = etatModule(module.terminees, module.total);
  }

  const terminees = modules.reduce((somme, m) => somme + m.terminees, 0);
  const total = modules.reduce((somme, m) => somme + m.total, 0);

  let prochaine: LectureParcours['prochaine'] = null;
  let derniereValidation: LeconLue | null = null;
  for (const module of modules) {
    for (const lecon of module.lecons) {
      if (!prochaine && lecon.etat !== 'terminee') {
        prochaine = { lecon, module };
      }
      if (
        lecon.terminee_le &&
        (!derniereValidation || lecon.terminee_le > (derniereValidation.terminee_le ?? ''))
      ) {
        derniereValidation = lecon;
      }
    }
  }

  const suivante = prochaine?.lecon;
  return {
    modules,
    terminees,
    total,
    pourcentage: total === 0 ? 0 : Math.round((terminees / total) * 100),
    modulesTermines: modules.filter((m) => m.etat === 'termine').length,
    restantes: total - terminees,
    prochaine,
    derniereValidation,
    quizBloquant:
      suivante && suivante.type_lecon === 'quiz' && suivante.nombre_tentatives > 0
        ? suivante
        : null,
  };
}
