import { ChangeDetectionStrategy, Component } from '@angular/core';

interface EntreeJournalDemo {
  date: string;
  admin: string;
  action: string;
  cible: string;
}

/* Données simulées en attendant le branchement sur journal_admin
   (les actions réelles — changement de rôle, modération… — y écriront). */
const JOURNAL_DEMO: EntreeJournalDemo[] = [
  {
    date: '10 juil. 2026, 11:42',
    admin: 'Toi',
    action: 'Changement de rôle',
    cible: 'sarah.b@exemple.com → formateur',
  },
  {
    date: '9 juil. 2026, 18:03',
    admin: 'Toi',
    action: 'Publication de leçon',
    cible: '« Liquidité et zones de déséquilibre »',
  },
  { date: '9 juil. 2026, 09:27', admin: 'Toi', action: 'Avis approuvé', cible: 'Julie R. — 5 ★' },
  {
    date: '8 juil. 2026, 15:11',
    admin: 'Toi',
    action: 'Remboursement approuvé',
    cible: 'paul.v@exemple.com — 997 €',
  },
];

@Component({
  selector: 'app-journal',
  templateUrl: './journal.html',
  styleUrl: '../espace-pages.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Journal {
  protected readonly entrees = JOURNAL_DEMO;
}
