import { Injectable, inject } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import {
  ApprenantSuivi,
  CertificatEmis,
  DecompteApprenants,
  InscriptionRecente,
} from './pilotage.model';

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

  /**
   * Décompte des apprenants : le total, et la part tenue par des comptes de
   * démonstration.
   *
   * Les comptes de test étaient purement et simplement exclus du comptage
   * (`.eq('est_test', false)`), si bien qu'une plateforme n'hébergeant qu'un
   * compte de recette affichait « 0 apprenant » — un chiffre faux, et
   * inquiétant, alors que la base contenait bien un compte.
   *
   * Ils sont désormais comptés ET dénombrés à part : le tableau de bord peut
   * ainsi annoncer le total sans laisser croire qu'il s'agit de clients réels.
   * Les comptes de test restent en revanche exclus du chiffre d'affaires
   * (`compteDansCa`) et de la délivrance des certificats — ils n'achètent pas
   * et ne sont pas diplômés, seule leur PRÉSENCE est réelle.
   */
  async compterApprenants(): Promise<DecompteApprenants> {
    const [total, test] = await Promise.all([
      this.acces.compter(
        'comptage des apprenants',
        this.acces
          .table('profils')
          .select('id_profil', { count: 'exact', head: true })
          .eq('role', 'apprenant'),
      ),
      this.acces.compter(
        'comptage des comptes de démonstration',
        this.acces
          .table('profils')
          .select('id_profil', { count: 'exact', head: true })
          .eq('role', 'apprenant')
          .eq('est_test', true),
      ),
    ]);
    return { total, test };
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
