import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DonneesPersonnellesService } from '../../core/donnees-personnelles/donnees-personnelles.service';
import { Logo } from '../../shared/ui/logo';

/** Forme d'un jeton : l'identifiant aléatoire que la base glisse dans le lien. */
const FORME_JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Etat = 'attente' | 'en_cours' | 'fait' | 'inconnu' | 'echec';

/**
 * Désinscription des nouveautés, depuis le lien d'un e-mail d'annonce.
 *
 * Sans connexion : la loi veut un moyen simple de s'opposer à la prospection,
 * et exiger un mot de passe n'en est pas un. Le jeton du lien désigne le
 * compte, sans rien en révéler.
 *
 * Un clic sur un bouton, et non l'ouverture de la page : certaines messageries
 * visitent les liens d'un e-mail pour les analyser. Désinscrire à l'ouverture
 * désinscrirait des personnes qui n'ont rien demandé.
 */
@Component({
  selector: 'app-desinscription',
  imports: [Logo, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './desinscription.html',
  styleUrl: '../verification/verification.css',
})
export class Desinscription {
  private readonly donnees = inject(DonneesPersonnellesService);

  /** Le jeton du lien, s'il a la bonne forme ; null sinon. */
  protected readonly jeton: string | null;
  protected readonly etat = signal<Etat>('attente');

  constructor() {
    const brut = inject(ActivatedRoute).snapshot.queryParamMap.get('jeton') ?? '';
    this.jeton = FORME_JETON.test(brut) ? brut : null;
  }

  protected async desinscrire(): Promise<void> {
    if (!this.jeton || this.etat() === 'en_cours') {
      return;
    }
    this.etat.set('en_cours');
    const reconnu = await this.donnees.desinscrireNouveautes(this.jeton);
    this.etat.set(reconnu === null ? 'echec' : reconnu ? 'fait' : 'inconnu');
  }
}
