import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Role } from './profil.model';

/** Routes réservées aux utilisateurs connectés (ex. /espace). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.attendreInitialisation();
  if (auth.estConnecte()) {
    return true;
  }
  return router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};

/** Routes réservées aux visiteurs (landing, facteurs, connexion, inscription) : déjà connecté → espace. */
export const inviteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.attendreInitialisation();
  return auth.estConnecte() ? router.createUrlTree(['/espace']) : true;
};

/**
 * Compte créé par un admin : tant que le mot de passe temporaire n'a pas été
 * remplacé, tout l'espace redirige vers la page de changement obligatoire.
 */
export const motDePasseGuard: CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  return profil?.doit_changer_mdp ? router.createUrlTree(['/nouveau-mot-de-passe']) : true;
};

/** Page de changement obligatoire : sans blocage actif, retour à l'espace. */
export const changementMdpRequisGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  if (!profil) {
    return router.createUrlTree(['/connexion']);
  }
  return profil.doit_changer_mdp ? true : router.createUrlTree(['/espace']);
};

/**
 * Date de naissance absente : tout l'espace et le parcours redirigent vers la
 * page qui la réclame.
 *
 * Ne concerne en pratique que les comptes créés par connexion Google, que le
 * formulaire d'inscription n'a jamais traversés — Google ne fournit pas cette
 * information. Sans ce détour, la condition de majorité serait contournable en
 * choisissant simplement « Continuer avec Google ».
 *
 * Placé APRÈS motDePasseGuard dans la liste des gardes : un compte créé par un
 * admin doit d'abord remplacer son mot de passe temporaire.
 */
export const dateNaissanceGuard: CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  if (profil && !profil.doit_changer_mdp && !profil.date_naissance) {
    return router.createUrlTree(['/date-de-naissance']);
  }
  return true;
};

/** Page de saisie : sans date manquante, elle n'a pas lieu d'être. */
export const dateNaissanceRequiseGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  if (!profil) {
    return router.createUrlTree(['/connexion']);
  }
  return profil.date_naissance ? router.createUrlTree(['/espace']) : true;
};

/**
 * Fabrique de guard par rôle — ex. roleGuard('formateur', 'admin') pour le
 * futur back-office. L'exigence MFA (aal2) pour les admins se branchera ici.
 */
export const roleGuard = (...roles: Role[]): CanActivateFn => {
  return async (_route, state) => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const profil = await auth.assurerProfil();
    if (!profil) {
      return router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
    }
    return roles.includes(profil.role) ? true : router.createUrlTree(['/espace']);
  };
};
