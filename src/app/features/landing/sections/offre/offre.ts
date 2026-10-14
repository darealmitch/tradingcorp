import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dureeAnnoncee, lignesInclus, phraseEssai } from '../../../../core/commerce/vitrine.textes';
import { VitrineService } from '../../../../core/commerce/vitrine.service';
import { MesureClic } from '../../../../shared/mesure-clic';
import { Reveal } from '../../../../shared/reveal';

/**
 * L'offre, en un seul endroit : le prix, ce qu'il comprend, l'essai gratuit,
 * la rétractation et le risque.
 *
 * Avant elle, le prix n'apparaissait que dans la barre du bas, sans un mot de
 * ce qu'il couvre ; la rétractation de 14 jours, conservée même après avoir
 * commencé (CGV, article 8), n'était écrite que dans les CGV ;
 * et aucun avertissement sur le risque ne figurait près d'un bouton d'achat.
 *
 * Aucun avantage n'est annoncé ici qui ne soit vérifiable ailleurs sur le
 * site. Partagée par l'accueil et la page Programme.
 */
@Component({
  selector: 'app-offre',
  templateUrl: './offre.html',
  styleUrl: './offre.css',
  imports: [RouterLink, Reveal, MesureClic],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Offre {
  protected readonly vitrine = inject(VitrineService);
  protected readonly duree = dureeAnnoncee;

  /**
   * Après l'inscription, l'acheteur décidé arrive directement sur l'écran
   * d'achat au lieu du tableau de bord : deux étapes de moins.
   */
  protected readonly retourAchat = { retour: '/espace/formations' };

  protected readonly inclus = computed(() => {
    const v = this.vitrine.vitrine();
    return v ? lignesInclus(v) : [];
  });

  protected readonly essai = computed(() => {
    const v = this.vitrine.vitrine();
    return v && v.lecons_offertes.length > 0 ? phraseEssai(v) : null;
  });
}
