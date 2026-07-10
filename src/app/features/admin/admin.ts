import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminService } from '../../core/admin/admin.service';
import { ProfilAdmin } from '../../core/admin/profil-admin.model';
import { AuthService } from '../../core/auth/auth.service';
import { Role } from '../../core/auth/profil.model';

const ROLES: Role[] = ['apprenant', 'formateur', 'admin'];

@Component({
  selector: 'app-admin',
  templateUrl: './admin.html',
  styleUrl: './admin.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Admin {
  private readonly admin = inject(AdminService);

  protected readonly auth = inject(AuthService);
  protected readonly roles = ROLES;

  protected readonly chargement = signal(true);
  protected readonly profils = signal<ProfilAdmin[]>([]);
  protected readonly enregistrement = signal(false);
  protected readonly erreur = signal<string | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.profils.set(await this.admin.listerProfils());
    this.chargement.set(false);
  }

  protected async changerRole(profil: ProfilAdmin, role: string): Promise<void> {
    this.erreur.set(null);
    this.enregistrement.set(true);
    const erreur = await this.admin.changerRole(profil.id_profil, role as Role);
    if (erreur) {
      this.erreur.set(erreur);
      // Recharge pour réaligner le sélecteur sur la valeur réelle en base.
      await this.charger();
    } else {
      this.profils.update((profils) =>
        profils.map((p) => (p.id_profil === profil.id_profil ? { ...p, role: role as Role } : p)),
      );
    }
    this.enregistrement.set(false);
  }

  protected inscritLe(profil: ProfilAdmin): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(
      new Date(profil.date_creation),
    );
  }
}
