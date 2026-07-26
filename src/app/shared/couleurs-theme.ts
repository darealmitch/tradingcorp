/**
 * Lecture des couleurs du thème depuis les jetons CSS.
 *
 * Les composants qui peignent dans un `<canvas>` ne peuvent pas utiliser
 * `var(--x)` : ils manipulent des chaînes de couleur. Plutôt que de coder les
 * valeurs en dur (ce qui les fige sur un seul thème), ils lisent ici les jetons
 * réellement appliqués, et se repeignent quand `data-theme` change.
 */

/** Valeur brute d'un jeton CSS, résolue sur <html>. */
export function valeurJeton(nom: string): string {
  if (typeof getComputedStyle === 'undefined') {
    return '';
  }
  return getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
}

/** Jeton numérique (opacités de canvas), avec repli si absent ou illisible. */
export function nombreJeton(nom: string, defaut: number): number {
  const valeur = Number.parseFloat(valeurJeton(nom));
  return Number.isFinite(valeur) ? valeur : defaut;
}

/**
 * Jeton de couleur converti en triplet « r, g, b », directement interpolable
 * dans une chaîne `rgba(${triplet}, 0.5)`.
 *
 * Accepte les notations hexadécimales (#abc, #aabbcc) et `rgb()`/`rgba()`.
 * Retourne `defaut` si le jeton est absent ou dans un format non géré.
 */
export function rgbJeton(nom: string, defaut: string): string {
  const valeur = valeurJeton(nom);
  if (!valeur) {
    return defaut;
  }

  if (valeur.startsWith('#')) {
    let hex = valeur.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length < 6) {
      return defaut;
    }
    const entier = Number.parseInt(hex.slice(0, 6), 16);
    if (!Number.isFinite(entier)) {
      return defaut;
    }
    return `${(entier >> 16) & 255}, ${(entier >> 8) & 255}, ${entier & 255}`;
  }

  // rgb(a, b, c) / rgba(a, b, c, d) — on ne garde que les trois composantes.
  const composantes = valeur.match(/-?\d+(\.\d+)?/g);
  return composantes && composantes.length >= 3
    ? `${composantes[0]}, ${composantes[1]}, ${composantes[2]}`
    : defaut;
}
