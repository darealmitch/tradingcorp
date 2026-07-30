import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { EntreeJournal } from '../../../core/audit/audit.model';
import { AuditService } from '../../../core/audit/audit.service';

const LIBELLES_ACTIONS: Record<string, string> = {
  changement_role: 'Changement de rôle',
  creation_compte: 'Création de compte',
  correction_identite: 'Correction du nom',
  suppression_compte: 'Suppression de compte',
};

@Component({
  selector: 'app-journal',
  templateUrl: './journal.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Journal {
  private readonly audit = inject(AuditService);

  protected readonly chargement = signal(true);
  protected readonly entrees = signal<EntreeJournal[]>([]);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.entrees.set(await this.audit.listerJournal());
    this.chargement.set(false);
  }

  protected libelle(entree: EntreeJournal): string {
    return LIBELLES_ACTIONS[entree.action] ?? entree.action;
  }

  /**
   * Le profil disparaît avec le compte, pas l'entrée : on retombe alors sur
   * l'e-mail figé à l'écriture pour que la piste d'audit reste nominative.
   */
  protected auteur(entree: EntreeJournal): string {
    const nom = entree.profils ? `${entree.profils.prenom} ${entree.profils.nom}`.trim() : '';
    if (nom) {
      return nom;
    }
    return entree.auteur ? `${entree.auteur} (compte supprimé)` : 'Administrateur supprimé';
  }

  protected dateAction(entree: EntreeJournal): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(entree.date_action),
    );
  }
}
