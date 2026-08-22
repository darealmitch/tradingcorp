import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Avis, LONGUEUR_MAX_CONTENU } from '../../../core/communaute/communaute.model';
import { CommunauteService } from '../../../core/communaute/communaute.service';
import { Icone } from '../../../shared/ui/icone';

/**
 * Avis d'un apprenant sur sa formation — un seul par formation, imposé par une
 * contrainte d'unicité en base.
 *
 * Trois états, dictés par la modération et non par l'écran :
 *   • aucun avis  → formulaire de dépôt ;
 *   • en attente  → formulaire encore modifiable, avec la mention du délai ;
 *   • traité      → lecture seule. Un avis approuvé ne se réécrit pas : il a
 *     été validé sur son contenu, le rouvrir permettrait de faire dire autre
 *     chose à une validation déjà donnée.
 */
@Component({
  selector: 'app-avis-formation',
  imports: [FormsModule, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './avis-formation.html',
  styleUrl: './avis-formation.css',
})
export class AvisFormation {
  private readonly communaute = inject(CommunauteService);

  readonly idFormation = input.required<string>();

  protected readonly avis = signal<Avis | null>(null);
  protected readonly chargement = signal(true);
  protected readonly envoi = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly succes = signal<string | null>(null);

  protected readonly note = signal(0);
  protected readonly texte = signal('');
  protected readonly maxLongueur = LONGUEUR_MAX_CONTENU;

  protected readonly etoiles = [1, 2, 3, 4, 5];

  constructor() {
    effect(() => {
      const id = this.idFormation();
      void this.charger(id);
    });
  }

  private async charger(idFormation: string): Promise<void> {
    this.chargement.set(true);
    const avis = await this.communaute.monAvis(idFormation);
    this.avis.set(avis);
    this.note.set(avis?.note ?? 0);
    this.texte.set(avis?.contenu ?? '');
    this.chargement.set(false);
  }

  /** Un avis traité par l'équipe est figé. */
  protected modifiable(): boolean {
    const avis = this.avis();
    return !avis || avis.statut === 'en_attente';
  }

  protected async soumettre(): Promise<void> {
    if (this.note() < 1 || this.envoi()) {
      return;
    }
    this.envoi.set(true);
    this.erreur.set(null);
    this.succes.set(null);

    const existant = this.avis();
    const echec = existant
      ? await this.communaute.modifierAvis(existant.id_avis, this.note(), this.texte())
      : await this.communaute.deposerAvis(this.idFormation(), this.note(), this.texte());

    this.envoi.set(false);
    if (echec) {
      this.erreur.set(echec);
      // L'avis a pu être approuvé entre l'affichage et l'envoi : on relit
      // plutôt que de laisser un formulaire qui ne peut plus rien enregistrer.
      await this.charger(this.idFormation());
      return;
    }
    this.succes.set('Merci — ton avis sera publié après relecture par l’équipe.');
    await this.charger(this.idFormation());
  }
}
