import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { PaiementLigne } from './finance.model';

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
}
