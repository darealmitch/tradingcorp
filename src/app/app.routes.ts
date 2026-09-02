import { Routes } from '@angular/router';
import {
  authGuard,
  changementMdpRequisGuard,
  dateNaissanceGuard,
  dateNaissanceRequiseGuard,
  inviteGuard,
  motDePasseGuard,
  roleGuard,
} from './core/auth/auth.guards';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing').then((m) => m.Landing),
    canActivate: [inviteGuard],
    title: 'TradingCorp — La plateforme de trading nouvelle génération',
  },
  {
    path: 'facteurs',
    loadComponent: () => import('./features/factors/factors').then((m) => m.Factors),
    canActivate: [inviteGuard],
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
    path: 'mot-de-passe-oublie',
    loadComponent: () =>
      import('./features/auth/mot-de-passe-oublie/mot-de-passe-oublie').then(
        (m) => m.MotDePasseOublie,
      ),
    canActivate: [inviteGuard],
    title: 'TradingCorp — Mot de passe oublié',
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
  // Comptes issus de la connexion Google : Google ne transmet pas la date de
  // naissance, sans laquelle le contrôle de majorité ne s'applique pas.
  {
    path: 'date-de-naissance',
    loadComponent: () =>
      import('./features/auth/date-naissance/date-naissance').then((m) => m.DateNaissance),
    canActivate: [authGuard, dateNaissanceRequiseGuard],
    title: 'TradingCorp — Date de naissance',
  },
  // Vérification publique d'un certificat : AUCUNE garde, volontairement.
  // Ni authGuard (le vérificateur est un tiers sans compte), ni inviteGuard
  // (qui renverrait un utilisateur connecté vers son espace alors qu'il a le
  // droit de vérifier une attestation comme n'importe qui). La variante avec
  // numéro permet un lien direct, imprimable ou encodé en QR code.
  {
    path: 'verification',
    loadComponent: () => import('./features/verification/verification').then((m) => m.Verification),
    title: 'TradingCorp — Vérifier un certificat',
  },
  {
    path: 'verification/:numero',
    loadComponent: () => import('./features/verification/verification').then((m) => m.Verification),
    title: 'TradingCorp — Vérifier un certificat',
  },

  // Pages légales : publiques et SANS AUCUN GARDE, volontairement.
  //
  // Ni `authGuard` — une politique de confidentialité qu'il faut un compte pour
  // lire ne remplit pas son office : l'information doit être accessible AVANT
  // la collecte, donc avant l'inscription (RGPD art. 13). Ni `inviteGuard`, qui
  // renverrait un utilisateur connecté vers son espace alors qu'il a le droit de
  // relire ces pages à tout moment.
  {
    path: 'confidentialite',
    loadComponent: () =>
      import('./features/legal/confidentialite/confidentialite').then((m) => m.Confidentialite),
    title: 'TradingCorp — Politique de confidentialité',
  },
  {
    path: 'mentions-legales',
    loadComponent: () =>
      import('./features/legal/mentions-legales/mentions-legales').then((m) => m.MentionsLegales),
    title: 'TradingCorp — Mentions légales',
  },
  {
    path: 'cgv',
    loadComponent: () => import('./features/legal/cgv/cgv').then((m) => m.Cgv),
    title: 'TradingCorp — Conditions générales de vente',
  },

  // Parcours pédagogique : page ENTIÈRE, hors du gabarit espace (pas de
  // sidebar). Accessible depuis le header. Mêmes gardes que l'espace.
  {
    path: 'parcours',
    canActivate: [authGuard],
    canActivateChild: [motDePasseGuard, dateNaissanceGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/parcours/parcours').then((m) => m.Parcours),
        title: 'TradingCorp — Mon parcours',
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/parcours/module/module-intro').then((m) => m.ModuleIntro),
        title: 'TradingCorp — Module',
      },
      {
        path: ':id/lecon/:idLecon',
        loadComponent: () =>
          import('./features/parcours/lecon/lecon-player').then((m) => m.LeconPlayer),
        title: 'TradingCorp — Étape',
      },
    ],
  },
  {
    path: 'espace',
    loadComponent: () => import('./features/espace/espace-layout').then((m) => m.EspaceLayout),
    canActivate: [authGuard],
    canActivateChild: [motDePasseGuard, dateNaissanceGuard],
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
