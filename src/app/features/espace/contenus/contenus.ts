import { ChangeDetectionStrategy, Component } from '@angular/core';

interface LeconDemo {
  titre: string;
  duree: string;
  statut: 'publiee' | 'brouillon';
  apercuGratuit: boolean;
}

interface SectionDemo {
  titre: string;
  lecons: LeconDemo[];
}

/* Données simulées en attendant le branchement sur sections/lecons/ressources. */
const SECTIONS_DEMO: SectionDemo[] = [
  {
    titre: 'Les fondations',
    lecons: [
      {
        titre: 'Bienvenue dans la formation',
        duree: '6 min',
        statut: 'publiee',
        apercuGratuit: true,
      },
      {
        titre: 'Comprendre les marchés financiers',
        duree: '22 min',
        statut: 'publiee',
        apercuGratuit: false,
      },
      {
        titre: 'Les acteurs institutionnels',
        duree: '18 min',
        statut: 'publiee',
        apercuGratuit: false,
      },
    ],
  },
  {
    titre: 'Structure de marché',
    lecons: [
      { titre: 'Lecture des ranges', duree: '25 min', statut: 'publiee', apercuGratuit: false },
      {
        titre: 'Liquidité et zones de déséquilibre',
        duree: '18 min',
        statut: 'publiee',
        apercuGratuit: false,
      },
      {
        titre: 'Cassures et faux départs',
        duree: '20 min',
        statut: 'brouillon',
        apercuGratuit: false,
      },
    ],
  },
  {
    titre: 'Gestion du risque',
    lecons: [
      { titre: 'Position sizing', duree: '24 min', statut: 'brouillon', apercuGratuit: false },
    ],
  },
];

@Component({
  selector: 'app-contenus',
  templateUrl: './contenus.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Contenus {
  protected readonly sections = SECTIONS_DEMO;
}
