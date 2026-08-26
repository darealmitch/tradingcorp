import { Injectable, computed, inject, signal } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from './database.types';
import { SUPABASE } from './supabase.client';

/**
 * Point de passage unique vers la base.
 *
 * Le client Supabase ne lève pas d'exception : il rend `{ data, error }`.
 * Ignorer `error` revient donc à traiter un échec comme un succès aux données
 * vides — un tableau de bord en panne devient indiscernable d'un tableau de
 * bord à zéro, et une écriture refusée par le serveur ne produit rien à
 * l'écran.
 *
 * Ce service ne rend pas l'oubli impossible, mais il le rend visible : aucun
 * appel n'a de raison de passer à côté, puisque les trois formes d'accès sont
 * ici, et un test vérifie mécaniquement qu'aucun service n'appelle plus
 * `.from()`, `.rpc()` ou `.functions.invoke()` en direct.
 *
 * C'est aussi le point d'ancrage prévu pour la journalisation à distance
 * (P-14) : un seul endroit à brancher le jour venu.
 */

/**
 * Forme minimale commune aux réponses PostgREST, RPC et Edge Functions.
 *
 * `data` est volontairement `unknown` : le client n'est pas typé par un schéma
 * généré (P-11), et supabase-js ne sait pas déduire la forme d'un `select()`
 * portant des jointures. Les services annoncent donc le type attendu à
 * `lire()`, exactement comme ils le castaient auparavant sur place — la
 * garantie de typage ne bouge pas, seul l'endroit du cast change. Le jour où
 * les types seront générés, c'est ici que la promesse deviendra vérifiée.
 */
export interface ReponseSupabase {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export interface Incident {
  /** Ce qu'on tentait de faire, en clair : « lecture des notifications ». */
  operation: string;
  /** Message brut du serveur — pour le diagnostic, pas pour l'utilisateur. */
  message: string;
  code?: string;
  date: string;
  /**
   * Identifiant de la session de navigation, commun à tous les incidents d'un
   * même utilisateur. Sans lui, un journal distant n'est qu'une pluie de lignes
   * indépendantes : impossible de dire que ces six erreurs sont le même
   * utilisateur en train de buter six fois sur le même écran (audit P-14).
   *
   * Ce n'est PAS l'identifiant du compte : il est tiré au hasard à chaque
   * chargement de l'application et ne permet de remonter à personne.
   */
  session: string;
}

/**
 * Une exception levée par `raise exception` en SQL remonte avec le code
 * P0001 et un message rédigé pour l'utilisateur (« Chapitre verrouillé »,
 * « La vidéo doit être visionnée jusqu'à la fin »). Vérifié sur l'API réelle :
 * un refus technique, lui, remonte avec son propre code (42501 « permission
 * denied… ») et un message anglais qui n'a rien à faire sous les yeux d'un
 * utilisateur — ni à renseigner qui que ce soit sur l'état interne du système.
 */
const CODE_EXCEPTION_METIER = 'P0001';

/**
 * Noms de tables et de fonctions REELLEMENT présents dans le schéma.
 *
 * C'est ce qui donne sa portée au typage : `table('profil')` — au singulier —
 * ou un appel à une RPC renommée par une migration ne compilent plus. Avant,
 * la faute ne se voyait qu'à l'exécution, sous la forme d'une liste vide.
 */
/**
 * Tables du schéma. Les VUES en sont volontairement absentes : `from()` porte
 * des surcharges distinctes pour les tables et pour les vues, et une union des
 * deux ne résout aucune des deux — le client replie alors tout sur `never`.
 * Aucune vue n'est lue par le front aujourd'hui ; le jour où l'une le sera, il
 * faudra une seconde méthode plutôt qu'élargir celle-ci.
 */
type NomTable = keyof Database['public']['Tables'];
type NomFonction = keyof Database['public']['Functions'];

/**
 * Arguments attendus par une fonction SQL donnée.
 *
 * Les deux méthodes ci-dessous sont GÉNÉRIQUES, et pas seulement typées par
 * l'union des noms : sans le paramètre de type, le client reçoit « une table
 * parmi les dix-sept » et ne peut résoudre aucune colonne — il replie alors
 * tous les Insert/Update sur `never`, et plus rien ne compile. Avec `<T>`, le
 * nom reste le littéral écrit à l'appel, et le schéma se résout table par table.
 */
type ArgsDe<T extends NomFonction> = Database['public']['Functions'][T]['Args'];

const ECHEC_GENERIQUE = 'L’opération a échoué. Réessaie dans un instant.';

@Injectable({ providedIn: 'root' })
export class AccesDonnees {
  private readonly supabase = inject(SUPABASE);

  /**
   * Corrélation d'une session de navigation. `randomUUID` n'existe que sur
   * origine sécurisée — le repli couvre les contextes qui ne l'exposent pas.
   */
  private readonly session =
    globalThis.crypto?.randomUUID?.() ?? `s-${Math.random().toString(36).slice(2)}`;

  private readonly incidentsSig = signal<Incident[]>([]);
  private readonly lectureEnEchecSig = signal(false);

  /** Incidents de la session, du plus ancien au plus récent. */
  readonly incidents = this.incidentsSig.asReadonly();

  /**
   * Vrai dès qu'une lecture a échoué : les écrans peuvent alors dire
   * « données indisponibles » au lieu de laisser croire à un ensemble vide.
   */
  readonly lectureEnEchec = this.lectureEnEchecSig.asReadonly();

  readonly dernierIncident = computed(() => this.incidentsSig().at(-1) ?? null);

  // ===== Construction des requêtes =====
  //
  // `from()` et `rpc()` ne sont appelés que d'ici : les services passent par
  // `table()` et `appel()`, puis remettent le résultat à `lire`, `compter`,
  // `ecrire` ou `invoquer`. C'est ce qui rend la règle vérifiable
  // mécaniquement plutôt que par relecture.

  /** Requête sur une table ou une vue. */
  table<T extends NomTable>(nom: T) {
    return this.supabase.from(nom);
  }

  /** Appel d'une fonction SQL (RPC). */
  appel<T extends NomFonction>(nom: T, params?: ArgsDe<T>) {
    return this.supabase.rpc(nom, params);
  }

  /** Identifiant du compte connecté, ou null. */
  async idUtilisateur(): Promise<string | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    return user?.id ?? null;
  }

  /**
   * Lecture. Rend les données, ou la valeur de repli en signalant l'incident.
   *
   * Le repli est volontairement exigé plutôt que déduit : c'est à l'appelant de
   * dire ce qu'« aucune donnée » veut dire chez lui — une liste vide, zéro, null.
   */
  async lire<T>(operation: string, requete: PromiseLike<ReponseSupabase>, repli: T): Promise<T> {
    const { data, error } = await this.executer(requete);
    if (error) {
      this.signaler(operation, error);
      this.lectureEnEchecSig.set(true);
      return repli;
    }
    return (data as T | null) ?? repli;
  }

  /** Lecture d'un compteur (`head: true, count: 'exact'`). */
  async compter(operation: string, requete: PromiseLike<ReponseSupabase>): Promise<number> {
    const reponse = await this.executer(requete);
    if (reponse.error) {
      this.signaler(operation, reponse.error);
      this.lectureEnEchecSig.set(true);
      return 0;
    }
    return reponse.count ?? 0;
  }

  /**
   * Écriture ou RPC. Rend `null` si l'opération a abouti, sinon un message
   * prêt à afficher — celui du serveur s'il est destiné à l'utilisateur.
   */
  async ecrire(
    operation: string,
    requete: PromiseLike<ReponseSupabase>,
    echec = ECHEC_GENERIQUE,
  ): Promise<string | null> {
    const { error } = await this.executer(requete);
    if (!error) {
      return null;
    }
    this.signaler(operation, error);
    return error.code === CODE_EXCEPTION_METIER ? error.message : echec;
  }

  /**
   * Écriture dont on veut la preuve qu'elle a porté sur quelque chose.
   *
   * Un UPDATE ou un DELETE qu'une policy écarte ne lève AUCUNE erreur : il ne
   * trouve aucune ligne à modifier et rend un succès. `ecrire` le prendrait
   * donc pour une réussite, et l'écran afficherait un changement que la base
   * n'a pas enregistré — le faux succès, symétrique du faux échec.
   *
   * L'appelant doit chaîner `.select()` sur sa requête : ce sont les lignes
   * effectivement touchées que PostgREST renvoie alors, et c'est là-dessus
   * qu'on tranche.
   */
  async modifier(
    operation: string,
    requete: PromiseLike<ReponseSupabase>,
    echec = ECHEC_GENERIQUE,
  ): Promise<string | null> {
    const { data, error } = await this.executer(requete);
    if (error) {
      this.signaler(operation, error);
      return error.code === CODE_EXCEPTION_METIER ? error.message : echec;
    }
    if (Array.isArray(data) && data.length > 0) {
      return null;
    }
    this.signaler(operation, { message: 'aucune ligne modifiée', code: 'VIDE' });
    return echec;
  }

  /**
   * Appel d'Edge Function. Nos fonctions rendent leurs refus sous la forme
   * `{ erreur: "…" }` avec un statut 4xx — que supabase-js présente comme une
   * `FunctionsHttpError` dont le corps doit être relu pour être exploitable.
   */
  async invoquer<T>(
    operation: string,
    nom: string,
    corps: object,
    echec = ECHEC_GENERIQUE,
  ): Promise<{ donnees?: T; erreur?: string }> {
    const { data, error } = await this.supabase.functions.invoke<T>(nom, {
      body: corps as Record<string, unknown>,
    });
    if (!error) {
      return { donnees: data ?? undefined };
    }
    if (error instanceof FunctionsHttpError) {
      const rendu = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      this.signaler(operation, { message: rendu?.erreur ?? error.message });
      return { erreur: rendu?.erreur ?? echec };
    }
    this.signaler(operation, error);
    return { erreur: echec };
  }

  /** Efface les incidents — après un rechargement réussi, par exemple. */
  reinitialiser(): void {
    this.incidentsSig.set([]);
    this.lectureEnEchecSig.set(false);
  }

  /**
   * Une panne réseau fait rejeter la promesse au lieu de rendre `{ error }` :
   * sans cette conversion, l'appelant recevrait une exception là où il attend
   * un objet, et le cas le plus fréquent serait le seul non traité.
   */
  private async executer(requete: PromiseLike<ReponseSupabase>): Promise<ReponseSupabase> {
    try {
      return await requete;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      return { data: null, error: { message, code: 'RESEAU' } };
    }
  }

  private signaler(operation: string, error: { message: string; code?: string }): void {
    const incident: Incident = {
      operation,
      message: error.message,
      code: error.code,
      date: new Date().toISOString(),
      session: this.session,
    };
    // Console volontaire : sans collecteur distant (P-14), c'est la seule
    // trace exploitable dont dispose aujourd'hui qui diagnostique un incident.
    //
    // En production, le message brut n'est PAS écrit : celui de Postgres cite
    // volontiers un nom de colonne, de contrainte ou de policy, et la console
    // d'un navigateur se lit par-dessus l'épaule comme se copie dans une
    // capture d'écran. Le code d'erreur suffit à orienter le diagnostic sans
    // décrire le schéma. En développement, le message complet est conservé —
    // c'est là qu'il sert.
    console.error(
      environment.production
        ? `[TradingCorp] ${operation} — échec${error.code ? ` (${error.code})` : ''}`
        : `[TradingCorp] ${operation} — ${error.message}`,
    );
    this.incidentsSig.update((liste) => [...liste, incident]);
    this.transmettre(incident);
  }

  /**
   * Envoi de l'incident à un collecteur distant, si l'environnement en déclare
   * un. C'est le branchement que P-14 réclamait : jusqu'ici, une erreur en
   * production n'existait que dans la console de l'utilisateur — c'est-à-dire
   * nulle part.
   *
   * Sans `supervisionUrl`, la méthode ne fait rien : aucun fournisseur n'est
   * imposé, n'importe quel collecteur acceptant du JSON convient.
   *
   * Trois précautions : `keepalive`, pour que l'envoi survive à la fermeture de
   * l'onglet — le moment où l'on perd justement les traces les plus
   * intéressantes ; `void` + `catch`, pour qu'un collecteur en panne ne
   * provoque pas d'erreur non capturée ; et RIEN du message brut en
   * production, pour la raison exposée plus haut.
   */
  private transmettre(incident: Incident): void {
    const url = environment.supervisionUrl;
    if (!url) {
      return;
    }
    const charge = environment.production ? { ...incident, message: undefined } : incident;
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(charge),
      keepalive: true,
    }).catch(() => {
      // Un collecteur injoignable ne doit jamais dégrader l'application : on
      // perd la trace, pas la session de l'utilisateur.
    });
  }
}
