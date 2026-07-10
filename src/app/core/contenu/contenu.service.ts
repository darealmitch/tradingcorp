import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';

export interface LeconResume {
  id_lecon: string;
  titre: string;
  duree_s: number | null;
  position: number;
  apercu_gratuit: boolean;
  video_provider: string;
}

export interface SectionAvecLecons {
  id_section: string;
  titre: string;
  position: number;
  lecons: LeconResume[];
}

export interface ProgressionResume {
  terminees: number;
  total: number;
}

export interface ApprenantSuivi {
  id_profil: string;
  prenom: string;
  nom: string;
  date_creation: string;
  inscrit: boolean;
  terminees: number;
  total: number;
}

export interface InscriptionRecente {
  date_inscription: string;
  profils: { prenom: string; nom: string } | null;
  formations: { titre: string } | null;
}

/** Structure pédagogique et progression (RLS : gating par inscription, staff voit tout). */
@Injectable({ providedIn: 'root' })
export class ContenuService {
  private readonly supabase = inject(SUPABASE);

  /** Sections et leçons, dans l'ordre du programme. */
  async chargerStructure(): Promise<SectionAvecLecons[]> {
    const { data } = await this.supabase
      .from('sections')
      .select(
        'id_section, titre, position, lecons(id_lecon, titre, duree_s, position, apercu_gratuit, video_provider)',
      )
      .order('position')
      .order('position', { referencedTable: 'lecons' });
    return (data as SectionAvecLecons[] | null) ?? [];
  }

  /** Progression du profil connecté : leçons terminées / leçons accessibles. */
  async maProgression(): Promise<ProgressionResume> {
    const [lecons, terminees] = await Promise.all([
      this.supabase.from('lecons').select('id_lecon', { count: 'exact', head: true }),
      this.supabase
        .from('progression_lecons')
        .select('id_progression_lecon', { count: 'exact', head: true })
        .not('terminee_le', 'is', null),
    ]);
    return { terminees: terminees.count ?? 0, total: lecons.count ?? 0 };
  }

  /** Prochaines leçons non terminées, dans l'ordre du programme. */
  async prochainesLecons(limite: number): Promise<LeconResume[]> {
    const [structure, progression] = await Promise.all([
      this.chargerStructure(),
      this.supabase.from('progression_lecons').select('id_lecon').not('terminee_le', 'is', null),
    ]);
    const faites = new Set(
      ((progression.data as { id_lecon: string }[] | null) ?? []).map((p) => p.id_lecon),
    );
    return structure
      .flatMap((section) => section.lecons)
      .filter((lecon) => !faites.has(lecon.id_lecon))
      .slice(0, limite);
  }

  /** Nombre de comptes apprenants (lecture staff via RLS). */
  async compterApprenants(): Promise<number> {
    const { count } = await this.supabase
      .from('profils')
      .select('id_profil', { count: 'exact', head: true })
      .eq('role', 'apprenant');
    return count ?? 0;
  }

  /** Nombre total de leçons du programme. */
  async compterLecons(): Promise<number> {
    const { count } = await this.supabase
      .from('lecons')
      .select('id_lecon', { count: 'exact', head: true });
    return count ?? 0;
  }

  /** Suivi par apprenant : inscription active et leçons terminées (staff). */
  async suivreApprenants(): Promise<ApprenantSuivi[]> {
    const [profils, inscriptions, progression, total] = await Promise.all([
      this.supabase
        .from('profils')
        .select('id_profil, prenom, nom, date_creation')
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
        { id_profil: string; prenom: string; nom: string; date_creation: string }[] | null) ?? [];
    return lignes.map((profil) => ({
      ...profil,
      inscrit: inscrits.has(profil.id_profil),
      terminees: terminees.get(profil.id_profil) ?? 0,
      total,
    }));
  }

  /** Quiz accessibles au profil connecté (RLS : inscription active, ou staff). */
  async compterQuiz(): Promise<number> {
    const { count } = await this.supabase
      .from('quiz')
      .select('id_quiz', { count: 'exact', head: true });
    return count ?? 0;
  }

  /** Quiz réussis par le profil connecté (RLS : ses tentatives). */
  async compterQuizReussis(): Promise<number> {
    const { count } = await this.supabase
      .from('tentatives_quiz')
      .select('id_tentative', { count: 'exact', head: true })
      .eq('reussi', true);
    return count ?? 0;
  }

  /** Certificats du profil connecté (RLS : les siens). */
  async compterMesCertificats(): Promise<number> {
    const { count } = await this.supabase
      .from('certificats')
      .select('id_certificat', { count: 'exact', head: true });
    return count ?? 0;
  }

  /** Dernières inscriptions à une formation (staff). */
  async inscriptionsRecentes(limite: number): Promise<InscriptionRecente[]> {
    const { data } = await this.supabase
      .from('inscriptions')
      .select('date_inscription, profils(prenom, nom), formations(titre)')
      .order('date_inscription', { ascending: false })
      .limit(limite);
    return (data as unknown as InscriptionRecente[] | null) ?? [];
  }
}
