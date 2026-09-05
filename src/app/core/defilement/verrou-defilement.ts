import { Injectable, signal } from '@angular/core';

/**
 * Fige la page derrière une surcouche plein écran, et la rend ensuite
 * exactement où elle était.
 *
 * `overflow: hidden` ne suffit pas : Safari mobile continue de faire défiler le
 * document sous un menu plein écran. On fige donc le corps de page en le
 * décalant vers le haut de sa position de défilement — l'œil ne voit aucun
 * mouvement, alors que le document ne mesure plus qu'un écran.
 *
 * Le prix de cette technique est que `window.scrollY` retombe à zéro et qu'un
 * événement de défilement est émis. Tout composant qui se montre ou se cache
 * selon le défilement — barre d'achat, retour en haut, fond du bandeau — se
 * rétracterait donc à l'ouverture pour reparaître à la fermeture, alors que
 * rien n'a bougé. D'où le signal `estVerrouille` : ces composants l'consultent
 * pour ignorer un défilement qui n'est qu'un artefact du verrou.
 */
@Injectable({ providedIn: 'root' })
export class VerrouDefilement {
  private readonly verrouille = signal(false);
  private positionRetenue = 0;

  /** Vrai tant que la page est figée : les écouteurs de défilement doivent se taire. */
  readonly estVerrouille = this.verrouille.asReadonly();

  verrouiller(): void {
    if (this.verrouille()) {
      return;
    }
    this.positionRetenue = window.scrollY;
    const style = document.body.style;
    style.position = 'fixed';
    style.top = `-${this.positionRetenue}px`;
    style.left = '0';
    style.right = '0';
    style.width = '100%';
    this.verrouille.set(true);
  }

  deverrouiller(): void {
    if (!this.verrouille()) {
      return;
    }
    const style = document.body.style;
    style.position = '';
    style.top = '';
    style.left = '';
    style.right = '';
    style.width = '';

    // `scroll-behavior: smooth` est posé sur la racine : sans neutralisation, la
    // restauration serait animée et la page remonterait sous les yeux au lieu de
    // réapparaître où elle était.
    const racine = document.documentElement;
    const comportement = racine.style.scrollBehavior;
    racine.style.scrollBehavior = 'auto';
    window.scrollTo(0, this.positionRetenue);
    racine.style.scrollBehavior = comportement;

    // Levé en dernier : les écouteurs réveillés par `scrollTo` doivent d'abord
    // voir la position réelle rétablie, sinon ils la liraient encore à zéro.
    this.verrouille.set(false);
  }
}
