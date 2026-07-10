import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase.client';
import { Role } from '../auth/profil.model';
import { ProfilAdmin } from './profil-admin.model';

export interface PaiementLigne {
  id_paiement: string;
  montant_centimes: number;
  devise: string;
  statut: 'en_attente' | 'reussi' | 'rembourse' | 'echoue';
  moyen_paiement: string | null;
  reference_transaction: string;
  email: string | null;
  date_paiement: string;
  /** Paiement réalisé avec les clés de test Stripe (livemode false). */
  mode_test: boolean;
  profils: { role: Role; est_test: boolean } | null;
}

export interface EntreeJournal {
  id_journal: string;
  action: string;
  cible: string | null;
  date_action: string;
  profils: { prenom: string; nom: string } | null;
}

export interface CreationCompte {
  email: string;
  prenom: string;
  nom: string;
  role: 'apprenant' | 'formateur';
  id_formation: string | null;
}

/**
 * Un paiement compte dans le chiffre d'affaires s'il est réussi, hors mode
 * test Stripe, et payé par un apprenant non marqué test. Un payeur au profil
 * supprimé reste compté : c'était un client réel.
 */
export function compteDansCa(paiement: PaiementLigne): boolean {
  if (paiement.statut !== 'reussi' || paiement.mode_test) {
    return false;
  }
  const profil = paiement.profils;
  return !profil || (profil.role === 'apprenant' && !profil.est_test);
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly supabase = inject(SUPABASE);

  /** Tous les profils avec e-mail (RPC réservée aux admins — vide sinon). */
  async listerProfils(): Promise<ProfilAdmin[]> {
    const { data } = await this.supabase.rpc('lister_profils_admin');
    return (data as ProfilAdmin[] | null) ?? [];
  }

  /**
   * Change le rôle d'un profil via la fonction SQL changer_role — seule voie
   * possible, la colonne `role` n'étant plus modifiable directement.
   * Retourne un message d'erreur prêt à afficher, ou null en cas de succès.
   */
  async changerRole(idProfil: string, role: Role): Promise<string | null> {
    const { error } = await this.supabase.rpc('changer_role', {
      p_id_profil: idProfil,
      p_role: role,
    });
    if (!error) {
      return null;
    }
    return error.message.includes('propre rôle')
      ? 'Tu ne peux pas modifier ton propre rôle.'
      : 'Le changement de rôle a échoué. Réessaie.';
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
  async creerCompte(donnees: CreationCompte): Promise<{ motDePasse?: string; erreur?: string }> {
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

  /** Historique complet des paiements avec le profil payeur (RLS : admin). */
  async listerPaiements(): Promise<PaiementLigne[]> {
    const { data } = await this.supabase
      .from('paiements')
      .select(
        'id_paiement, montant_centimes, devise, statut, moyen_paiement, reference_transaction, email, date_paiement, mode_test, profils(role, est_test)',
      )
      .order('date_paiement', { ascending: false });
    return (data as unknown as PaiementLigne[] | null) ?? [];
  }

  /** Piste d'audit (RLS : admin uniquement). */
  async listerJournal(): Promise<EntreeJournal[]> {
    const { data } = await this.supabase
      .from('journal_admin')
      .select('id_journal, action, cible, date_action, profils(prenom, nom)')
      .order('date_action', { ascending: false })
      .limit(100);
    return (data as unknown as EntreeJournal[] | null) ?? [];
  }

  /** Nombre de certificats émis (lecture staff via RLS). */
  async compterCertificats(): Promise<number> {
    const { count } = await this.supabase
      .from('certificats')
      .select('id_certificat', { count: 'exact', head: true });
    return count ?? 0;
  }
}
