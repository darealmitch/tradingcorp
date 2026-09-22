import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { DomaineExpediteur, EssaiFacturation, PaiementLigne } from './finance.model';

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
   * Envoie une confirmation de commande d'essai, sans vente.
   *
   * Le message part à l'adresse demandée, ou à celle du compte si aucune
   * n'est donnée. Ce qui est envoyé, en revanche, n'est pas paramétrable : la
   * vraie confirmation, avec des données fictives et un bandeau d'essai. Rien
   * n'est écrit en base.
   */
  async envoyerFactureEssai(
    destinataire?: string,
  ): Promise<{ resultat?: EssaiFacturation; erreur?: string }> {
    const { donnees, erreur } = await this.acces.invoquer<EssaiFacturation>(
      'essai de facturation',
      'essai-facturation',
      destinataire ? { destinataire } : {},
      'L’essai n’a pas pu être mené. Réessaie.',
    );
    return { resultat: donnees, erreur };
  }

  /**
   * Les enregistrements DNS que Brevo attend, lus par son API.
   *
   * Lus plutôt que recopiés d'une documentation : la valeur d'une clé DKIM est
   * propre au compte, et l'état de chaque enregistrement dit ce qui manque
   * vraiment — ce qu'aucune capture d'écran ne peut donner de façon fiable.
   */
  async enregistrementsExpediteur(): Promise<{
    domaines?: DomaineExpediteur[];
    erreur?: string;
  }> {
    const { donnees, erreur } = await this.acces.invoquer<{ domaines: DomaineExpediteur[] }>(
      'lecture des domaines expéditeurs',
      'essai-facturation',
      { mode: 'dns' },
      'Les enregistrements n’ont pas pu être lus. Réessaie.',
    );
    return { domaines: donnees?.domaines, erreur };
  }
}
