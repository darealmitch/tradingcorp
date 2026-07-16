import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
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
  private readonly router = inject(Router);

  protected readonly chargement = signal(true);
  protected readonly parcours = signal<ParcoursData | null>(null);

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    this.parcours.set(await this.contenu.chargerParcours());
    this.chargement.set(false);
  }

  /**
   * Ouvre l'introduction du module. La roadmap n'émet que pour un module
   * ouvrable : l'accès reste gouverné par le serveur (états RPC + RLS).
   */
  protected ouvrir(module: ModuleParcours): void {
    void this.router.navigate(['/espace/parcours', module.id_section]);
  }
}
