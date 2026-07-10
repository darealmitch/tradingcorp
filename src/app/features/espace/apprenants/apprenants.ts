import { ChangeDetectionStrategy, Component } from '@angular/core';
import { BarreProgression } from '../../../shared/ui/barre-progression';

interface ApprenantDemo {
  nom: string;
  email: string;
  progression: number;
  quiz: string;
  activite: string;
}

/* Données simulées en attendant le branchement sur progression_lecons. */
const APPRENANTS_DEMO: ApprenantDemo[] = [
  {
    nom: 'Lucas Martin',
    email: 'lucas.m@exemple.com',
    progression: 72,
    quiz: '3 / 4',
    activite: 'il y a 2 h',
  },
  {
    nom: 'Sarah Benali',
    email: 'sarah.b@exemple.com',
    progression: 45,
    quiz: '2 / 4',
    activite: 'il y a 5 h',
  },
  {
    nom: 'Karim Diallo',
    email: 'karim.d@exemple.com',
    progression: 88,
    quiz: '4 / 4',
    activite: 'hier',
  },
  {
    nom: 'Julie Roux',
    email: 'julie.r@exemple.com',
    progression: 100,
    quiz: '4 / 4',
    activite: 'il y a 3 jours',
  },
  {
    nom: 'Mehdi Laurent',
    email: 'm.laurent@exemple.com',
    progression: 12,
    quiz: '0 / 4',
    activite: 'il y a 1 semaine',
  },
];

@Component({
  selector: 'app-apprenants',
  templateUrl: './apprenants.html',
  styleUrl: '../espace-pages.css',
  imports: [BarreProgression],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Apprenants {
  protected readonly apprenants = APPRENANTS_DEMO;
}
