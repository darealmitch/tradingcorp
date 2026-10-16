import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dureeAnnoncee } from '../../../../core/commerce/vitrine.textes';
import { VitrineService } from '../../../../core/commerce/vitrine.service';
import { FondCourbes } from '../../../../shared/fond-courbes';
import { MesureClic } from '../../../../shared/mesure-clic';

@Component({
  selector: 'app-hero',
  templateUrl: './hero.html',
  // Le premier écran est partagé avec la page Programme : même disposition,
  // mêmes animations, une seule feuille de style.
  styleUrl: '../../../../shared/premier-ecran.css',
  imports: [RouterLink, MesureClic, FondCourbes],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Hero {
  /**
   * Les chiffres du premier écran viennent de la base. La route attend la
   * vitrine avant d'afficher l'accueil (`vitrineResolver`) : ni le bouton ni
   * les chiffres ne changent sous les yeux du visiteur.
   */
  protected readonly vitrine = inject(VitrineService);
  protected readonly duree = dureeAnnoncee;
}
