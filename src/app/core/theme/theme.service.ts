import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/** Thèmes disponibles — l'attribut `data-theme` de <html> porte cette valeur. */
export type Theme = 'dark' | 'light';

const CLE_STOCKAGE = 'tradingcorp-theme';

/**
 * Thème clair / sombre de l'application.
 *
 * Règle de résolution au démarrage :
 *   1. choix explicite déjà fait par l'utilisateur (localStorage) ;
 *   2. à défaut, préférence système (`prefers-color-scheme`) ;
 *   3. à défaut, sombre — l'identité de la marque est née sur fond noir.
 *
 * Le thème est appliqué sur `<html data-theme="…">` ; toute la déclinaison
 * visuelle vit dans les jetons CSS (styles.css), jamais ici. Les composants
 * qui peignent dans un canvas s'abonnent au signal `theme` pour se recolorer.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  private readonly themeSig = signal<Theme>('dark');

  /** Thème courant, en lecture seule. */
  readonly theme = this.themeSig.asReadonly();
  readonly estSombre = computed(() => this.themeSig() === 'dark');

  constructor() {
    this.appliquer(this.resoudreInitial());
  }

  /** Bascule sombre ↔ clair et mémorise le choix. */
  basculer(): void {
    this.definir(this.themeSig() === 'dark' ? 'light' : 'dark');
  }

  /** Force un thème et mémorise le choix de l'utilisateur. */
  definir(theme: Theme): void {
    this.appliquer(theme);
    try {
      localStorage.setItem(CLE_STOCKAGE, theme);
    } catch {
      // Navigation privée ou stockage refusé : le thème reste valable pour
      // la session, on ne casse rien pour autant.
    }
  }

  private appliquer(theme: Theme): void {
    this.themeSig.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
  }

  private resoudreInitial(): Theme {
    const memorise = this.lireChoixMemorise();
    if (memorise) {
      return memorise;
    }

    // `matchMedia` est absent des environnements de test (jsdom) et du rendu

    // serveur : on interroge la préférence système seulement si l'API existe,
    // et on retombe sinon sur le thème sombre, qui est celui de la marque.
    const vue = this.document.defaultView;
    return vue?.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }

  /** Choix explicite déjà mémorisé, ou null si absent / stockage indisponible. */
  private lireChoixMemorise(): Theme | null {
    try {
      const valeur = localStorage.getItem(CLE_STOCKAGE);
      return valeur === 'dark' || valeur === 'light' ? valeur : null;
    } catch {
      return null;
    }
  }
}
