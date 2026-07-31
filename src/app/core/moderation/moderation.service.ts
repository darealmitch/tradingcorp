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

  /** Approuve ou rejette un commentaire. Retourne un message d'erreur, ou null. */
  async traiterCommentaire(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    return this.acces.ecrire(
      'modération d’un commentaire',
      this.acces.table('commentaires').update({ statut }).eq('id_commentaire', id),
      'La modération a échoué. Réessaie.',
    );
  }

  /** Approuve ou rejette un avis. Retourne un message d'erreur, ou null. */
  async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    return this.acces.ecrire(
      'modération d’un avis',
      this.acces.table('avis').update({ statut }).eq('id_avis', id),
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
    const avis = await this.acces.lire<{ note: number }[]>(
      'lecture des notes',
      this.acces.table('avis').select('note').eq('statut', 'approuve'),
      [],
    );
    if (avis.length === 0) {
      return null;
    }
    const moyenne = avis.reduce((somme, a) => somme + a.note, 0) / avis.length;
    return `${moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5`;
  }
}
