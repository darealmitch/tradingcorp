import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme/theme.service';
import { Icone } from '../../shared/ui/icone';
import { VerrouDefilement } from '../../core/defilement/verrou-defilement';
import { Logo } from '../../shared/ui/logo';

/** Au-delà, le bouton burger disparaît : le menu en surcouche n'a plus lieu d'être. */
const LARGEUR_MENU_MOBILE = 860;

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
  imports: [RouterLink, RouterLinkActive, Logo, Icone, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onScroll()',
    '(window:resize)': 'onResize()',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class Header {
  private readonly router = inject(Router);

  private readonly verrou = inject(VerrouDefilement);

  protected readonly auth = inject(AuthService);
  protected readonly theme = inject(ThemeService);

  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);

  /** Sur les pages connectées (espace + parcours), le fond du header reste opaque. */
  protected readonly pageInterne = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => {
        const url = evenement.urlAfterRedirects;
        return url.startsWith('/espace') || url.startsWith('/parcours');
      }),
    ),
    { initialValue: false },
  );

  constructor() {
    // Un composant détruit menu ouvert — changement de mise en page, rechargement
    // à chaud — laisserait la page figée et inutilisable.
    inject(DestroyRef).onDestroy(() => this.verrou.deverrouiller());
  }

  protected onScroll(): void {
    // Page figée : `scrollY` retombe à zéro sans que rien n'ait bougé. Sans
    // cette garde, le bandeau perdrait son fond à l'ouverture du menu et le
    // retrouverait à la fermeture — un clignotement pour rien.
    if (this.verrou.estVerrouille()) {
      return;
    }
    this.scrolled.set(window.scrollY > 8);
  }

  /** Le burger disparaît au-delà du seuil : un menu resté ouvert serait orphelin. */
  protected onResize(): void {
    if (this.menuOpen() && window.innerWidth > LARGEUR_MENU_MOBILE) {
      this.closeMenu();
    }
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu();
      return;
    }
    this.menuOpen.set(true);
    this.verrou.verrouiller();
  }

  protected closeMenu(): void {
    if (!this.menuOpen()) {
      // Appelé au clic sur chaque lien, y compris menu déjà clos.
      return;
    }
    this.menuOpen.set(false);
    this.verrou.deverrouiller();
    // La garde de `onScroll` a ignoré tout ce qui s'est passé menu ouvert.
    this.scrolled.set(window.scrollY > 8);
  }

  protected async deconnecter(): Promise<void> {
    this.closeMenu();
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
