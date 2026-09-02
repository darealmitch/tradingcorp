import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { Profil, Role } from './profil.model';

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

/**
 * Page de définition du mot de passe. Elle sert DEUX parcours :
 *
 *   • le changement imposé à un compte créé par un administrateur, qui arrive
 *     avec un mot de passe temporaire (`doit_changer_mdp`) ;
 *   • la réinitialisation demandée par quelqu'un qui a oublié le sien : le lien
 *     reçu par e-mail ouvre une session, puis mène ici.
 *
 * Le garde ne peut donc plus exiger `doit_changer_mdp` — il refusait le second
 * cas, ce qui rendait la récupération impossible. Il n'exige plus qu'une
 * session : changer son propre mot de passe est toujours légitime, et le
 * serveur reste seul juge de ce qu'il accepte.
 *
 * Sans session, on renvoie vers la connexion. C'est le cas d'un lien expiré ou
 * déjà utilisé — Supabase les invalide après usage, et la redirection vaut
 * mieux qu'un formulaire qui échouerait à l'envoi.
 */
export const changementMdpRequisGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  return profil ? true : router.createUrlTree(['/connexion']);
};

/**
 * Vrai quand ce profil doit encore déclarer sa date de naissance.
 *
 * APPRENANTS SEULEMENT : la condition de majorité porte sur qui suit la
 * formation, pas sur qui l'administre. Interroger un formateur ou un admin sur
 * son âge n'apporte rien et bloquerait l'accès au back-office pour une règle
 * qui ne les concerne pas.
 *
 * Ne concerne en pratique que les comptes créés par connexion Google, que le
 * formulaire d'inscription n'a jamais traversés — Google ne fournit pas cette
 * information. Sans ce détour, la condition de majorité serait contournable en
 * choisissant simplement « Continuer avec Google ».
 */
function dateNaissanceAttendue(profil: Profil | null): boolean {
  return !!profil && profil.role === 'apprenant' && !profil.date_naissance;
}

/**
 * Date de naissance absente : l'espace et le parcours redirigent vers la page
 * qui la réclame.
 *
 * Le changement de mot de passe reste PRIORITAIRE : un compte créé par un admin
 * n'a ni mot de passe définitif ni date de naissance, et sans cette priorité les
 * deux redirections se renverraient l'une à l'autre.
 */
export const dateNaissanceGuard: CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  if (profil?.doit_changer_mdp) {
    return true;
  }
  return dateNaissanceAttendue(profil) ? router.createUrlTree(['/date-de-naissance']) : true;
};

/** Page de saisie : sans date attendue, elle n'a pas lieu d'être. */
export const dateNaissanceRequiseGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const profil = await auth.assurerProfil();
  if (!profil) {
    return router.createUrlTree(['/connexion']);
  }
  return dateNaissanceAttendue(profil) ? true : router.createUrlTree(['/espace']);
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
