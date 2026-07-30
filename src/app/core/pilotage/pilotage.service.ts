import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { ApprenantSuivi, InscriptionRecente } from './pilotage.model';

/**
 * Lectures d'ensemble réservées au staff : combien d'apprenants, où en sont-ils,
 * qui vient de s'inscrire.
 *
 * Extrait de `ContenuService`, qui portait à la fois le parcours d'un apprenant
 * et ces agrégats d'administration. Un composant du parcours (`lecon-player`,
 * `module-intro`) se voyait ainsi offrir `suivreApprenants()` ou
 * `compterApprenants()` : des méthodes qui ne le concernent pas, dont il ne doit
 * rien savoir, et dont l'évolution le forçait à recompiler. La séparation rend
 * la surface d'API de chaque domaine lisible et referme ce couplage.
 *
 * Aucune vérification de rôle ici : la RLS est l'autorité — un apprenant qui
 * appellerait ces méthodes obtiendrait des ensembles vides, pas une fuite.
 */
@Injectable({ providedIn: 'root' })
export class PilotageService {
  private readonly supabase = inject(SUPABASE);

  /** Nombre de comptes apprenants réels — les comptes test sont exclus. */
  async compterApprenants(): Promise<number> {
    const { count } = await this.supabase
      .from('profils')
      .select('id_profil', { count: 'exact', head: true })
      .eq('role', 'apprenant')
      .eq('est_test', false);
    return count ?? 0;
  }

  /** Nombre total de leçons du programme. */
  async compterLecons(): Promise<number> {
    const { count } = await this.supabase
      .from('lecons')
      .select('id_lecon', { count: 'exact', head: true });
    return count ?? 0;
  }

  /**
   * Nombre de certificats émis (lecture staff via RLS).
   *
   * Rejoint ici les autres compteurs du tableau de bord : la question posée est
   * la même — « où en est la plateforme ? » — quand bien même la table diffère.
   */
  async compterCertificats(): Promise<number> {
    const { count } = await this.supabase
      .from('certificats')
      .select('id_certificat', { count: 'exact', head: true });
    return count ?? 0;
  }

  /**
   * Suivi par apprenant : inscription active et leçons terminées.
   *
   * Les quatre lectures partent en parallèle puis sont recoupées en mémoire :
   * une jointure SQL équivalente exigerait une vue dédiée, et le volume
   * (quelques centaines de lignes) ne le justifie pas.
   */
  async suivreApprenants(): Promise<ApprenantSuivi[]> {
    const [profils, inscriptions, progression, total] = await Promise.all([
      this.supabase
        .from('profils')
        .select('id_profil, prenom, nom, date_creation, est_test')
        .eq('role', 'apprenant')
        .order('date_creation'),
      this.supabase.from('inscriptions').select('id_profil').eq('statut', 'active'),
      this.supabase.from('progression_lecons').select('id_profil').not('terminee_le', 'is', null),
      this.compterLecons(),
    ]);

    const inscrits = new Set(
      ((inscriptions.data as { id_profil: string }[] | null) ?? []).map((i) => i.id_profil),
    );
    const terminees = new Map<string, number>();
    for (const ligne of (progression.data as { id_profil: string }[] | null) ?? []) {
      terminees.set(ligne.id_profil, (terminees.get(ligne.id_profil) ?? 0) + 1);
    }

    const lignes =
      (profils.data as
        | {
            id_profil: string;
            prenom: string;
            nom: string;
            date_creation: string;
            est_test: boolean;
          }[]
        | null) ?? [];
    return lignes.map((profil) => ({
      ...profil,
      inscrit: inscrits.has(profil.id_profil),
      terminees: terminees.get(profil.id_profil) ?? 0,
      total,
    }));
  }

  /** Dernières inscriptions à une formation, pour le fil d'activité. */
  async inscriptionsRecentes(limite: number): Promise<InscriptionRecente[]> {
    const { data } = await this.supabase
      .from('inscriptions')
      .select('date_inscription, profils(prenom, nom), formations(titre)')
      .order('date_inscription', { ascending: false })
      .limit(limite);
    return (data as unknown as InscriptionRecente[] | null) ?? [];
  }
}
