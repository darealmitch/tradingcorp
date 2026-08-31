import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Adresse canonique du site.
 *
 * Constante à dessein, et non tirée de `environment` : son rôle est
 * précisément de NE PAS varier. La même application est publiée à trois
 * adresses — `tradingcorp.fr`, `tradingcorp.pages.dev` (l'adresse technique de
 * l'hébergeur, servie en parallèle) et la démonstration sur GitHub Pages. Sans
 * cette déclaration, les moteurs de recherche y voient trois sites au contenu
 * identique et répartissent entre eux la valeur qui devrait revenir à un seul.
 */
const SITE_CANONIQUE = 'https://tradingcorp.fr';

/**
 * Tient à jour `<link rel="canonical">` au fil des navigations.
 *
 * `index.html` en porte déjà une, figée sur l'accueil : elle sert aux robots
 * qui n'exécutent pas le JavaScript et ne verront jamais que ce fichier. Ce
 * service prend le relais pour les autres, à qui il faut annoncer l'adresse
 * canonique de la page réellement consultée — sinon `/cgv` se déclarerait
 * lui-même comme un doublon de l'accueil, ce qui est pire que de ne rien dire.
 */
@Injectable({ providedIn: 'root' })
export class UrlCanoniqueService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  /** À appeler une seule fois, depuis le composant racine. */
  demarrer(): void {
    this.router.events
      .pipe(filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd))
      .subscribe((evenement) => this.poser(evenement.urlAfterRedirects));
  }

  private poser(url: string): void {
    // Ni paramètres ni ancre : `?achat=succes` et `#formations` désignent la
    // même page que l'adresse nue. Les déclarer canoniques multiplierait les
    // doublons au lieu de les réduire.
    const chemin = url.split('?')[0].split('#')[0] || '/';

    // La balise est réutilisée si elle existe — celle d'index.html en
    // l'occurrence. En créer une seconde en laisserait deux dans le document,
    // et deux canoniques contradictoires équivalent à aucune.
    let lien = this.document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!lien) {
      lien = this.document.createElement('link');
      lien.setAttribute('rel', 'canonical');
      this.document.head.appendChild(lien);
    }
    lien.setAttribute('href', `${SITE_CANONIQUE}${chemin}`);
  }
}
