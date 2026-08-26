import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';

export interface CommentaireEnAttente {
  id_commentaire: string;
  contenu: string;
  date_creation: string;
  profils: { prenom: string; nom: string } | null;
  lecons: { titre: string } | null;
}

export interface AvisEnAttente {
  id_avis: string;
  note: number;
  contenu: string | null;
  date_creation: string;
  profils: { prenom: string; nom: string } | null;
}

/** File de modération (RLS : lecture et mise à jour réservées au staff). */
@Injectable({ providedIn: 'root' })
export class ModerationService {
  private readonly acces = inject(AccesDonnees);

  async commentairesEnAttente(): Promise<CommentaireEnAttente[]> {
    return this.acces.lire<CommentaireEnAttente[]>(
      'lecture des commentaires à modérer',
      this.acces
        .table('commentaires')
        .select('id_commentaire, contenu, date_creation, profils(prenom, nom), lecons(titre)')
        .eq('statut', 'en_attente')
        .order('date_creation', { ascending: false }),
      [],
    );
  }

  async avisEnAttente(): Promise<AvisEnAttente[]> {
    return this.acces.lire<AvisEnAttente[]>(
      'lecture des avis à modérer',
      this.acces
        .table('avis')
        .select('id_avis, note, contenu, date_creation, profils(prenom, nom)')
        .eq('statut', 'en_attente')
        .order('date_creation', { ascending: false }),
      [],
    );
  }

  /**
   * Approuve ou rejette un commentaire. Retourne un message d'erreur, ou null.
   *
   * `modifier` et non `ecrire` : les policies de modération écartent les lignes
   * plutôt que de refuser l'opération. Un formateur dont le rôle vient de
   * changer, ou un avis déjà traité par quelqu'un d'autre entre-temps, ne
   * produisent AUCUNE erreur — l'écriture ne touche simplement rien. La file se
   * viderait à l'écran sans que la base bouge. C'est le `.select()` qui permet
   * de trancher : ce sont les lignes réellement modifiées qui reviennent.
   */
  async traiterCommentaire(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    return this.acces.modifier(
      'modération d’un commentaire',
      this.acces
        .table('commentaires')
        .update({ statut })
        .eq('id_commentaire', id)
        .select('id_commentaire'),
      'La modération a échoué. Réessaie.',
    );
  }

  /** Approuve ou rejette un avis. Retourne un message d'erreur, ou null. */
  async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    return this.acces.modifier(
      'modération d’un avis',
      this.acces.table('avis').update({ statut }).eq('id_avis', id).select('id_avis'),
      'La modération a échoué. Réessaie.',
    );
  }

  async compterCommentairesEnAttente(): Promise<number> {
    return this.acces.compter(
      'comptage des commentaires à modérer',
      this.acces
        .table('commentaires')
        .select('id_commentaire', { count: 'exact', head: true })
        .eq('statut', 'en_attente'),
    );
  }

  /** Note moyenne des avis approuvés, formatée — null tant qu'aucun avis. */
  async noteMoyenne(): Promise<string | null> {
    // La moyenne se calcule en base. Charger tous les avis approuvés pour les
    // additionner dans le navigateur faisait croître le transfert avec le
    // succès de la plateforme, pour produire un seul nombre (audit P-10).
    const brut = await this.acces.lire<number | string | null>(
      'lecture de la note moyenne',
      this.acces.appel('note_moyenne_avis'),
      null,
    );
    // `typeof` plutôt qu'une comparaison à `null` : `Number([])` vaut 0, si
    // bien qu'une valeur inattendue produirait une note de « 0 / 5 » — une
    // moyenne inexistante déguisée en pire note possible.
    if (typeof brut !== 'number' && typeof brut !== 'string') {
      return null;
    }
    // `numeric` peut arriver en nombre ou en chaîne selon la sérialisation :
    // sur une chaîne, `toLocaleString` existerait mais ignorerait les options
    // et rendrait la valeur brute — d'où la conversion explicite.
    const moyenne = Number(brut);
    if (Number.isNaN(moyenne)) {
      return null;
    }
    return `${moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5`;
  }
}
