import { Injector, inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import type { Vitrine } from './vitrine.model';

/**
 * Au-delà, la page s'affiche sans attendre : ses chiffres arriveront après,
 * plutôt qu'un écran vide sur un réseau lent.
 */
const ATTENTE_MAX_MS = 1500;

/**
 * Attend la vitrine avant d'afficher une page de vente.
 *
 * Le bouton principal de l'accueil dépend d'elle — « Commencer gratuitement »
 * n'est vrai que s'il y a des leçons offertes —, comme les chiffres du premier
 * écran. Sans cette attente, le libellé changeait sous les yeux du visiteur et
 * les chiffres poussaient les boutons vers le bas en arrivant. La requête est
 * unique par visite : l'accueil, le programme et l'inscription partagent la
 * même promesse.
 *
 * Le service est importé à la demande : ce fichier vit dans le chargement
 * initial, avec la table des routes, et ce chargement a un budget.
 */
export const vitrineResolver: ResolveFn<Vitrine | null> = () => {
  const injecteur = inject(Injector);
  return Promise.race([
    import('./vitrine.service').then((m) => injecteur.get(m.VitrineService).charger()),
    new Promise<null>((resoudre) => setTimeout(() => resoudre(null), ATTENTE_MAX_MS)),
  ]);
};
