import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase.client';
import { Profil } from './profil.model';

/**
 * Provider Google non configuré côté dashboard Supabase (OAuth client GCP en
 * attente). Passer à true une fois le provider activé (Authentication →
 * Providers → Google) pour réafficher le bouton sur connexion/inscription.
 */
export const GOOGLE_OAUTH_ACTIF = false;

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

  /** Le trigger SQL handle_new_user lit prenom/nom dans les métadonnées. */
  async inscription(
    email: string,
    mdp: string,
    prenom: string,
    nom: string,
  ): Promise<ResultatAuth> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password: mdp,
      options: { data: { prenom, nom } },
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

  /** Redirige vers Google puis revient sur /auth/callback (flux PKCE). */
  async connexionGoogle(): Promise<ResultatAuth> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    return error ? { ok: false, erreur: this.messageErreur(error) } : { ok: true };
  }

  async deconnexion(): Promise<void> {
    await this.supabase.auth.signOut();
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
    if (brut.includes('password should be')) {
      return 'Le mot de passe doit contenir au moins 8 caractères.';
    }
    if (brut.includes('rate limit') || brut.includes('too many')) {
      return 'Trop de tentatives. Réessaie dans quelques minutes.';
    }
    return 'Une erreur est survenue. Réessaie.';
  }
}
