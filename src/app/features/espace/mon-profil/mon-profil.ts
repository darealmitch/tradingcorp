import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-mon-profil',
  templateUrl: './mon-profil.html',
  styleUrls: ['../espace-pages.css', './mon-profil.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonProfil {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);

  protected initiales(): string {
    const profil = this.auth.profil();
    if (!profil) {
      return '?';
    }
    return ((profil.prenom[0] ?? '') + (profil.nom[0] ?? '')).toUpperCase() || '?';
  }

  protected membreDepuis(): string {
    const date = this.auth.profil()?.date_creation;
    if (!date) {
      return '—';
    }
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(date));
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
