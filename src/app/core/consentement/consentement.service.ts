import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Ce que le site sait du choix d'une personne pour un fournisseur donné.
 *
 * `inconnu` n'est pas un demi-accord : c'est l'absence de réponse, et elle se
 * traite comme un refus. La seule valeur qui autorise un dépôt est `accepte`.
 */
export type EtatConsentement = 'accepte' | 'refuse' | 'inconnu';

/** La part de l'API Didomi que ce service utilise, et elle seule. */
interface ApiDidomi {
  getUserConsentStatusForVendor(id: string): boolean | undefined;
  preferences: { show(vue?: string): void };
  notice: { show(): void };
  on(evenement: string, rappel: () => void): void;
}

declare global {
  interface Window {
    Didomi?: ApiDidomi;
    didomiOnReady?: ((didomi: ApiDidomi) => void)[];
  }
}

/**
 * Recueil du consentement, confié à Didomi.
 *
 * UN SEUL gestionnaire de consentement existe sur le site, et c'est celui-ci.
 * Aucune bannière maison, aucune case à cocher parallèle, aucun accord mémorisé
 * dans un coin : deux mécanismes concurrents finissent toujours par se
 * contredire, et c'est alors la personne qui perd — elle refuse quelque part et
 * le dépôt a lieu quand même.
 *
 * LE REPLI EST LE REFUS. Si le SDK n'est pas configuré, s'il est bloqué par une
 * extension, si le réseau le refuse : `disponible` reste faux et tout contenu
 * tiers reste fermé. On ne présume jamais d'un accord qu'on n'a pas pu lire —
 * c'est ce que veut l'article 82 de la loi Informatique et Libertés, qui exige
 * un consentement préalable et non une absence d'opposition.
 */
@Injectable({ providedIn: 'root' })
export class ConsentementService {
  /**
   * Le gestionnaire a fini de se prononcer : soit il a chargé, soit on sait
   * qu'il ne chargera pas. Sert à ne pas afficher un message d'erreur pendant
   * la seconde où le SDK arrive encore.
   */
  readonly pret = signal(false);

  /** Le gestionnaire répond. Faux s'il n'est pas configuré ou s'il est bloqué. */
  readonly disponible = signal(false);

  /**
   * Compteur de révisions. Les états de consentement vivent dans le SDK, pas
   * ici : on ne peut pas les « observer » directement. Ce signal est la
   * dépendance que les `computed` déclarent pour se recalculer à chaque
   * changement annoncé par Didomi.
   */
  private readonly revision = signal(0);

  /** Le lecteur vidéo tiers est-il autorisé ? */
  readonly lecteurVideo = computed<EtatConsentement>(() => {
    this.revision();
    return this.etatFournisseur(environment.didomi.vendeurLecteurVideo);
  });

  /** Raccourci de lecture : seul `accepte` ouvre la porte. */
  readonly lecteurVideoAutorise = computed(() => this.lecteurVideo() === 'accepte');

  constructor() {
    this.charger();
  }

  /**
   * Ouvre la fenêtre de préférences — le « Gérer mes cookies » du pied de page.
   *
   * Le retrait doit être aussi simple que l'accord (RGPD art. 7.3) : ce point
   * d'entrée doit rester joignable depuis toutes les pages, à tout moment.
   */
  ouvrirPreferences(): void {
    window.Didomi?.preferences.show();
  }

  /** Réaffiche la bannière elle-même, pour une personne qui n'a pas encore choisi. */
  ouvrirBanniere(): void {
    window.Didomi?.notice.show();
  }

  /**
   * Relit l'état auprès du SDK, sans attendre qu'il signale un changement.
   *
   * Les événements sont le canal normal, mais on ne bâtit pas une décision de
   * dépôt sur la certitude d'en recevoir un : observé en essai, un SDK peut
   * n'émettre aucun `consent.changed`. À l'instant où la réponse commande une
   * action — ouvrir un lecteur tiers, par exemple — on va donc la chercher.
   */
  rafraichir(): void {
    this.revision.update((n) => n + 1);
  }

  private etatFournisseur(id: string): EtatConsentement {
    if (!this.disponible() || !id) {
      return 'inconnu';
    }
    const etat = window.Didomi?.getUserConsentStatusForVendor(id);
    if (etat === true) {
      return 'accepte';
    }
    return etat === false ? 'refuse' : 'inconnu';
  }

  /**
   * Charge le SDK depuis la configuration.
   *
   * Le script est injecté par l'application plutôt qu'écrit en dur dans
   * `index.html` : la clé n'existe alors qu'à un seul endroit, et le site
   * démarre normalement quand elle n'est pas renseignée. Le retard ainsi pris
   * — quelques centaines de millisecondes — est sans conséquence, car rien ne
   * se dépose au chargement : le seul contenu tiers du site attend un clic.
   */
  private charger(): void {
    const { cleApi, idNotice } = environment.didomi;
    if (!cleApi || !idNotice) {
      this.pret.set(true);
      return;
    }

    window.didomiOnReady = window.didomiOnReady ?? [];
    window.didomiOnReady.push((didomi) => {
      this.disponible.set(true);
      this.pret.set(true);
      this.revision.update((n) => n + 1);
      // Chaque changement d'avis rouvre ou referme les contenus concernés sans
      // rechargement. On s'abonne à TROIS événements et non au seul
      // `consent.changed` : la fermeture des fenêtres est le moment où un choix
      // vient forcément d'être posé, et elle sert de filet si le signal de
      // changement manque à l'appel.
      for (const evenement of ['consent.changed', 'preferences.hidden', 'notice.hidden']) {
        didomi.on(evenement, () => this.revision.update((n) => n + 1));
      }
    });

    const script = document.createElement('script');
    script.src = `https://sdk.privacy-center.org/${encodeURIComponent(cleApi)}/loader.js?target_type=notice&target=${encodeURIComponent(idNotice)}`;
    script.async = true;
    // Bloqué ou injoignable : on l'acte, et le refus reste le repli.
    script.onerror = () => this.pret.set(true);
    document.head.appendChild(script);
  }
}
