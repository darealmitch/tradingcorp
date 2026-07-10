import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-header',
  templateUrl: './header.html',
  styleUrl: './header.css',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(window:scroll)': 'onScroll()',
    '(document:keydown.escape)': 'closeMenu()',
  },
})
export class Header {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);

  protected readonly scrolled = signal(false);
  protected readonly menuOpen = signal(false);

  /** Dans l'espace, le fond du header reste opaque (la sidebar passe dessous). */
  protected readonly surEspace = toSignal(
    this.router.events.pipe(
      filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd),
      map((evenement) => evenement.urlAfterRedirects.startsWith('/espace')),
    ),
    { initialValue: false },
  );

  protected onScroll(): void {
    this.scrolled.set(window.scrollY > 8);
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }

  protected async deconnecter(): Promise<void> {
    this.closeMenu();
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
