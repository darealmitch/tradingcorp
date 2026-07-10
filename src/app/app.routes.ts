import { Routes } from '@angular/router';
import { authGuard, inviteGuard } from './core/auth/auth.guards';

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
  {
    path: 'connexion',
    loadComponent: () => import('./features/auth/connexion/connexion').then((m) => m.Connexion),
    canActivate: [inviteGuard],
    title: 'TradingCorp — Connexion',
  },
  {
    path: 'inscription',
    loadComponent: () =>
      import('./features/auth/inscription/inscription').then((m) => m.Inscription),
    canActivate: [inviteGuard],
    title: 'TradingCorp — Créer un compte',
  },
  {
    path: 'auth/callback',
    loadComponent: () => import('./features/auth/callback/callback').then((m) => m.Callback),
    title: 'TradingCorp — Connexion en cours',
  },
  {
    path: 'espace',
    loadComponent: () => import('./features/espace/espace').then((m) => m.Espace),
    canActivate: [authGuard],
    title: 'TradingCorp — Mon espace',
  },
  { path: '**', redirectTo: '' },
];
