import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Formation, FormationStaff, Inscription } from './formation.model';

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
   * Toutes les formations, brouillons compris, avec leurs réglages (RLS :
   * `formations_select_public` n'ouvre les non publiées qu'au staff).
   */
  async listerFormationsStaff(): Promise<FormationStaff[]> {
    return this.acces.lire<FormationStaff[]>(
      'lecture des formations (staff)',
      this.acces
        .table('formations')
        .select('id_formation, titre, slug, est_publiee, delivre_certificat')
        .order('prix_centimes'),
      [],
    );
  }

  /**
   * Décide si une formation donne droit à un certificat à son achèvement.
   *
   * Réglage volontairement explicite et par formation : le certificat atteste
   * d'un cursus, pas de la traversée d'un contenu quelconque. Une formation
   * ajoutée au catalogue n'est certifiante que si quelqu'un l'a décidé ici.
   */
  async definirCertifiante(idFormation: string, certifiante: boolean): Promise<string | null> {
    // `modifier` plutôt qu'`ecrire` : la policy `formations_write_staff` écarte
    // simplement les lignes pour qui n'est pas du staff, sans lever d'erreur.
    // Sans le `.select()`, un refus d'autorisation passerait pour un succès.
    return this.acces.modifier(
      'réglage du certificat',
      this.acces
        .table('formations')
        .update({ delivre_certificat: certifiante })
        .eq('id_formation', idFormation)
        .select('id_formation'),
      'Le réglage n’a pas pu être enregistré. Réessaie.',
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
