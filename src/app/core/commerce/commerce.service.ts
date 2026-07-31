import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Formation, Inscription } from './formation.model';

const ERREUR_GENERIQUE = 'Le paiement est indisponible pour le moment. Réessaie plus tard.';

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private readonly acces = inject(AccesDonnees);

  /** Formations publiées (policy RLS `formations_select_public`). */
  async chargerFormations(): Promise<Formation[]> {
    return this.acces.lire<Formation[]>(
      'lecture des formations',
      this.acces
        .table('formations')
        .select('id_formation, titre, slug, description, prix_centimes, devise')
        .eq('est_publiee', true)
        .order('prix_centimes'),
      [],
    );
  }

  /** Inscriptions actives du profil connecté (RLS : ses lignes uniquement). */
  async chargerInscriptions(): Promise<Inscription[]> {
    return this.acces.lire<Inscription[]>(
      'lecture des inscriptions',
      this.acces
        .table('inscriptions')
        .select('id_inscription, id_formation, statut')
        .eq('statut', 'active'),
      [],
    );
  }

  /**
   * Démarre l'achat : l'Edge Function `checkout` crée la session Stripe et
   * renvoie l'URL de sa page de paiement hébergée, vers laquelle on redirige.
   * Retourne un message d'erreur prêt à afficher, ou null si la redirection part.
   */
  async lancerCheckout(idFormation: string): Promise<string | null> {
    const { donnees, erreur } = await this.acces.invoquer<{ url?: string }>(
      'ouverture du paiement',
      'checkout',
      { id_formation: idFormation },
      ERREUR_GENERIQUE,
    );
    if (erreur) {
      return erreur;
    }
    if (!donnees?.url) {
      return ERREUR_GENERIQUE;
    }
    location.assign(donnees.url);
    return null;
  }
}
