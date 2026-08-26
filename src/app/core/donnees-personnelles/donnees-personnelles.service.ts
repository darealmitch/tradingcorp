import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';

/**
 * Exercice des droits RGPD par la personne elle-même.
 *
 * Ces trois opérations existaient déjà côté serveur — mais réservées aux
 * administrateurs. Un apprenant ne pouvait ni obtenir ses données, ni corriger
 * son nom, ni supprimer son compte : il fallait écrire à quelqu'un, et espérer
 * une réponse sous un mois (audit RGPD §3.3).
 *
 * Rien n'est décidé ici : le service ne fait qu'appeler des fonctions serveur
 * qui portent elles-mêmes leurs contrôles. `mes_donnees_personnelles()` et
 * `corriger_mon_identite()` sont bornées à `auth.uid()` et ne prennent aucun
 * identifiant de personne — il n'y a donc rien à falsifier depuis le
 * navigateur. La suppression passe par une Edge Function, seule à pouvoir
 * atteindre `auth.users`.
 */
@Injectable({ providedIn: 'root' })
export class DonneesPersonnellesService {
  private readonly acces = inject(AccesDonnees);

  /**
   * Export complet des données du compte (droits d'accès et de portabilité,
   * art. 15 et 20).
   *
   * Le JSON est produit par la base, pas recomposé ici : une agrégation côté
   * client oublierait la table ajoutée demain, et personne ne s'en rendrait
   * compte.
   */
  async mesDonnees(): Promise<Record<string, unknown> | null> {
    return this.acces.lire<Record<string, unknown> | null>(
      'export de mes données personnelles',
      this.acces.appel('mes_donnees_personnelles'),
      null,
    );
  }

  /**
   * Rectification du prénom et du nom (art. 16).
   *
   * Rend `null` en cas de succès, sinon un message affichable — la convention
   * de `AccesDonnees.ecrire`.
   */
  async corrigerMonIdentite(prenom: string, nom: string): Promise<string | null> {
    return this.acces.ecrire(
      'rectification de mon identité',
      this.acces.appel('corriger_mon_identite', { p_prenom: prenom, p_nom: nom }),
      'La modification n’a pas pu être enregistrée.',
    );
  }

  /**
   * Suppression définitive du compte (droit à l'effacement, art. 17).
   *
   * Aucun identifiant n'est transmis : l'Edge Function supprime le compte de
   * l'appelant, déduit de son jeton. Passer un identifiant depuis le navigateur
   * ouvrirait la porte à la suppression du compte d'autrui.
   */
  async supprimerMonCompte(): Promise<string | null> {
    const { erreur } = await this.acces.invoquer<{ supprime: boolean }>(
      'suppression de mon compte',
      'supprimer-compte',
      {},
      'La suppression du compte a échoué.',
    );
    return erreur ?? null;
  }

  /**
   * Déclenche le téléchargement de l'export au format JSON.
   *
   * L'objet URL est révoqué juste après : sans cela, la page garderait en
   * mémoire une copie de données personnelles jusqu'à sa fermeture.
   */
  telecharger(donnees: Record<string, unknown>): void {
    const contenu = JSON.stringify(donnees, null, 2);
    const blob = new Blob([contenu], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const lien = document.createElement('a');
    lien.href = url;
    lien.download = `tradingcorp-mes-donnees-${new Date().toISOString().slice(0, 10)}.json`;
    lien.click();
    URL.revokeObjectURL(url);
  }
}
