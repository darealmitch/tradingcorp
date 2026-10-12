import { Injectable, inject } from '@angular/core';
import { Role } from '../auth/profil.model';
import { AccesDonnees } from '../supabase/acces-donnees';
import { AccesFormation, CreationCompte, EssaiAccorde, ProfilAdmin } from './comptes.model';

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

  /** Les accès aux formations de tous les comptes (RLS : lisibles par l'équipe seule). */
  async listerAcces(): Promise<AccesFormation[]> {
    return this.acces.lire<AccesFormation[]>(
      'lecture des accès aux formations',
      this.acces.table('inscriptions').select('id_profil, id_formation, statut'),
      [],
    );
  }

  /**
   * Ouvre ou ferme l'accès d'un élève à une formation (RPC réservée aux
   * administrateurs, journalisée). Fermer n'efface rien : la progression reste,
   * et l'accès se rend tel qu'il était.
   */
  async definirAcces(
    idProfil: string,
    idFormation: string,
    actif: boolean,
  ): Promise<string | null> {
    return this.acces.ecrire(
      actif ? 'ouverture d’un accès' : 'retrait d’un accès',
      this.acces.appel('definir_acces_formation', {
        p_id_profil: idProfil,
        p_id_formation: idFormation,
        p_actif: actif,
      }),
      'La mise à jour de l’accès a échoué. Réessaie.',
    );
  }

  /** Les essais accordés (RLS : lisibles par les administrateurs seuls). */
  async listerEssais(): Promise<EssaiAccorde[]> {
    return this.acces.lire<EssaiAccorde[]>(
      'lecture des essais accordés',
      this.acces.table('essais').select('id_profil, accorde_le, annonce_le, retire_le'),
      [],
    );
  }

  /**
   * Accorde un essai à un élève (RPC réservée aux administrateurs,
   * journalisée). Aucune inscription n'est créée : l'élève garde les seules
   * leçons offertes, et reçoit l'e-mail qui lui explique son essai. La base
   * refuse l'élève qui a l'accès complet ou un compte de test, à qui
   * l'e-mail mentirait.
   */
  async accorderEssai(idProfil: string): Promise<string | null> {
    return this.acces.ecrire(
      'octroi d’un essai',
      this.acces.appel('accorder_essai', { p_id_profil: idProfil }),
      'L’essai n’a pas pu être accordé. Réessaie.',
    );
  }

  /**
   * Retire l'essai en cours d'un élève (RPC réservée aux administrateurs,
   * journalisée). Les leçons offertes lui sont fermées ; son accès complet
   * éventuel et sa progression restent. Aucun e-mail : la fin de l'essai
   * s'affiche dans son espace.
   */
  async retirerEssai(idProfil: string): Promise<string | null> {
    return this.acces.ecrire(
      'retrait d’un essai',
      this.acces.appel('retirer_essai', { p_id_profil: idProfil }),
      'L’essai n’a pas pu être retiré. Réessaie.',
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
