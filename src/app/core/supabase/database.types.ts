// =============================================================================
// FICHIER GÉNÉRÉ — NE PAS MODIFIER À LA MAIN
//
// Types du schéma PostgreSQL, produits depuis la base réelle (audit P-11).
// Le client Supabase était utilisé sans types : les résultats étaient convertis
// par 27 assertions `as X[] | null`. Une assertion n'est pas une vérification —
// elle demande au compilateur de faire confiance. C'est ainsi que `Profil` a pu
// déclarer pendant des semaines un champ `date_naissance` correspondant à une
// colonne QUI N'EXISTAIT PAS (P-02) : rien ne pouvait le signaler.
//
// Régénérer après toute migration :
//
//   npm run types:generate
//
// (nécessite la CLI Supabase et un SUPABASE_ACCESS_TOKEN ; à défaut, le MCP
// Supabase sait aussi produire ce fichier)
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.15';
  };
  public: {
    Tables: {
      avis: {
        Row: {
          contenu: string | null;
          date_creation: string;
          date_modification: string;
          id_avis: string;
          id_formation: string;
          id_profil: string;
          note: number;
          statut: string;
        };
        Insert: {
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          id_avis?: string;
          id_formation: string;
          id_profil: string;
          note: number;
          statut?: string;
        };
        Update: {
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          id_avis?: string;
          id_formation?: string;
          id_profil?: string;
          note?: number;
          statut?: string;
        };
        Relationships: [];
      };
      certificats: {
        Row: {
          chemin_storage: string | null;
          date_obtention: string;
          id_certificat: string;
          id_formation: string;
          id_profil: string;
          numero: string;
        };
        Insert: {
          chemin_storage?: string | null;
          date_obtention?: string;
          id_certificat?: string;
          id_formation: string;
          id_profil: string;
          numero: string;
        };
        Update: {
          chemin_storage?: string | null;
          date_obtention?: string;
          id_certificat?: string;
          id_formation?: string;
          id_profil?: string;
          numero?: string;
        };
        Relationships: [];
      };
      commentaires: {
        Row: {
          contenu: string;
          date_creation: string;
          date_modification: string;
          id_commentaire: string;
          id_lecon: string;
          id_parent: string | null;
          id_profil: string;
          statut: string;
        };
        Insert: {
          contenu: string;
          date_creation?: string;
          date_modification?: string;
          id_commentaire?: string;
          id_lecon: string;
          id_parent?: string | null;
          id_profil: string;
          statut?: string;
        };
        Update: {
          contenu?: string;
          date_creation?: string;
          date_modification?: string;
          id_commentaire?: string;
          id_lecon?: string;
          id_parent?: string | null;
          id_profil?: string;
          statut?: string;
        };
        Relationships: [];
      };
      formations: {
        Row: {
          date_creation: string;
          date_modification: string;
          delivre_certificat: boolean;
          description: string | null;
          devise: string;
          est_publiee: boolean;
          id_formation: string;
          prix_centimes: number;
          slug: string;
          titre: string;
        };
        Insert: {
          date_creation?: string;
          date_modification?: string;
          delivre_certificat?: boolean;
          description?: string | null;
          devise?: string;
          est_publiee?: boolean;
          id_formation?: string;
          prix_centimes?: number;
          slug: string;
          titre: string;
        };
        Update: {
          date_creation?: string;
          date_modification?: string;
          delivre_certificat?: boolean;
          description?: string | null;
          devise?: string;
          est_publiee?: boolean;
          id_formation?: string;
          prix_centimes?: number;
          slug?: string;
          titre?: string;
        };
        Relationships: [];
      };
      inscriptions: {
        Row: {
          date_inscription: string;
          date_modification: string;
          id_formation: string;
          id_inscription: string;
          id_paiement: string | null;
          id_profil: string;
          source: string;
          statut: string;
        };
        Insert: {
          date_inscription?: string;
          date_modification?: string;
          id_formation: string;
          id_inscription?: string;
          id_paiement?: string | null;
          id_profil: string;
          source?: string;
          statut?: string;
        };
        Update: {
          date_inscription?: string;
          date_modification?: string;
          id_formation?: string;
          id_inscription?: string;
          id_paiement?: string | null;
          id_profil?: string;
          source?: string;
          statut?: string;
        };
        Relationships: [];
      };
      journal_admin: {
        Row: {
          action: string;
          auteur: string | null;
          cible: string | null;
          date_action: string;
          id_journal: string;
          id_profil: string | null;
          meta: Json | null;
        };
        Insert: {
          action: string;
          auteur?: string | null;
          cible?: string | null;
          date_action?: string;
          id_journal?: string;
          id_profil?: string | null;
          meta?: Json | null;
        };
        Update: {
          action?: string;
          auteur?: string | null;
          cible?: string | null;
          date_action?: string;
          id_journal?: string;
          id_profil?: string | null;
          meta?: Json | null;
        };
        Relationships: [];
      };
      lecons: {
        Row: {
          contenu: string | null;
          date_creation: string;
          date_modification: string;
          description: string | null;
          duree_s: number | null;
          est_publiee: boolean;
          id_lecon: string;
          id_section: string;
          pdf_public_id: string | null;
          position: number;
          titre: string;
          type: string;
          video_metadata: Json;
          video_provider: string;
          video_provider_id: string | null;
          video_url: string | null;
        };
        Insert: {
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          duree_s?: number | null;
          est_publiee?: boolean;
          id_lecon?: string;
          id_section: string;
          pdf_public_id?: string | null;
          position?: number;
          titre: string;
          type?: string;
          video_metadata?: Json;
          video_provider?: string;
          video_provider_id?: string | null;
          video_url?: string | null;
        };
        Update: {
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          duree_s?: number | null;
          est_publiee?: boolean;
          id_lecon?: string;
          id_section?: string;
          pdf_public_id?: string | null;
          position?: number;
          titre?: string;
          type?: string;
          video_metadata?: Json;
          video_provider?: string;
          video_provider_id?: string | null;
          video_url?: string | null;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          cle_evenement: string | null;
          date_envoi: string;
          id_notification: string;
          id_profil: string;
          lien: string | null;
          lu_le: string | null;
          message: string | null;
          priorite: string;
          titre: string;
          type: string;
        };
        Insert: {
          cle_evenement?: string | null;
          date_envoi?: string;
          id_notification?: string;
          id_profil: string;
          lien?: string | null;
          lu_le?: string | null;
          message?: string | null;
          priorite?: string;
          titre: string;
          type?: string;
        };
        Update: {
          cle_evenement?: string | null;
          date_envoi?: string;
          id_notification?: string;
          id_profil?: string;
          lien?: string | null;
          lu_le?: string | null;
          message?: string | null;
          priorite?: string;
          titre?: string;
          type?: string;
        };
        Relationships: [];
      };
      paiements: {
        Row: {
          date_modification: string;
          date_paiement: string;
          devise: string;
          email: string | null;
          id_paiement: string;
          id_profil: string | null;
          mode_test: boolean;
          montant_centimes: number;
          moyen_paiement: string | null;
          reference_transaction: string;
          statut: string;
        };
        Insert: {
          date_modification?: string;
          date_paiement?: string;
          devise?: string;
          email?: string | null;
          id_paiement?: string;
          id_profil?: string | null;
          mode_test?: boolean;
          montant_centimes: number;
          moyen_paiement?: string | null;
          reference_transaction: string;
          statut?: string;
        };
        Update: {
          date_modification?: string;
          date_paiement?: string;
          devise?: string;
          email?: string | null;
          id_paiement?: string;
          id_profil?: string | null;
          mode_test?: boolean;
          montant_centimes?: number;
          moyen_paiement?: string | null;
          reference_transaction?: string;
          statut?: string;
        };
        Relationships: [];
      };
      profils: {
        Row: {
          date_creation: string;
          date_modification: string;
          date_naissance: string | null;
          doit_changer_mdp: boolean;
          est_proprietaire: boolean;
          est_test: boolean;
          id_profil: string;
          nom: string;
          prenom: string;
          role: string;
        };
        Insert: {
          date_creation?: string;
          date_modification?: string;
          date_naissance?: string | null;
          doit_changer_mdp?: boolean;
          est_proprietaire?: boolean;
          est_test?: boolean;
          id_profil: string;
          nom?: string;
          prenom?: string;
          role?: string;
        };
        Update: {
          date_creation?: string;
          date_modification?: string;
          date_naissance?: string | null;
          doit_changer_mdp?: boolean;
          est_proprietaire?: boolean;
          est_test?: boolean;
          id_profil?: string;
          nom?: string;
          prenom?: string;
          role?: string;
        };
        Relationships: [];
      };
      progression_lecons: {
        Row: {
          date_creation: string;
          id_lecon: string;
          id_profil: string;
          id_progression_lecon: string;
          position_video_s: number;
          terminee_le: string | null;
          video_terminee_le: string | null;
        };
        Insert: {
          date_creation?: string;
          id_lecon: string;
          id_profil: string;
          id_progression_lecon?: string;
          position_video_s?: number;
          terminee_le?: string | null;
          video_terminee_le?: string | null;
        };
        Update: {
          date_creation?: string;
          id_lecon?: string;
          id_profil?: string;
          id_progression_lecon?: string;
          position_video_s?: number;
          terminee_le?: string | null;
          video_terminee_le?: string | null;
        };
        Relationships: [];
      };
      questions: {
        Row: {
          date_creation: string;
          date_modification: string;
          explication_echec: string | null;
          explication_reussite: string | null;
          id_question: string;
          id_quiz: string;
          libelle: string;
          position: number;
          type: string;
        };
        Insert: {
          date_creation?: string;
          date_modification?: string;
          explication_echec?: string | null;
          explication_reussite?: string | null;
          id_question?: string;
          id_quiz: string;
          libelle: string;
          position?: number;
          type?: string;
        };
        Update: {
          date_creation?: string;
          date_modification?: string;
          explication_echec?: string | null;
          explication_reussite?: string | null;
          id_question?: string;
          id_quiz?: string;
          libelle?: string;
          position?: number;
          type?: string;
        };
        Relationships: [];
      };
      quiz: {
        Row: {
          date_creation: string;
          date_modification: string;
          est_examen_final: boolean;
          id_formation: string;
          id_lecon: string | null;
          id_quiz: string;
          position: number;
          score_requis: number;
          titre: string;
        };
        Insert: {
          date_creation?: string;
          date_modification?: string;
          est_examen_final?: boolean;
          id_formation: string;
          id_lecon?: string | null;
          id_quiz?: string;
          position?: number;
          score_requis?: number;
          titre: string;
        };
        Update: {
          date_creation?: string;
          date_modification?: string;
          est_examen_final?: boolean;
          id_formation?: string;
          id_lecon?: string | null;
          id_quiz?: string;
          position?: number;
          score_requis?: number;
          titre?: string;
        };
        Relationships: [];
      };
      reponses: {
        Row: {
          contenu: string;
          correcte: boolean;
          date_creation: string;
          date_modification: string;
          id_question: string;
          id_reponse: string;
        };
        Insert: {
          contenu: string;
          correcte?: boolean;
          date_creation?: string;
          date_modification?: string;
          id_question: string;
          id_reponse?: string;
        };
        Update: {
          contenu?: string;
          correcte?: boolean;
          date_creation?: string;
          date_modification?: string;
          id_question?: string;
          id_reponse?: string;
        };
        Relationships: [];
      };
      ressources: {
        Row: {
          chemin_storage: string | null;
          cloudinary_public_id: string | null;
          contenu: string | null;
          date_creation: string;
          date_modification: string;
          description: string | null;
          est_active: boolean;
          id_lecon: string;
          id_ressource: string;
          langage: string | null;
          nom: string;
          position: number;
          taille: number | null;
          type: string;
          type_mime: string | null;
          url: string | null;
        };
        Insert: {
          chemin_storage?: string | null;
          cloudinary_public_id?: string | null;
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          est_active?: boolean;
          id_lecon: string;
          id_ressource?: string;
          langage?: string | null;
          nom: string;
          position?: number;
          taille?: number | null;
          type?: string;
          type_mime?: string | null;
          url?: string | null;
        };
        Update: {
          chemin_storage?: string | null;
          cloudinary_public_id?: string | null;
          contenu?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          est_active?: boolean;
          id_lecon?: string;
          id_ressource?: string;
          langage?: string | null;
          nom?: string;
          position?: number;
          taille?: number | null;
          type?: string;
          type_mime?: string | null;
          url?: string | null;
        };
        Relationships: [];
      };
      sections: {
        Row: {
          accroche: string | null;
          date_creation: string;
          date_modification: string;
          description: string | null;
          est_publiee: boolean;
          id_formation: string;
          id_section: string;
          introduction: string | null;
          objectifs: string[] | null;
          position: number;
          titre: string;
        };
        Insert: {
          accroche?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          est_publiee?: boolean;
          id_formation: string;
          id_section?: string;
          introduction?: string | null;
          objectifs?: string[] | null;
          position?: number;
          titre: string;
        };
        Update: {
          accroche?: string | null;
          date_creation?: string;
          date_modification?: string;
          description?: string | null;
          est_publiee?: boolean;
          id_formation?: string;
          id_section?: string;
          introduction?: string | null;
          objectifs?: string[] | null;
          position?: number;
          titre?: string;
        };
        Relationships: [];
      };
      tentatives_quiz: {
        Row: {
          date_passage: string;
          id_profil: string;
          id_quiz: string;
          id_tentative: string;
          reponses_donnees: Json;
          reussi: boolean;
          score: number;
        };
        Insert: {
          date_passage?: string;
          id_profil: string;
          id_quiz: string;
          id_tentative?: string;
          reponses_donnees?: Json;
          reussi: boolean;
          score: number;
        };
        Update: {
          date_passage?: string;
          id_profil?: string;
          id_quiz?: string;
          id_tentative?: string;
          reponses_donnees?: Json;
          reussi?: boolean;
          score?: number;
        };
        Relationships: [];
      };
    };
    Views: {
      progression_formation: {
        Row: {
          id_formation: string | null;
          id_profil: string | null;
          pourcentage_termine: number | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      a_inscription_active: {
        Args: { p_id_formation: string };
        Returns: boolean;
      };
      acces_demo: { Args: never; Returns: boolean };
      changer_role: {
        Args: { p_id_profil: string; p_role: string };
        Returns: undefined;
      };
      corriger_mon_identite: {
        Args: { p_nom: string; p_prenom: string };
        Returns: undefined;
      };
      corriger_identite: {
        Args: { p_id_profil: string; p_nom: string; p_prenom: string };
        Returns: undefined;
      };
      definir_compte_test: {
        Args: { p_est_test: boolean; p_id_profil: string };
        Returns: undefined;
      };
      definir_date_naissance: { Args: { p_date: string }; Returns: undefined };
      delivrer_certificat: {
        Args: { p_id_formation: string; p_id_profil: string };
        Returns: string;
      };
      est_apprenant: { Args: { p_id_profil: string }; Returns: boolean };
      etats_lecons: {
        Args: { p_id_section: string };
        Returns: {
          a_pdf: boolean;
          duree_s: number;
          etat: string;
          id_lecon: string;
          position: number;
          titre: string;
          type: string;
          video_termine: boolean;
        }[];
      };
      etats_modules: {
        Args: { p_id_formation: string };
        Returns: {
          accroche: string;
          description: string;
          etat: string;
          id_section: string;
          introduction: string;
          lecons_terminees: number;
          objectifs: string[];
          position: number;
          titre: string;
          total_lecons: number;
        }[];
      };
      formation_achevee: {
        Args: { p_id_formation: string; p_id_profil: string };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
      is_formateur_ou_admin: { Args: never; Returns: boolean };
      lecon_contenu: {
        Args: { p_id_lecon: string };
        Returns: {
          contenu: string;
          description: string;
          duree_s: number;
          id_lecon: string;
          id_quiz: string;
          id_section: string;
          pdf_public_id: string;
          position: number;
          position_video_s: number;
          terminee_le: string;
          titre: string;
          type: string;
          video_metadata: Json;
          video_provider: string;
          video_provider_id: string;
          video_terminee_le: string;
          video_url: string;
        }[];
      };
      lecon_debloquee: { Args: { p_id_lecon: string }; Returns: boolean };
      lister_profils_admin: {
        Args: never;
        Returns: {
          date_creation: string;
          doit_changer_mdp: boolean;
          email: string;
          est_proprietaire: boolean;
          est_test: boolean;
          id_profil: string;
          nom: string;
          prenom: string;
          role: string;
        }[];
      };
      ma_progression: {
        Args: never;
        Returns: {
          terminees: number;
          total: number;
        }[];
      };
      mes_donnees_personnelles: { Args: never; Returns: Json };
      nom_affichage: { Args: { p_id_profil: string }; Returns: string };
      note_moyenne_avis: { Args: never; Returns: number | null };
      notifier_admins: {
        Args: {
          p_cle: string;
          p_lien: string;
          p_message: string;
          p_priorite: string;
          p_titre: string;
          p_type: string;
        };
        Returns: undefined;
      };
      numero_certificat: { Args: never; Returns: string };
      prochaines_lecons: {
        Args: { p_limite?: number };
        Returns: {
          duree_s: number;
          est_publiee: boolean;
          id_lecon: string;
          id_section: string;
          pdf_public_id: string;
          position: number;
          titre: string;
          type: string;
          video_provider: string;
          video_provider_id: string;
          video_url: string;
        }[];
      };
      reponses_publiques: {
        Args: { p_id_question: string };
        Returns: {
          contenu: string;
          id_question: string;
          id_reponse: string;
        }[];
      };
      revoquer_pour_remboursement: {
        Args: { p_motif?: string; p_reference: string };
        Returns: boolean;
      };
      suivi_apprenants: {
        Args: { p_decalage?: number; p_limite?: number };
        Returns: {
          date_creation: string;
          est_test: boolean;
          id_profil: string;
          inscrit: boolean;
          nom: string;
          nombre_total: number;
          prenom: string;
          terminees: number;
          total: number;
        }[];
      };
      terminer_lecon: { Args: { p_id_lecon: string }; Returns: undefined };
      verifier_certificat: {
        Args: { p_numero: string };
        Returns: {
          date_obtention: string;
          nom: string;
          numero: string;
          prenom: string;
          titre_formation: string;
        }[];
      };
      video_lecon_terminee: { Args: { p_id_lecon: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database['public'];

/** Ligne d'une table ou d'une vue : `Tables<'profils'>`. */
export type Tables<Nom extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])> =
  (DefaultSchema['Tables'] & DefaultSchema['Views'])[Nom] extends { Row: infer R } ? R : never;

/** Charge utile d'une insertion : `TablesInsert<'avis'>`. */
export type TablesInsert<Nom extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][Nom] extends { Insert: infer I } ? I : never;

/** Charge utile d'une mise à jour : `TablesUpdate<'avis'>`. */
export type TablesUpdate<Nom extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][Nom] extends { Update: infer U } ? U : never;

/** Retour d'une fonction SQL : `FonctionRetour<'ma_progression'>`. */
export type FonctionRetour<Nom extends keyof DefaultSchema['Functions']> =
  DefaultSchema['Functions'][Nom] extends { Returns: infer R } ? R : never;
