import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
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

/** Routes réservées aux visiteurs (connexion/inscription) : déjà connecté → espace. */
export const inviteGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.attendreInitialisation();
  return auth.estConnecte() ? router.createUrlTree(['/espace']) : true;
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
