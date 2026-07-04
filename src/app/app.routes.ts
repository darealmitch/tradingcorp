import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
    title: 'TradingCorp — La plateforme de trading nouvelle génération',
  },
  {
    path: 'facteurs',
    loadComponent: () => import('./features/factors/factors').then((m) => m.Factors),
    title: 'TradingCorp — Les 5 facteurs qui changeront votre vie',
  },
  { path: '**', redirectTo: '' },
];
