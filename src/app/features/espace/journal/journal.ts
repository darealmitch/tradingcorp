import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AdminService, EntreeJournal } from '../../../core/admin/admin.service';

const LIBELLES_ACTIONS: Record<string, string> = {
  changement_role: 'Changement de rôle',
};

@Component({
  selector: 'app-journal',
  templateUrl: './journal.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Journal {
  private readonly admin = inject(AdminService);

  protected readonly chargement = signal(true);
  protected readonly entrees = signal<EntreeJournal[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.entrees.set(await this.admin.listerJournal());
    this.chargement.set(false);
  }

  protected libelle(entree: EntreeJournal): string {
    return LIBELLES_ACTIONS[entree.action] ?? entree.action;
  }

  protected auteur(entree: EntreeJournal): string {
    return entree.profils
      ? `${entree.profils.prenom} ${entree.profils.nom}`.trim()
      : 'Administrateur supprimé';
  }

  protected dateAction(entree: EntreeJournal): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(entree.date_action),
    );
  }
}
