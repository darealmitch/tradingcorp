import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { MiseAJourConditions, ModeAnnonce, ResultatAnnonce } from './conditions.model';

/**
 * Annonce d'une mise à jour des conditions (article 14 des CGU).
 *
 * Tout se passe dans la fonction Edge `informer-conditions` : elle vérifie que
 * l'appelant est administrateur, pose la notification de chaque compte et lui
 * envoie l'e-mail — une seule fois par personne et par version, même si
 * l'envoi est relancé.
 */
@Injectable({ providedIn: 'root' })
export class ConditionsService {
  private readonly acces = inject(AccesDonnees);

  async annoncer(
    mode: ModeAnnonce,
    miseAJour: MiseAJourConditions,
  ): Promise<{ resultat?: ResultatAnnonce; erreur?: string }> {
    const { donnees, erreur } = await this.acces.invoquer<ResultatAnnonce>(
      'annonce d’une mise à jour des conditions',
      'informer-conditions',
      { mode, ...miseAJour },
      'L’annonce n’a pas pu partir. Réessaie.',
    );
    return { resultat: donnees, erreur };
  }
}
