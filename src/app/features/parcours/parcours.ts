import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ModuleParcours, Parcours as ParcoursData } from '../../core/contenu/apprentissage.model';
import { ContenuService } from '../../core/contenu/contenu.service';
import { ParcoursCta } from './scenes/cta';
import { ParcoursHero } from './scenes/hero';
import { ParcoursProgression } from './scenes/progression';
import { ParcoursRoadmap } from './scenes/roadmap/roadmap';

@Component({
  selector: 'app-parcours',
  templateUrl: './parcours.html',
  styleUrl: './parcours.css',
  imports: [ParcoursHero, ParcoursRoadmap, ParcoursProgression, ParcoursCta],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Parcours {
  private readonly contenu = inject(ContenuService);

  protected readonly chargement = signal(true);
  protected readonly parcours = signal<ParcoursData | null>(null);
  protected readonly annonce = signal<string | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.parcours.set(await this.contenu.chargerParcours());
    this.chargement.set(false);
  }

  /**
   * Le lecteur de leçons arrivera avec les vrais contenus. Tant qu'un module
   * n'a pas d'étape, on l'annonce sans rien inventer. L'accès reste gouverné
   * par le serveur (états RPC + RLS) : ce clic n'ouvre jamais un verrouillé.
   */
  protected ouvrir(module: ModuleParcours): void {
    this.annonce.set(
      module.total_lecons > 0
        ? `« ${module.titre} » — le lecteur de leçons arrive bientôt.`
        : `« ${module.titre} » — le contenu de ce module est en préparation.`,
    );
  }
}
