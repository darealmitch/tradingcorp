import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase.client';
import { Profil } from './profil.model';

/**
 * Affiche le bouton « Continuer avec Google » sur connexion et inscription.
 *
 * Ce drapeau ne fait qu'afficher le bouton : la connexion elle-même dépend du
 * provider Google activé dans Supabase (Authentication → Providers → Google,
 * avec l'identifiant et le secret d'un client OAuth Google Cloud). Tant que ce
 * réglage n'est pas fait, le bouton mène à une erreur — le remettre à false
 * est alors préférable à un bouton qui échoue.
 *
 * L'URL de retour à autoriser des deux côtés (Google Cloud et Supabase) est
 * celle que construit `connexionGoogle()` : le chemin du site suivi de
 * `auth/callback`, pas l'origine seule.
 */
export const GOOGLE_OAUTH_ACTIF = true;

/** Résultat homogène des opérations d'authentification. */
export interface ResultatAuth {
  ok: boolean;
  /** Message d'erreur en français, prêt à afficher. */
  erreur?: string;
  /** Inscription réussie mais e-mail à confirmer avant de pouvoir se connecter. */
  confirmationRequise?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE);

  private readonly sessionSig = signal<Session | null>(null);
  private readonly profilSig = signal<Profil | null>(null);
  private readonly pretSig = signal(false);

  /** Session Supabase courante (null = déconnecté). */
  readonly session = this.sessionSig.asReadonly();
  /** Profil applicatif (table `profils`), chargé après connexion. */
  readonly profil = this.profilSig.asReadonly();
  /** Vrai une fois la restauration de session initiale terminée. */
  readonly pret = this.pretSig.asReadonly();

  readonly estConnecte = computed(() => this.sessionSig() !== null);
  readonly role = computed(() => this.profilSig()?.role ?? null);
  /**
   * Compte de démonstration/test (profils.est_test) : mêmes accès élargis que
   * côté serveur (bypass de la progression via acces_demo). Sert à lever les
   * verrous UX de progression pour la recette, jamais pour un compte réel.
   */
  readonly estCompteTest = computed(() => this.profilSig()?.est_test ?? false);
  readonly estFormateurOuAdmin = computed(() => {
    const role = this.role();
    return role === 'formateur' || role === 'admin';
  });

  private resoudrePret!: () => void;
  private readonly pretPromise = new Promise<void>((resolve) => (this.resoudrePret = resolve));

  constructor() {
    void this.initialiser();
  }

  /** À attendre dans les guards : session restaurée (et profil chargé si connecté). */
  attendreInitialisation(): Promise<void> {
    return this.pretPromise;
  }

  private async initialiser(): Promise<void> {
    const { data } = await this.supabase.auth.getSession();
    this.sessionSig.set(data.session);
    if (data.session) {
      await this.chargerProfil(data.session.user.id);
    }
    this.pretSig.set(true);
    this.resoudrePret();

    this.supabase.auth.onAuthStateChange((_evenement, session) => {
      this.sessionSig.set(session);
      // setTimeout : ne jamais await un appel supabase directement dans ce
      // callback (interblocage connu de supabase-js).
      if (session) {
        setTimeout(() => void this.chargerProfil(session.user.id));
      } else {
        this.profilSig.set(null);
      }
    });
  }

  private async chargerProfil(idUtilisateur: string): Promise<void> {
    const { data } = await this.supabase
      .from('profils')
      .select('*')
      .eq('id_profil', idUtilisateur)
      .maybeSingle<Profil>();
    this.profilSig.set(data);
  }

  /** Recharge le profil du compte connecté (après une mise à jour de ses données). */
  async rechargerProfil(): Promise<void> {
    const session = this.sessionSig();
    if (session) {
      await this.chargerProfil(session.user.id);
    }
  }

  /** Garantit que le profil est chargé (utilisé par le guard de rôle). */
  async assurerProfil(): Promise<Profil | null> {
    await this.attendreInitialisation();
    const session = this.sessionSig();
    if (session && !this.profilSig()) {
      await this.chargerProfil(session.user.id);
    }
    return this.profilSig();
  }

  /** Attend l'apparition d'une session (retour OAuth), avec délai maximal. */
  attendreSession(delaiMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const debut = Date.now();
      const verifier = (): void => {
        if (this.sessionSig()) {
          resolve(true);
        } else if (Date.now() - debut > delaiMs) {
          resolve(false);
        } else {
          setTimeout(verifier, 100);
        }
      };
      verifier();
    });
  }

  // ===== Opérations =====

  /**
   * Le trigger SQL handle_new_user lit prenom/nom/date_naissance dans les
   * métadonnées et refuse la création d'un compte de moins de 18 ans. Le
   * contrôle vit côté serveur : il s'applique donc aussi à un appel direct à
   * signUp, pas seulement au formulaire. Un second trigger sur `profils`
   * (trg_profils_majeur) porte le même invariant quel que soit le chemin
   * d'écriture. Couvert par le test « inscription d'un mineur refusée ».
   */
  async inscription(
    email: string,
    mdp: string,
    prenom: string,
    nom: string,
    dateNaissance: string,
  ): Promise<ResultatAuth> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password: mdp,
      options: { data: { prenom, nom, date_naissance: dateNaissance } },
    });
    if (error) {
      return { ok: false, erreur: this.messageErreur(error) };
    }
    if (!data.session) {
      return { ok: true, confirmationRequise: true };
    }
    await this.chargerProfil(data.session.user.id);
    return { ok: true };
  }

  async connexion(email: string, mdp: string): Promise<ResultatAuth> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password: mdp });
    if (error) {
      return { ok: false, erreur: this.messageErreur(error) };
    }
    await this.chargerProfil(data.session.user.id);
    return { ok: true };
  }

  /**
   * Redirige vers Google puis revient sur /auth/callback (flux PKCE).
   *
   * L'URL de retour se construit sur `document.baseURI`, pas sur
   * `location.origin` : en production le site est publié SOUS un chemin
   * (`/tradingcorp/` sur GitHub Pages). `location.origin` produisait
   * `https://darealmitch.github.io/auth/callback` — vérifié, cette adresse
   * renvoie la page 404 de GitHub et non l'application, le repli SPA ne valant
   * que sous le chemin du site. `baseURI` porte déjà ce chemin (il vient de la
   * balise <base href> posée au build), et vaut l'origine seule en
   * développement, où l'application est servie à la racine.
   */
  async connexionGoogle(): Promise<ResultatAuth> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${document.baseURI}auth/callback` },
    });
    return error ? { ok: false, erreur: this.messageErreur(error) } : { ok: true };
  }

  async deconnexion(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  /**
   * Termine l'intégration d'un compte créé par un admin : remplace le mot de
   * passe temporaire, puis recharge le profil.
   *
   * Le blocage (profils.doit_changer_mdp) est levé côté serveur par le trigger
   * on_auth_password_changed, déclenché par le changement lui-même. Il n'y a
   * donc plus rien à confirmer depuis le client : l'ancienne RPC
   * confirmer_changement_mdp levait le blocage sans vérifier quoi que ce soit,
   * et pouvait être appelée seule pour garder le mot de passe temporaire.
   * Le rechargement du profil récupère l'état déjà mis à jour par le trigger.
   */
  async definirNouveauMotDePasse(mdp: string): Promise<ResultatAuth> {
    const { error } = await this.supabase.auth.updateUser({ password: mdp });
    if (error) {
      return { ok: false, erreur: this.messageErreur(error) };
    }
    const session = this.sessionSig();
    if (session) {
      await this.chargerProfil(session.user.id);
    }
    return { ok: true };
  }

  /**
   * Renseigne la date de naissance absente d'un profil, une seule fois.
   *
   * Sert les comptes nés d'une connexion Google : Google ne transmet ni date de
   * naissance ni âge, le profil arrive donc sans elle et le contrôle des 18 ans
   * — qui ne se déclenche que « si la date est connue » — ne s'appliquait pas.
   *
   * L'écriture passe par la RPC `definir_date_naissance` : le client n'a aucun
   * privilège UPDATE sur `profils`, et c'est le serveur qui vérifie la majorité,
   * l'appartenance du profil et le caractère non modifiable de la valeur.
   */
  async definirDateNaissance(date: string): Promise<ResultatAuth> {
    const { error } = await this.supabase.rpc('definir_date_naissance', { p_date: date });
    if (error) {
      return { ok: false, erreur: this.messageErreurRpc(error.message) };
    }
    const session = this.sessionSig();
    if (session) {
      await this.chargerProfil(session.user.id);
    }
    return { ok: true };
  }

  // ===== 2FA (préparation — intégration ultérieure) =====
  // La MFA TOTP est gérée nativement par Supabase Auth. L'enrôlement se fera
  // via supabase.auth.mfa.enroll({ factorType: 'totp' }) puis challenge/verify ;
  // l'obligation pour les admins s'appuiera sur le niveau AAL ci-dessous
  // (aal2 exigé) côté guard et côté policies RLS.

  /** Facteurs MFA enrôlés par l'utilisateur courant. */
  async listerFacteursMfa() {
    return this.supabase.auth.mfa.listFactors();
  }

  /** Niveau d'assurance courant (aal1 = mot de passe seul, aal2 = MFA validée). */
  async niveauAssurance() {
    return this.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  }

  // ===== Erreurs =====

  /**
   * Messages des RPC. Le serveur les rédige déjà en français et à destination
   * de l'apprenant : on les reprend tels quels quand ils sont reconnus, plutôt
   * que de les traduire une seconde fois — deux formulations d'une même règle
   * finissent toujours par diverger. Tout le reste devient générique, pour ne
   * pas exposer un message technique de Postgres.
   */
  private messageErreurRpc(message: string): string {
    const connus = ['18 ans', 'déjà renseignée', 'obligatoire', 'invalide'];
    return connus.some((extrait) => message.includes(extrait))
      ? message
      : 'Une erreur est survenue. Réessaie.';
  }

  private messageErreur(error: AuthError): string {
    const brut = error.message.toLowerCase();
    if (brut.includes('invalid login credentials')) {
      return 'E-mail ou mot de passe incorrect.';
    }
    if (brut.includes('already registered')) {
      return 'Un compte existe déjà avec cet e-mail.';
    }
    if (brut.includes('email not confirmed')) {
      return 'Confirme ton adresse e-mail avant de te connecter (vérifie ta boîte mail).';
    }
    // Avant la règle de longueur : le message « New password should be
    // different from the old password » contient « password should be » et
    // serait sinon traduit par un reproche de longueur, incompréhensible pour
    // qui vient de ressaisir son mot de passe temporaire.
    if (brut.includes('different from the old')) {
      return 'Le nouveau mot de passe doit être différent du mot de passe temporaire.';
    }
    if (brut.includes('password should be')) {
      return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    if (brut.includes('rate limit') || brut.includes('too many')) {
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    }
    if (brut.includes('18 ans') || brut.includes('majeur')) {
      return 'Tu dois avoir au moins 18 ans pour t’inscrire.';
    }
    return 'Une erreur est survenue. Réessaie.';
  }
}
