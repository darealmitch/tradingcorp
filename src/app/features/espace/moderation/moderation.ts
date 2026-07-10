import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { Icone } from '../../../shared/ui/icone';

interface CommentaireDemo {
  id: number;
  auteur: string;
  lecon: string;
  contenu: string;
  date: string;
}

interface AvisDemo {
  id: number;
  auteur: string;
  note: number;
  contenu: string;
  date: string;
}

/* Données simulées en attendant le branchement sur commentaires/avis
   (l'approbation ne modifie ici que la liste locale). */
const COMMENTAIRES_DEMO: CommentaireDemo[] = [
  {
    id: 1,
    auteur: 'Lucas M.',
    lecon: 'Gestion du risque : position sizing',
    contenu: 'Super clair ! Est-ce que tu peux partager la feuille de calcul du ratio ?',
    date: 'il y a 1 h',
  },
  {
    id: 2,
    auteur: 'Sarah B.',
    lecon: 'Analyse fondamentale',
    contenu:
      'Une question sur le calcul du ratio de Sharpe à 12:40, je ne retrouve pas le même résultat.',
    date: 'il y a 3 h',
  },
  {
    id: 3,
    auteur: 'Karim D.',
    lecon: 'Psychologie du trading',
    contenu: 'Exactement ce qui me manquait, merci pour cette leçon.',
    date: 'hier',
  },
];

const AVIS_DEMO: AvisDemo[] = [
  {
    id: 1,
    auteur: 'Julie R.',
    note: 5,
    contenu: 'Formation exceptionnelle, très loin de ce qu’on trouve sur YouTube.',
    date: 'il y a 4 h',
  },
  {
    id: 2,
    auteur: 'Mehdi L.',
    note: 4,
    contenu: 'Très bon contenu, j’aurais aimé plus d’exemples en conditions réelles.',
    date: 'il y a 2 jours',
  },
];

@Component({
  selector: 'app-moderation',
  templateUrl: './moderation.html',
  styleUrls: ['../espace-pages.css', './moderation.css'],
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Moderation {
  protected readonly commentaires = signal(COMMENTAIRES_DEMO);
  protected readonly avis = signal(AVIS_DEMO);

  protected traiterCommentaire(id: number): void {
    this.commentaires.update((liste) => liste.filter((c) => c.id !== id));
  }

  protected traiterAvis(id: number): void {
    this.avis.update((liste) => liste.filter((a) => a.id !== id));
  }

  protected etoiles(note: number): string {
    return '★'.repeat(note) + '☆'.repeat(5 - note);
  }
}
