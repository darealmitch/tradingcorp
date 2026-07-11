import { Injectable, inject } from '@angular/core';
import { SUPABASE } from '../supabase/supabase.client';
import { LeconDetail, LeconResume, Module, ProgressionResume } from './apprentissage.model';

export type {
  LeconDetail,
  LeconResume,
  Module,
  ProgressionResume,
  Ressource,
} from './apprentissage.model';

export interface ApprenantSuivi {
  id_profil: string;
  prenom: string;
  nom: string;
  date_creation: string;
  est_test: boolean;
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

  /** Modules (sections) et leurs étapes, dans l'ordre du programme. */
  async chargerStructure(): Promise<Module[]> {
    const { data } = await this.supabase
      .from('sections')
      .select(
        'id_section, titre, description, position, est_publiee, ' +
          'lecons(id_lecon, titre, position, duree_s, est_publiee, apercu_gratuit, ' +
          'video_provider, video_provider_id, pdf_public_id)',
      )
      .order('position')
      .order('position', { referencedTable: 'lecons' });
    return (data as Module[] | null) ?? [];
  }

  /** Une leçon complète avec ses ressources (vue étape). RLS : gating standard. */
  async chargerLecon(idLecon: string): Promise<LeconDetail | null> {
    const { data } = await this.supabase
      .from('lecons')
      .select(
        'id_lecon, id_section, titre, description, contenu, position, duree_s, est_publiee, ' +
          'apercu_gratuit, video_provider, video_provider_id, pdf_public_id, ' +
          'ressources(id_ressource, nom, type_mime, cloudinary_public_id, chemin_storage, taille)',
      )
      .eq('id_lecon', idLecon)
      .maybeSingle();
    return (data as LeconDetail | null) ?? null;
  }

  /** Marque une étape comme terminée (validation). RLS : `progression_all_self`. */
  async marquerTerminee(idLecon: string): Promise<void> {
    const idProfil = await this.idProfilCourant();
    if (!idProfil) {
      return;
    }
    await this.supabase
      .from('progression_lecons')
      .upsert(
        { id_profil: idProfil, id_lecon: idLecon, terminee_le: new Date().toISOString() },
        { onConflict: 'id_profil,id_lecon' },
      );
  }

  /** Sauvegarde la position de lecture vidéo (reprise). */
  async enregistrerPosition(idLecon: string, secondes: number): Promise<void> {
    const idProfil = await this.idProfilCourant();
    if (!idProfil) {
      return;
    }
    await this.supabase
      .from('progression_lecons')
      .upsert(
        { id_profil: idProfil, id_lecon: idLecon, position_video_s: Math.floor(secondes) },
        { onConflict: 'id_profil,id_lecon' },
      );
  }

  private async idProfilCourant(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user?.id ?? null;
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

  /** Suivi par apprenant : inscription active et leçons terminées (staff). */
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
