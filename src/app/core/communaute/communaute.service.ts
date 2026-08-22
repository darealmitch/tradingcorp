import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Avis, Commentaire, FilCommentaire } from './communaute.model';

/**
 * Avis de formation et commentaires de chapitre — la voie d'ÉCRITURE, pendant
 * de `ModerationService` qui n'en est que la relecture par le staff.
 *
 * Rien n'est décidé ici : les policies RLS posent déjà les règles, et ce
 * service ne fait que les respecter pour éviter à l'apprenant des refus
 * inutiles.
 *
 *   • écrire suppose une inscription active à la formation concernée ;
 *   • le statut d'entrée est imposé à `en_attente` par le serveur — on ne
 *     l'envoie donc pas, la valeur par défaut de la colonne suffit ;
 *   • un avis ne se modifie que tant qu'il est en attente. Une fois approuvé,
 *     il est figé : sans quoi un avis pourrait être validé aimable puis
 *     réécrit en tout autre chose.
 */
@Injectable({ providedIn: 'root' })
export class CommunauteService {
  private readonly acces = inject(AccesDonnees);

  // ===== Avis =====

  /** Mon avis sur cette formation, ou null si je n'en ai pas encore déposé. */
  async monAvis(idFormation: string): Promise<Avis | null> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return null;
    }
    const lignes = await this.acces.lire<Avis[]>(
      'lecture de mon avis',
      this.acces
        .table('avis')
        .select('id_avis, id_formation, note, contenu, statut, date_creation')
        .eq('id_formation', idFormation)
        .eq('id_profil', idProfil),
      [],
    );
    return lignes[0] ?? null;
  }

  /**
   * Dépose mon avis. `id_profil` est posé explicitement : la policy exige
   * `id_profil = auth.uid()`, et une ligne sans cette colonne serait refusée.
   */
  async deposerAvis(idFormation: string, note: number, contenu: string): Promise<string | null> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return 'Connexion requise.';
    }
    return this.acces.ecrire(
      'dépôt d’un avis',
      this.acces.table('avis').insert({
        id_profil: idProfil,
        id_formation: idFormation,
        note,
        contenu: contenu.trim() || null,
      }),
      "L'avis n'a pas pu être enregistré. Réessaie.",
    );
  }

  /**
   * Modifie mon avis tant qu'il est en attente.
   *
   * `modifier` et non `ecrire` : la policy écarte silencieusement la ligne
   * quand l'avis vient d'être approuvé entre l'affichage et l'envoi. Sans la
   * preuve qu'une ligne a bougé, l'écran annoncerait une modification que la
   * base n'a pas faite.
   */
  async modifierAvis(idAvis: string, note: number, contenu: string): Promise<string | null> {
    return this.acces.modifier(
      'modification d’un avis',
      this.acces
        .table('avis')
        .update({ note, contenu: contenu.trim() || null })
        .eq('id_avis', idAvis)
        .select('id_avis'),
      "Ton avis a déjà été traité par l'équipe : il n'est plus modifiable.",
    );
  }

  // ===== Commentaires =====

  /**
   * Commentaires d'un chapitre, organisés en fils.
   *
   * La RLS ne renvoie que les commentaires approuvés, les miens quel que soit
   * leur statut, et tout pour le staff — l'écran n'a donc aucun filtrage à
   * refaire. Une réponse dont le message parent est encore en modération se
   * retrouverait orpheline : elle est alors présentée comme un message, plutôt
   * que masquée, pour ne pas escamoter un propos légitime.
   */
  async commentaires(idLecon: string): Promise<FilCommentaire[]> {
    const lignes = await this.acces.lire<Commentaire[]>(
      'lecture des commentaires',
      this.acces
        .table('commentaires')
        .select(
          'id_commentaire, id_parent, contenu, statut, date_creation, id_profil, profils(prenom, nom)',
        )
        .eq('id_lecon', idLecon)
        .order('date_creation', { ascending: true }),
      [],
    );

    const visibles = new Set(lignes.map((c) => c.id_commentaire));
    const messages = lignes.filter((c) => !c.id_parent || !visibles.has(c.id_parent));
    return messages.map((message) => ({
      message,
      reponses: lignes.filter((c) => c.id_parent === message.id_commentaire),
    }));
  }

  /** Publie un commentaire, ou une réponse si `idParent` est fourni. */
  async publierCommentaire(
    idLecon: string,
    contenu: string,
    idParent?: string,
  ): Promise<string | null> {
    const idProfil = await this.acces.idUtilisateur();
    if (!idProfil) {
      return 'Connexion requise.';
    }
    return this.acces.ecrire(
      'publication d’un commentaire',
      this.acces.table('commentaires').insert({
        id_profil: idProfil,
        id_lecon: idLecon,
        id_parent: idParent ?? null,
        contenu: contenu.trim(),
      }),
      "Le commentaire n'a pas pu être publié. Réessaie.",
    );
  }

  /** Supprime mon commentaire (la RLS autorise l'auteur et le staff). */
  async supprimerCommentaire(idCommentaire: string): Promise<string | null> {
    return this.acces.modifier(
      'suppression d’un commentaire',
      this.acces
        .table('commentaires')
        .delete()
        .eq('id_commentaire', idCommentaire)
        .select('id_commentaire'),
      'La suppression a échoué. Réessaie.',
    );
  }
}
