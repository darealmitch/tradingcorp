import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-espace',
  templateUrl: './espace.html',
  styleUrl: './espace.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Espace {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
