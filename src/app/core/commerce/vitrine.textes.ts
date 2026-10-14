import { Vitrine } from './vitrine.model';

/**
 * Les phrases que les pages de vente composent à partir de la vitrine.
 *
 * Séparées du modèle, que le chargement initial embarque (le service de
 * vitrine et la barre d'achat en dépendent) : ces phrases ne servent qu'aux
 * pages qui les affichent, et partent avec elles dans leurs fichiers différés.
 */

/**
 * Durée de vidéo annoncée, toujours arrondie vers le BAS : « plus de 40
 * heures » pour 40 h 17 min, jamais « 41 heures ». Un chiffre de vitrine ne
 * doit pas pouvoir être pris en défaut par un élève qui ferait le compte.
 */
export function dureeAnnoncee(secondes: number): string {
  if (secondes < 3600) {
    const minutes = Math.max(1, Math.floor(secondes / 60));
    return `${minutes}\u00a0min`;
  }
  const heures = Math.floor(secondes / 3600);
  const pluriel = heures > 1 ? 'heures' : 'heure';
  return secondes > heures * 3600 ? `plus de ${heures} ${pluriel}` : `${heures} ${pluriel}`;
}

/**
 * Durée d'un module, au plus près : « 1 h 24 », « 45 min ». Arrondie vers le
 * bas, comme {@link dureeAnnoncee}.
 */
export function dureeCourte(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  if (minutes < 60) {
    return `${Math.max(1, minutes)}\u00a0min`;
  }
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0
    ? `${heures}\u00a0h`
    : `${heures}\u00a0h\u00a0${String(reste).padStart(2, '0')}`;
}

/** « 1 leçon », « 3 leçons » : l'accord suit le nombre. */
export function compte(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre}\u00a0${nombre > 1 ? pluriel : singulier}`;
}

/**
 * Ce que le prix comprend, ligne à ligne. Chaque ligne vient de la base
 * (`vitrine_formation`) ou des conditions générales de vente : l'accès sans
 * limite de durée est l'article 7, le certificat l'article 12.
 */
export function lignesInclus(v: Vitrine): string[] {
  const modules = v.programme;
  const etendue =
    modules.length > 1
      ? `, de «\u00a0${modules[0].titre}\u00a0» à «\u00a0${modules[modules.length - 1].titre}\u00a0»`
      : '';
  const lignes = [
    `${compte(v.modules, 'module', 'modules')}${etendue}`,
    `${compte(v.lecons_video, 'leçon vidéo', 'leçons vidéo')}, soit ${dureeAnnoncee(v.secondes_video)} de vidéo`,
    `${compte(v.quiz, 'quiz', 'quiz')} pour vérifier tes acquis`,
  ];
  if (v.ressources > 0) {
    lignes.push(
      `${compte(v.ressources, 'ressource complémentaire', 'ressources complémentaires')} à consulter ou télécharger`,
    );
  }
  if (v.delivre_certificat) {
    lignes.push('Un certificat d’achèvement, vérifiable en ligne grâce à son numéro');
  }
  lignes.push('Un accès sans limite de durée, sur ordinateur, tablette et téléphone');
  return lignes;
}

/**
 * « 3 leçons du module « Développement personnel » sont offertes. » — ou, si
 * elles viennent de plusieurs modules, « 3 leçons sont offertes. »
 */
export function phraseEssai(v: Vitrine): string {
  const offertes = v.lecons_offertes;
  const n = offertes.length;
  const modules = new Set(offertes.map((l) => l.module));
  const verbe = n > 1 ? 'sont offertes' : 'est offerte';
  const lecons = compte(n, 'leçon', 'leçons');
  return modules.size === 1
    ? `${lecons} du module «\u00a0${offertes[0].module}\u00a0» ${verbe}.`
    : `${lecons} ${verbe}.`;
}
