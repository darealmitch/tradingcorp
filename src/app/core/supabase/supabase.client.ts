import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/**
 * Client Supabase unique, fourni par l'injection de dépendances Angular
 * (testable, remplaçable), plutôt qu'un singleton module-level.
 *
 * flowType 'pkce' : le retour OAuth (Google) revient avec un `?code=` échangé
 * automatiquement grâce à detectSessionInUrl — géré sur /auth/callback.
 */
export const SUPABASE = new InjectionToken<SupabaseClient>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }),
});
