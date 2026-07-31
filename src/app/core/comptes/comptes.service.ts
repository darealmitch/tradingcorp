import { Injectable, inject } from '@angular/core';
import { Role } from '../auth/profil.model';
import { AccesDonnees } from '../supabase/acces-donnees';
import { CreationCompte, ProfilAdmin } from './comptes.model';

/**
 * Cycle de vie des comptes utilisateurs : lister, créer, corriger, promouvoir,
 * supprimer.
 *
 * Extrait d'`AdminService`, qui réunissait comptes, paiements, audit et
 * certificats derrière une seule façade. La page Paiements y héritait des
 * méthodes de suppression de compte, la page Journal de celles de création :
 * autant de pouvoir offert à des écrans qui n'en font rien.
 *
 * Chaque méthode de mutation renvoie un message d'erreur **prêt à afficher**,
 * ou `null` en cas de succès. Les refus métier viennent du serveur, qui les
 * rédige déjà en français ; ce service ne recopie plus ces textes.
 */
@Injectable({ providedIn: 'root' })
export class ComptesService {
  private readonly acces = inject(AccesDonnees);

  /** Tous les profils avec e-mail (RPC réservée aux admins — vide sinon). */
  async lister(): Promise<ProfilAdmin[]> {
    return this.acces.lire<ProfilAdmin[]>(
      'lecture des comptes',
      this.acces.appel('lister_profils_admin'),
      [],
    );
  }

  /**
   * Change le rôle d'un profil via la fonction SQL `changer_role` — seule voie
   * possible, la colonne `role` n'étant plus modifiable directement.
   *
   * Les refus de cette RPC (« Impossible de modifier son propre rôle », « Le
   * compte propriétaire ne peut pas être modifié ») remontent désormais tels
   * quels : ils sont rédigés en français côté base, et les recopier ici les
   * condamnait à diverger le jour où la règle changerait.
   */
  async changerRole(idProfil: string, role: Role): Promise<string | null> {
    return this.acces.ecrire(
      'changement de rôle',
      this.acces.appel('changer_role', { p_id_profil: idProfil, p_role: role }),
      'Le changement de rôle a échoué. Réessaie.',
    );
  }

  /**
   * Corrige le nom/prénom officiels d'un profil (RPC admin, journalisée) —
   * l'utilisateur ne peut pas modifier ces champs lui-même.
   */
  async corrigerIdentite(idProfil: string, prenom: string, nom: string): Promise<string | null> {
    return this.acces.ecrire(
      'correction d’identité',
      this.acces.appel('corriger_identite', {
        p_id_profil: idProfil,
        p_prenom: prenom,
        p_nom: nom,
      }),
      'La correction a échoué. Réessaie.',
    );
  }

  /** Marque ou démarque un compte de démonstration (exclu des statistiques). */
  async definirCompteTest(idProfil: string, estTest: boolean): Promise<string | null> {
    return this.acces.ecrire(
      'marquage d’un compte de test',
      this.acces.appel('definir_compte_test', { p_id_profil: idProfil, p_est_test: estTest }),
      'La mise à jour a échoué. Réessaie.',
    );
  }

  /**
   * Crée un compte (formateur ou apprenant) via l'Edge Function `creer-compte`
   * et renvoie le mot de passe temporaire à transmettre — affiché une seule
   * fois, l'utilisateur devra le remplacer à sa première connexion.
   */
  async creer(donnees: CreationCompte): Promise<{ motDePasse?: string; erreur?: string }> {
    const reponse = await this.acces.invoquer<{ mot_de_passe?: string }>(
      'création d’un compte',
      'creer-compte',
      donnees,
      'La création du compte a échoué.',
    );
    if (reponse.erreur) {
      return { erreur: reponse.erreur };
    }
    return reponse.donnees?.mot_de_passe
      ? { motDePasse: reponse.donnees.mot_de_passe }
      : { erreur: 'La création du compte a échoué.' };
  }

  /**
   * Supprime définitivement un compte via l'Edge Function `supprimer-compte`
   * (auth.users n'est pas accessible au client). Les données liées suivent les
   * cascades du schéma ; les paiements sont conservés, détachés du profil.
   */
  async supprimer(idProfil: string): Promise<string | null> {
    const { erreur } = await this.acces.invoquer(
      'suppression d’un compte',
      'supprimer-compte',
      { id_profil: idProfil },
      'La suppression du compte a échoué.',
    );
    return erreur ?? null;
  }
}
