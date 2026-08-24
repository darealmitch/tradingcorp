import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { ApprenantSuivi, CertificatEmis, InscriptionRecente } from './pilotage.model';

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
 *
 * C'est précisément l'écran où un zéro trompe le plus : « aucun apprenant » et
 * « la lecture a échoué » se ressemblent trait pour trait. Tous les appels
 * passent donc par `AccesDonnees`, qui distingue les deux.
 */
@Injectable({ providedIn: 'root' })
export class PilotageService {
  private readonly acces = inject(AccesDonnees);

  /** Nombre de comptes apprenants réels — les comptes test sont exclus. */
  async compterApprenants(): Promise<number> {
    return this.acces.compter(
      'comptage des apprenants',
      this.acces
        .table('profils')
        .select('id_profil', { count: 'exact', head: true })
        .eq('role', 'apprenant')
        .eq('est_test', false),
    );
  }

  /** Nombre total de leçons du programme. */
  async compterLecons(): Promise<number> {
    return this.acces.compter(
      'comptage des étapes',
      this.acces.table('lecons').select('id_lecon', { count: 'exact', head: true }),
    );
  }

  /**
   * Nombre de certificats émis (lecture staff via RLS).
   *
   * Rejoint ici les autres compteurs du tableau de bord : la question posée est
   * la même — « où en est la plateforme ? » — quand bien même la table diffère.
   */
  async compterCertificats(): Promise<number> {
    return this.acces.compter(
      'comptage des certificats',
      this.acces.table('certificats').select('id_certificat', { count: 'exact', head: true }),
    );
  }

  /**
   * Suivi par apprenant : inscription active et leçons terminées.
   *
   * Les quatre lectures partent en parallèle puis sont recoupées en mémoire :
   * une jointure SQL équivalente exigerait une vue dédiée, et le volume
   * (quelques centaines de lignes) ne le justifie pas.
   */
  async suivreApprenants(): Promise<ApprenantSuivi[]> {
    const [lignes, inscriptions, progression, total] = await Promise.all([
      this.acces.lire<
        {
          id_profil: string;
          prenom: string;
          nom: string;
          date_creation: string;
          est_test: boolean;
        }[]
      >(
        'lecture des apprenants',
        this.acces
          .table('profils')
          .select('id_profil, prenom, nom, date_creation, est_test')
          .eq('role', 'apprenant')
          .order('date_creation'),
        [],
      ),
      this.acces.lire<{ id_profil: string }[]>(
        'lecture des inscriptions actives',
        this.acces.table('inscriptions').select('id_profil').eq('statut', 'active'),
        [],
      ),
      this.acces.lire<{ id_profil: string }[]>(
        'lecture de la progression des apprenants',
        this.acces.table('progression_lecons').select('id_profil').not('terminee_le', 'is', null),
        [],
      ),
      this.compterLecons(),
    ]);

    const inscrits = new Set(inscriptions.map((i) => i.id_profil));
    const terminees = new Map<string, number>();
    for (const ligne of progression) {
      terminees.set(ligne.id_profil, (terminees.get(ligne.id_profil) ?? 0) + 1);
    }

    return lignes.map((profil) => ({
      ...profil,
      inscrit: inscrits.has(profil.id_profil),
      terminees: terminees.get(profil.id_profil) ?? 0,
      total,
    }));
  }

  /**
   * Certificats délivrés, du plus récent au plus ancien.
   *
   * Même source que `compterCertificats` : la RLS
   * (`certificats_select_self_ou_staff`) ouvre déjà la table entière au staff,
   * il n'y a donc aucun filtre à poser ici — le poser laisserait croire que
   * c'est l'écran qui protège la donnée.
   */
  async certificatsEmis(limite: number): Promise<CertificatEmis[]> {
    return this.acces.lire<CertificatEmis[]>(
      'lecture des certificats émis',
      this.acces
        .table('certificats')
        .select('id_certificat, numero, date_obtention, profils(prenom, nom), formations(titre)')
        .order('date_obtention', { ascending: false })
        .limit(limite),
      [],
    );
  }

  /** Dernières inscriptions à une formation, pour le fil d'activité. */
  async inscriptionsRecentes(limite: number): Promise<InscriptionRecente[]> {
    return this.acces.lire<InscriptionRecente[]>(
      'lecture des inscriptions récentes',
      this.acces
        .table('inscriptions')
        .select('date_inscription, profils(prenom, nom), formations(titre)')
        .order('date_inscription', { ascending: false })
        .limit(limite),
      [],
    );
  }
}
