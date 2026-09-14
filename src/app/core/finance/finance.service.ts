import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { FactureEmise, PaiementLigne } from './finance.model';

/**
 * Historique des paiements encaissés.
 *
 * Lecture seule : les paiements sont écrits par le seul webhook Stripe, en
 * `service_role`, et aucune policy d'écriture n'est ouverte au client. Ce
 * service ne peut donc rien altérer, par construction.
 */
@Injectable({ providedIn: 'root' })
export class FinanceService {
  private readonly acces = inject(AccesDonnees);

  /** Historique complet avec le profil payeur (RLS : admin). */
  async listerPaiements(): Promise<PaiementLigne[]> {
    return this.acces.lire<PaiementLigne[]>(
      'lecture des paiements',
      this.acces
        .table('paiements')
        .select(
          'id_paiement, montant_centimes, devise, statut, moyen_paiement, reference_transaction, email, date_paiement, mode_test, profils(role, est_test)',
        )
        .order('date_paiement', { ascending: false }),
      [],
    );
  }

  /**
   * Toutes les factures émises, la plus récente en tête.
   *
   * Réservé de fait à l'administrateur : depuis 20260914100000,
   * `factures_select_titulaire` ne rend au-delà de ses propres lignes que sur
   * `is_admin()`. Un formateur qui appellerait cette méthode recevrait ses
   * factures à lui, et rien d'autre — la garde de route n'est pas ce qui
   * protège, elle ne fait qu'éviter d'afficher une page qui mentirait.
   */
  async listerFactures(): Promise<FactureEmise[]> {
    return this.acces.lire<FactureEmise[]>(
      'lecture des factures émises',
      this.acces
        .table('factures')
        .select(
          'id_facture, numero, designation, montant_centimes, devise, date_emission, id_profil, client_nom, client_email, mode_test',
        )
        .order('date_emission', { ascending: false }),
      [],
    );
  }
}
