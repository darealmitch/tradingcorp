import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Facture } from './facture.model';
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

  /**
   * Factures du profil connecté, la plus récente en tête.
   *
   * LE FILTRE EST EXPLICITE, et ce n'est pas une redondance de la RLS. Pour un
   * apprenant, `factures_select_titulaire` suffirait — elle ne lui montre que
   * ses lignes. Mais la même policy ouvre TOUTES les factures à un
   * administrateur : sans ce `.eq()`, l'écran « Mes factures » lui rendrait
   * celles du site entier sous un titre qui annonce les siennes. Un
   * administrateur qui achète la formation est un client comme un autre, et
   * cette page-ci est celle du client. La comptabilité a son écran
   * (`/espace/facturation`), qui dit ce qu'il montre.
   *
   * Compte introuvable : liste vide plutôt que requête sans filtre — le repli
   * d'une erreur d'authentification ne doit pas être « tout afficher ».
   */
  async chargerFactures(): Promise<Facture[]> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return [];
    }
    return this.acces.lire<Facture[]>(
      'lecture des factures',
      this.acces
        .table('factures')
        .select('id_facture, numero, designation, montant_centimes, devise, date_emission')
        .eq('id_profil', idProfil)
        .order('date_emission', { ascending: false }),
      [],
    );
  }

  /**
   * Lien de téléchargement d'une facture.
   *
   * La facture a été émise et envoyée par Stripe au moment du paiement : cette
   * méthode ne fabrique rien, elle rend le PDF de Stripe. Le lien est redemandé
   * à chaque clic, parce que ceux de Stripe expirent — un lien conservé serait
   * mort bien avant que l'élève ne revienne chercher sa facture.
   */
  async lienFacture(idFacture: string): Promise<{ url?: string; erreur?: string }> {
    const { donnees, erreur } = await this.acces.invoquer<{ url: string }>(
      'téléchargement de la facture',
      'generer-facture',
      { id_facture: idFacture },
      'La facture n’a pas pu être préparée. Réessaie.',
    );
    return { url: donnees?.url, erreur };
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
