import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Role } from '../auth/profil.model';
import { SUPABASE } from '../supabase/supabase.client';
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
 * ou `null` en cas de succès. Le service traduit ici les refus du serveur —
 * les composants n'ont pas à connaître le texte des exceptions SQL, ni à les
 * interpréter chacun à leur façon.
 */
@Injectable({ providedIn: 'root' })
export class ComptesService {
  private readonly supabase = inject(SUPABASE);

  /** Tous les profils avec e-mail (RPC réservée aux admins — vide sinon). */
  async lister(): Promise<ProfilAdmin[]> {
    const { data } = await this.supabase.rpc('lister_profils_admin');
    return (data as ProfilAdmin[] | null) ?? [];
  }

  /**
   * Change le rôle d'un profil via la fonction SQL `changer_role` — seule voie
   * possible, la colonne `role` n'étant plus modifiable directement.
   */
  async changerRole(idProfil: string, role: Role): Promise<string | null> {
    const { error } = await this.supabase.rpc('changer_role', {
      p_id_profil: idProfil,
      p_role: role,
    });
    if (!error) {
      return null;
    }
    if (error.message.includes('propre rôle')) {
      return 'Tu ne peux pas modifier ton propre rôle.';
    }
    if (error.message.includes('propriétaire')) {
      return 'Le compte propriétaire ne peut pas être modifié.';
    }
    return 'Le changement de rôle a échoué. Réessaie.';
  }

  /**
   * Corrige le nom/prénom officiels d'un profil (RPC admin, journalisée) —
   * l'utilisateur ne peut pas modifier ces champs lui-même.
   */
  async corrigerIdentite(idProfil: string, prenom: string, nom: string): Promise<string | null> {
    const { error } = await this.supabase.rpc('corriger_identite', {
      p_id_profil: idProfil,
      p_prenom: prenom,
      p_nom: nom,
    });
    return error ? 'La correction a échoué. Réessaie.' : null;
  }

  /** Marque ou démarque un compte de démonstration (exclu des statistiques). */
  async definirCompteTest(idProfil: string, estTest: boolean): Promise<string | null> {
    const { error } = await this.supabase.rpc('definir_compte_test', {
      p_id_profil: idProfil,
      p_est_test: estTest,
    });
    return error ? 'La mise à jour a échoué. Réessaie.' : null;
  }

  /**
   * Crée un compte (formateur ou apprenant) via l'Edge Function `creer-compte`
   * et renvoie le mot de passe temporaire à transmettre — affiché une seule
   * fois, l'utilisateur devra le remplacer à sa première connexion.
   */
  async creer(donnees: CreationCompte): Promise<{ motDePasse?: string; erreur?: string }> {
    const { data, error } = await this.supabase.functions.invoke<{ mot_de_passe?: string }>(
      'creer-compte',
      { body: donnees },
    );
    if (error instanceof FunctionsHttpError) {
      const corps = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      return { erreur: corps?.erreur ?? 'La création du compte a échoué.' };
    }
    if (error || !data?.mot_de_passe) {
      return { erreur: 'La création du compte a échoué.' };
    }
    return { motDePasse: data.mot_de_passe };
  }

  /**
   * Supprime définitivement un compte via l'Edge Function `supprimer-compte`
   * (auth.users n'est pas accessible au client). Les données liées suivent les
   * cascades du schéma ; les paiements sont conservés, détachés du profil.
   */
  async supprimer(idProfil: string): Promise<string | null> {
    const { error } = await this.supabase.functions.invoke('supprimer-compte', {
      body: { id_profil: idProfil },
    });
    if (!error) {
      return null;
    }
    if (error instanceof FunctionsHttpError) {
      const corps = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      return corps?.erreur ?? 'La suppression du compte a échoué.';
    }
    return 'La suppression du compte a échoué.';
  }
}
