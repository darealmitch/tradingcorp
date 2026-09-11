import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import type * as CookieConsent from 'vanilla-cookieconsent';
import { CATEGORIE_VIDEOS, CONFIG_CONSENTEMENT } from './consentement.config';

/**
 * Ce que le site sait du choix d'une personne pour une catégorie.
 *
 * `inconnu` n'est pas un demi-accord : c'est l'absence de réponse, et elle se
 * traite comme un refus. La seule valeur qui autorise un dépôt est `accepte`.
 */
export type EtatConsentement = 'accepte' | 'refuse' | 'inconnu';

/** La part de la bibliothèque que ce service emploie, et elle seule. */
export type ApiConsentement = Pick<
  typeof CookieConsent,
  'run' | 'validConsent' | 'acceptedCategory' | 'showPreferences' | 'show'
>;

/**
 * Chargeur de la bibliothèque, fourni par jeton d'injection comme le client
 * Supabase : les tests passent un double sans intercepter l'import d'un module.
 *
 * L'import est DYNAMIQUE : la bibliothèque part dans un fichier à part, chargé
 * après le démarrage. Importée d'emblée, elle faisait dépasser au chargement
 * initial son budget de 600 ko — pour un bandeau qui n'a aucune raison de
 * retarder le premier affichage de la page.
 */
export const CHARGER_COOKIE_CONSENT = new InjectionToken<() => Promise<ApiConsentement>>(
  'CHARGER_COOKIE_CONSENT',
  { providedIn: 'root', factory: () => () => import('vanilla-cookieconsent') },
);

/**
 * Recueil du consentement.
 *
 * UN SEUL gestionnaire existe sur le site, et c'est celui-ci. Aucune note
 * maison, aucune case parallèle, aucun accord mémorisé ailleurs : deux
 * mécanismes concurrents finissent toujours par se contredire, et c'est alors
 * la personne qui perd — elle refuse à un endroit, le dépôt a lieu à l'autre.
 *
 * `vanilla-cookieconsent` plutôt que Didomi, payant et sans formule gratuite :
 * la bibliothèque est libre (MIT) et SERVIE AVEC LE SITE. Elle n'appelle aucun
 * serveur tiers — un visiteur qui ne lance pas la vidéo ne contacte personne
 * d'autre que TradingCorp, bandeau compris.
 *
 * LE REPLI EST LE REFUS. Si la bibliothèque ne se charge pas ou ne démarre pas,
 * `disponible` reste faux et tout contenu tiers reste fermé : on ne présume
 * jamais d'un accord qu'on n'a pas pu lire (article 82 de la loi Informatique
 * et Libertés).
 */
@Injectable({ providedIn: 'root' })
export class ConsentementService {
  private readonly charger = inject(CHARGER_COOKIE_CONSENT);

  /** La bibliothèque, une fois chargée ET démarrée — jamais avant. */
  private bibliotheque: ApiConsentement | null = null;

  /** Le gestionnaire s'est prononcé : démarré, ou en échec. */
  readonly pret = signal(false);

  /** Le gestionnaire répond. Faux tant qu'il démarre, et s'il a échoué. */
  readonly disponible = signal(false);

  /**
   * Compteur de révisions. L'état du consentement vit dans la bibliothèque, pas
   * ici : ce signal est la dépendance que les `computed` déclarent pour se
   * recalculer chaque fois qu'elle annonce un choix.
   */
  private readonly revision = signal(0);

  /** Le lecteur vidéo tiers est-il autorisé ? */
  readonly lecteurVideo = computed<EtatConsentement>(() => {
    this.revision();
    const bibliotheque = this.disponible() ? this.bibliotheque : null;
    if (!bibliotheque?.validConsent()) {
      return 'inconnu';
    }
    return bibliotheque.acceptedCategory(CATEGORIE_VIDEOS) ? 'accepte' : 'refuse';
  });

  /** Raccourci : seul `accepte` ouvre la porte. */
  readonly lecteurVideoAutorise = computed(() => this.lecteurVideo() === 'accepte');

  constructor() {
    void this.demarrer();
  }

  /**
   * Ouvre les préférences — le « Gestion des cookies » du pied de page.
   *
   * Le retrait doit être aussi simple que l'accord (RGPD art. 7.3) : ce point
   * d'entrée reste joignable depuis toutes les pages.
   */
  ouvrirPreferences(): void {
    if (this.disponible()) {
      this.bibliotheque?.showPreferences();
    }
  }

  /** Réaffiche le bandeau, pour une personne qui n'a pas encore choisi. */
  ouvrirBanniere(): void {
    if (this.disponible()) {
      this.bibliotheque?.show(true);
    }
  }

  /**
   * Relit l'état sans attendre d'annonce.
   *
   * Les rappels de la bibliothèque sont le canal normal, mais une décision de
   * dépôt ne se fonde pas sur la certitude d'en avoir reçu un : là où la réponse
   * commande une action — ouvrir un lecteur tiers —, on va la chercher.
   */
  rafraichir(): void {
    this.revision.update((n) => n + 1);
  }

  private async demarrer(): Promise<void> {
    const annoncer = (): void => this.revision.update((n) => n + 1);
    try {
      const bibliotheque = await this.charger();
      await bibliotheque.run({ ...CONFIG_CONSENTEMENT, onConsent: annoncer, onChange: annoncer });
      this.bibliotheque = bibliotheque;
      this.disponible.set(true);
    } catch {
      // Chargement ou démarrage impossible : `disponible` reste faux, le refus
      // tient lieu de réponse, et l'écran concerné le dit.
    } finally {
      this.pret.set(true);
      this.revision.update((n) => n + 1);
    }
  }
}
