import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

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
  private readonly supabase = inject(SUPABASE);

  async commentairesEnAttente(): Promise<CommentaireEnAttente[]> {
    const { data } = await this.supabase
      .from('commentaires')
      .select('id_commentaire, contenu, date_creation, profils(prenom, nom), lecons(titre)')
      .eq('statut', 'en_attente')
      .order('date_creation', { ascending: false });
    return (data as unknown as CommentaireEnAttente[] | null) ?? [];
  }

  async avisEnAttente(): Promise<AvisEnAttente[]> {
    const { data } = await this.supabase
      .from('avis')
      .select('id_avis, note, contenu, date_creation, profils(prenom, nom)')
      .eq('statut', 'en_attente')
      .order('date_creation', { ascending: false });
    return (data as unknown as AvisEnAttente[] | null) ?? [];
  }

  /** Approuve ou rejette un commentaire. Retourne un message d'erreur, ou null. */
  async traiterCommentaire(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    const { error } = await this.supabase
      .from('commentaires')
      .update({ statut })
      .eq('id_commentaire', id);
    return error ? 'La modération a échoué. Réessaie.' : null;
  }

  /** Approuve ou rejette un avis. Retourne un message d'erreur, ou null. */
  async traiterAvis(id: string, statut: 'approuve' | 'rejete'): Promise<string | null> {
    const { error } = await this.supabase.from('avis').update({ statut }).eq('id_avis', id);
    return error ? 'La modération a échoué. Réessaie.' : null;
  }

  async compterCommentairesEnAttente(): Promise<number> {
    const { count } = await this.supabase
      .from('commentaires')
      .select('id_commentaire', { count: 'exact', head: true })
      .eq('statut', 'en_attente');
    return count ?? 0;
  }

  /** Note moyenne des avis approuvés, formatée — null tant qu'aucun avis. */
  async noteMoyenne(): Promise<string | null> {
    const { data } = await this.supabase.from('avis').select('note').eq('statut', 'approuve');
    const notes = ((data as { note: number }[] | null) ?? []).map((a) => a.note);
    if (notes.length === 0) {
      return null;
    }
    const moyenne = notes.reduce((somme, note) => somme + note, 0) / notes.length;
    return `${moyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / 5`;
  }
}
