import { InjectionToken } from '@angular/core';
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { Database } from './database.types';

/**
 * Client Supabase unique, fourni par l'injection de dépendances Angular
 * (testable, remplaçable), plutôt qu'un singleton module-level.
 *
 * flowType 'pkce' : le retour OAuth (Google) revient avec un `?code=` échangé
 * automatiquement grâce à detectSessionInUrl — géré sur /auth/callback.
 *
 * Le client porte le type du schéma (`database.types.ts`, généré) : un nom de
 * table inexistant ou une colonne mal orthographiée deviennent des erreurs de
 * compilation, là où le client non typé les laissait passer jusqu'à
 * l'exécution (audit P-11).
 */
export const SUPABASE = new InjectionToken<SupabaseClient<Database>>('SUPABASE', {
  providedIn: 'root',
  factory: () =>
    createClient<Database>(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    }),
});
