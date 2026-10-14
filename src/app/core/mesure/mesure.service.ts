import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AccesDonnees } from '../supabase/acces-donnees';
import { BoutonMesure, CLE_OPPOSITION_MESURE, PAGES_MESUREES, SiteMesure } from './mesure.model';

/**
 * Nom d'hôte de la page, fourni par jeton : les tests se placent ainsi sur
 * l'adresse de production sans toucher à `location`, que jsdom ne laisse pas
 * modifier.
 */
export const HOTE_SITE = new InjectionToken<string>('HOTE_SITE', {
  providedIn: 'root',
  factory: () => globalThis.location?.hostname ?? '',
});

/** Délai sous lequel un second clic sur le même bouton n'est pas recompté. */
const ANTI_REBOND_MS = 1000;

/**
 * Le départ vers Stripe n'attend pas la mesure plus longtemps que cela : un
 * compteur ne doit jamais retarder un paiement de façon perceptible.
 */
const ATTENTE_MAX_PAIEMENT_MS = 600;

/**
 * Mesure d'audience du site, SANS COOKIE NI IDENTIFIANT.
 *
 * Elle compte trois choses, et les envoie une à une à `compter_evenement`,
 * qui n'en garde que des totaux par jour :
 *   • les vues des pages de vente (accueil, programme, inscription, achat) ;
 *   • les clics sur les boutons qui mènent à l'inscription ou à l'achat ;
 *   • les paiements commencés (départ vers Stripe).
 *
 * Rien n'est déposé sur le terminal, et rien ne relie deux événements entre
 * eux : ni compte, ni session, ni empreinte. Les comptes créés et les paiements
 * réussis ne sont PAS comptés ici — la base les connaît déjà, et l'entonnoir
 * les lit là-bas : les compter deux fois les ferait diverger.
 *
 * Elle se tait :
 *   • hors des deux adresses du site (localhost, préversions, démonstration) ;
 *   • pour un navigateur piloté par un robot ;
 *   • pour un visiteur qui s'y est opposé (politique de cookies), ou dont le
 *     navigateur l'exprime d'office (Do Not Track, Global Privacy Control).
 *
 * Un échec d'envoi ne se voit nulle part : c'est une statistique, pas un
 * service rendu à la personne, et un incident par visite noierait les vrais.
 */
@Injectable({ providedIn: 'root' })
export class MesureService {
  private readonly acces = inject(AccesDonnees);
  private readonly router = inject(Router);
  private readonly hote = inject(HOTE_SITE);

  private demarree = false;
  private dernierChemin: string | null = null;
  private readonly derniersClics = new Map<BoutonMesure, number>();

  private readonly oppositionSig = signal(this.lireOpposition());

  /** Le visiteur s'est opposé à la mesure depuis ce navigateur. */
  readonly opposition = this.oppositionSig.asReadonly();

  /**
   * À appeler une seule fois, depuis le composant racine. Le service étant
   * importé à la demande, la première navigation peut déjà être terminée :
   * la page affichée est alors comptée tout de suite.
   */
  demarrer(): void {
    if (this.demarree) {
      return;
    }
    this.demarree = true;
    this.router.events
      .pipe(filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd))
      .subscribe((evenement) => this.surNavigation(evenement.urlAfterRedirects));
    if (this.router.navigated) {
      this.surNavigation(this.router.url);
    }
  }

  /** Un clic sur un bouton d'appel à l'action. */
  clic(bouton: BoutonMesure): void {
    // Un clic qui ne sera pas compté ne doit pas non plus armer l'anti-rebond :
    // il masquerait le suivant, une fois l'opposition levée.
    if (!this.site() || !this.autorisee()) {
      return;
    }
    const maintenant = Date.now();
    const precedent = this.derniersClics.get(bouton);
    // Un double clic — ou un doigt qui rebondit — n'est qu'une intention.
    if (precedent !== undefined && maintenant - precedent < ANTI_REBOND_MS) {
      return;
    }
    this.derniersClics.set(bouton, maintenant);
    void this.envoyer('clic', bouton);
  }

  /**
   * Un paiement commence : la page part vers Stripe juste après. L'appelant
   * attend cette promesse avant de quitter la page, sans quoi la requête
   * serait coupée par la navigation ; elle se résout au plus tard après
   * {@link ATTENTE_MAX_PAIEMENT_MS}, que l'envoi ait abouti ou non.
   */
  debutPaiement(): Promise<void> {
    return Promise.race([
      this.envoyer('debut_paiement', 'ma-formation'),
      new Promise<void>((resoudre) => setTimeout(resoudre, ATTENTE_MAX_PAIEMENT_MS)),
    ]);
  }

  /** Opposition du visiteur, retenue dans ce navigateur (politique de cookies). */
  sOpposer(): void {
    this.ecrireOpposition(true);
  }

  /** Retrait de l'opposition. */
  accepter(): void {
    this.ecrireOpposition(false);
  }

  private surNavigation(url: string): void {
    const chemin = url.split('?')[0].split('#')[0] || '/';
    // Une ancre (« #programme ») ou un paramètre ne fait pas une nouvelle page :
    // sans cette garde, chaque lien interne de l'accueil y comptait une vue.
    if (chemin === this.dernierChemin) {
      return;
    }
    this.dernierChemin = chemin;
    if ((PAGES_MESUREES as readonly string[]).includes(chemin)) {
      void this.envoyer('vue', chemin);
    }
  }

  private async envoyer(evenement: string, cible: string): Promise<void> {
    const site = this.site();
    if (!site || !this.autorisee()) {
      return;
    }
    await this.acces.mesurer(
      this.acces.appel('compter_evenement', {
        p_site: site,
        p_evenement: evenement,
        p_cible: cible,
      }),
    );
  }

  /** Les deux adresses mesurées ; ailleurs, rien n'est compté. */
  private site(): SiteMesure | null {
    if (this.hote === 'tradingcorp.fr' || this.hote === 'www.tradingcorp.fr') {
      return 'prod';
    }
    return this.hote === 'dev.tradingcorp.fr' ? 'dev' : null;
  }

  private autorisee(): boolean {
    const nav = globalThis.navigator as
      (Navigator & { globalPrivacyControl?: boolean }) | undefined;
    if (!nav || nav.webdriver) {
      return false;
    }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl === true) {
      return false;
    }
    return !this.oppositionSig();
  }

  private lireOpposition(): boolean {
    try {
      return globalThis.localStorage?.getItem(CLE_OPPOSITION_MESURE) === 'refus';
    } catch {
      // Stockage inaccessible (navigation privée stricte) : rien n'a pu être
      // retenu, donc aucune opposition enregistrée.
      return false;
    }
  }

  private ecrireOpposition(refus: boolean): void {
    this.oppositionSig.set(refus);
    try {
      if (refus) {
        globalThis.localStorage?.setItem(CLE_OPPOSITION_MESURE, 'refus');
      } else {
        globalThis.localStorage?.removeItem(CLE_OPPOSITION_MESURE);
      }
    } catch {
      // Le choix vaut pour la visite en cours, faute de pouvoir être retenu.
    }
  }
}
