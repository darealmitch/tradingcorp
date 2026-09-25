import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { AccesDonnees } from '../supabase/acces-donnees';

/**
 * Cadence du signal, en secondes.
 *
 * L'écran des connectés en dépend directement : un élève présent laisse au
 * plus cet intervalle entre deux signaux. Le déclarer parti plus tôt le ferait
 * clignoter à chaque minute.
 */
export const SIGNAL_PRESENCE_S = 60;

/**
 * Signale à la base que l'élève connecté est sur la plateforme.
 *
 * Un signal (`signaler_presence`) dès qu'un élève se connecte, puis à chaque
 * minute — mais seulement quand son onglet est visible. Un onglet oublié
 * derrière dix autres n'est pas une présence : l'administration veut voir qui
 * suit la formation, pas quel navigateur est resté ouvert.
 *
 * Aucun signal de départ : se taire suffit, puisque l'écran des connectés lit
 * l'ancienneté du dernier signal. Un « au revoir » envoyé à la fermeture de
 * l'onglet se perdrait de toute façon dans les cas les plus courants —
 * fermeture brutale, réseau coupé, ordinateur mis en veille.
 *
 * Démarré par le composant racine et non par l'espace : le lecteur de leçons,
 * où l'élève passe l'essentiel de son temps, vit hors du gabarit de l'espace.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  private readonly acces = inject(AccesDonnees);
  private readonly auth = inject(AuthService);
  private readonly document = inject(DOCUMENT);
  private readonly injecteur = inject(Injector);
  private readonly destruction = inject(DestroyRef);

  private minuterie: ReturnType<typeof setInterval> | null = null;
  private dernierSignal = 0;

  /** À appeler une seule fois, depuis le composant racine. */
  demarrer(): void {
    // L'injecteur du service, et non celui de l'appelant : l'effet vit aussi
    // longtemps que l'application. `untracked` : seul le rôle doit relancer
    // l'effet, pas ce que l'envoi du signal pourrait lire en chemin.
    effect(
      () => {
        const eleve = this.auth.role() === 'apprenant';
        untracked(() => (eleve ? this.lancer() : this.arreter()));
      },
      { injector: this.injecteur },
    );

    // Au retour sur l'onglet, sans attendre la minute suivante : l'élève
    // revenu après une longue absence réapparaît aussitôt.
    const auRetour = (): void => this.signalerSiNecessaire();
    this.document.addEventListener('visibilitychange', auRetour);

    this.destruction.onDestroy(() => {
      this.arreter();
      this.document.removeEventListener('visibilitychange', auRetour);
    });
  }

  private lancer(): void {
    if (this.minuterie !== null) {
      return;
    }
    this.minuterie = setInterval(() => this.signalerSiNecessaire(), SIGNAL_PRESENCE_S * 1000);
    this.signalerSiNecessaire();
  }

  private arreter(): void {
    if (this.minuterie === null) {
      return;
    }
    clearInterval(this.minuterie);
    this.minuterie = null;
    this.dernierSignal = 0;
  }

  /**
   * Seuil d'une demi-période, et non d'une période entière : une minuterie
   * peut se déclencher quelques millisecondes « trop tôt » par rapport au
   * signal précédent, et sauter ce tour-là doublerait l'écart. Le seuil évite
   * en revanche de signaler à chaque aller-retour rapide entre deux onglets.
   */
  private signalerSiNecessaire(): void {
    const enRetard = Date.now() - this.dernierSignal >= (SIGNAL_PRESENCE_S * 1000) / 2;
    if (this.minuterie === null || this.document.visibilityState !== 'visible' || !enRetard) {
      return;
    }
    this.dernierSignal = Date.now();
    void this.acces.ecrire('signalement de présence', this.acces.appel('signaler_presence'));
  }
}
