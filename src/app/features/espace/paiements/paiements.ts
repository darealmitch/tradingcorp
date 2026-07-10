import { ChangeDetectionStrategy, Component } from '@angular/core';
import { StatCard } from '../../../shared/ui/stat-card';

interface PaiementDemo {
  date: string;
  client: string;
  montant: string;
  moyen: string;
  statut: 'reussi' | 'rembourse' | 'echoue';
  reference: string;
}

/* Données simulées en attendant le branchement sur la table paiements. */
const PAIEMENTS_DEMO: PaiementDemo[] = [
  {
    date: '10 juil. 2026',
    client: 'julie.r@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'reussi',
    reference: 'cs_…9f2a',
  },
  {
    date: '9 juil. 2026',
    client: 'karim.d@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'reussi',
    reference: 'cs_…b7e1',
  },
  {
    date: '8 juil. 2026',
    client: 'sarah.b@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'reussi',
    reference: 'cs_…44c8',
  },
  {
    date: '6 juil. 2026',
    client: 'paul.v@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'rembourse',
    reference: 'cs_…d012',
  },
  {
    date: '5 juil. 2026',
    client: 'lucas.m@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'reussi',
    reference: 'cs_…71aa',
  },
  {
    date: '4 juil. 2026',
    client: 'nora.k@exemple.com',
    montant: '997 €',
    moyen: 'card',
    statut: 'echoue',
    reference: 'cs_…e39b',
  },
];

@Component({
  selector: 'app-paiements',
  templateUrl: './paiements.html',
  styleUrl: '../espace-pages.css',
  imports: [StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Paiements {
  protected readonly paiements = PAIEMENTS_DEMO;
}
