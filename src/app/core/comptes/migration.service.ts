import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { EleveAMigrer, ResultatMigration } from './migration.model';

/**
 * Au-delà, l'Edge Function refuse. Le chiffre vient du débit d'envoi d'e-mails
 * de Supabase Auth — 30 par heure pour tout le projet — et non d'une limite de
 * traitement : voir le commentaire de `LOT_MAXIMUM` dans `migrer-eleves`, qui
 * porte la même valeur et doit changer en même temps.
 */
export const LOT_MAXIMUM = 30;

/**
 * Reprise des anciens élèves de la plateforme Wix.
 *
 * Tout passe par l'Edge Function `migrer-eleves`, seule à disposer des droits
 * nécessaires : créer un compte touche à `auth.users`, que le navigateur ne
 * voit pas. Elle est par ailleurs idempotente — un compte déjà présent est
 * rattaché, pas recréé —, ce qui permet de migrer par lots sans tenir de
 * comptabilité de ce qui a déjà été fait.
 */
@Injectable({ providedIn: 'root' })
export class MigrationService {
  private readonly acces = inject(AccesDonnees);

  async executer(
    eleves: EleveAMigrer[],
    options: { simulation: boolean; envoyerInvitation: boolean },
  ): Promise<{ resultat?: ResultatMigration; erreur?: string }> {
    const reponse = await this.acces.invoquer<ResultatMigration>(
      'migration des anciens élèves',
      'migrer-eleves',
      {
        eleves,
        simulation: options.simulation,
        envoyer_invitation: options.envoyerInvitation,
      },
      'La migration a échoué.',
    );
    if (reponse.erreur) {
      return { erreur: reponse.erreur };
    }
    return reponse.donnees
      ? { resultat: reponse.donnees }
      : { erreur: 'La migration n’a rien renvoyé.' };
  }
}
