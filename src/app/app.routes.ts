import { Routes } from '@angular/router';
import {
  authGuard,
  changementMdpRequisGuard,
  inviteGuard,
  motDePasseGuard,
  roleGuard,
} from './core/auth/auth.guards';

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
    path: 'nouveau-mot-de-passe',
    loadComponent: () =>
      import('./features/auth/nouveau-mdp/nouveau-mdp').then((m) => m.NouveauMdp),
    canActivate: [changementMdpRequisGuard],
    title: 'TradingCorp — Nouveau mot de passe',
  },
  {
    path: 'espace',
    loadComponent: () => import('./features/espace/espace-layout').then((m) => m.EspaceLayout),
    canActivate: [authGuard],
    canActivateChild: [motDePasseGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/espace/accueil/accueil').then((m) => m.Accueil),
        title: 'TradingCorp — Tableau de bord',
      },
      {
        path: 'formations',
        loadComponent: () =>
          import('./features/espace/mes-formations/mes-formations').then((m) => m.MesFormations),
        title: 'TradingCorp — Ma formation',
      },
      {
        path: 'parcours',
        loadComponent: () => import('./features/parcours/parcours').then((m) => m.Parcours),
        title: 'TradingCorp — Mon parcours',
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/espace/notifications/notifications').then((m) => m.Notifications),
        title: 'TradingCorp — Notifications',
      },
      {
        path: 'profil',
        loadComponent: () =>
          import('./features/espace/mon-profil/mon-profil').then((m) => m.MonProfil),
        title: 'TradingCorp — Profil',
      },
      {
        path: 'contenus',
        loadComponent: () => import('./features/espace/contenus/contenus').then((m) => m.Contenus),
        canActivate: [roleGuard('formateur', 'admin')],
        title: 'TradingCorp — Contenus',
      },
      {
        path: 'apprenants',
        loadComponent: () =>
          import('./features/espace/apprenants/apprenants').then((m) => m.Apprenants),
        canActivate: [roleGuard('formateur', 'admin')],
        title: 'TradingCorp — Apprenants',
      },
      {
        path: 'moderation',
        loadComponent: () =>
          import('./features/espace/moderation/moderation').then((m) => m.Moderation),
        canActivate: [roleGuard('formateur', 'admin')],
        title: 'TradingCorp — Modération',
      },
      {
        path: 'utilisateurs',
        loadComponent: () =>
          import('./features/espace/utilisateurs/utilisateurs').then((m) => m.Utilisateurs),
        canActivate: [roleGuard('admin')],
        title: 'TradingCorp — Utilisateurs',
      },
      {
        path: 'paiements',
        loadComponent: () =>
          import('./features/espace/paiements/paiements').then((m) => m.Paiements),
        canActivate: [roleGuard('admin')],
        title: 'TradingCorp — Paiements',
      },
      {
        path: 'journal',
        loadComponent: () => import('./features/espace/journal/journal').then((m) => m.Journal),
        canActivate: [roleGuard('admin')],
        title: 'TradingCorp — Journal',
      },
      {
        path: 'parametres',
        loadComponent: () =>
          import('./features/espace/parametres/parametres').then((m) => m.Parametres),
        canActivate: [roleGuard('admin')],
        title: 'TradingCorp — Paramètres',
      },
    ],
  },
  // Ancienne URL du back-office, désormais dans l'espace.
  { path: 'admin', redirectTo: '/espace/utilisateurs' },
  { path: '**', redirectTo: '' },
];
