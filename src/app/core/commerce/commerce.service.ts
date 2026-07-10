import { Injectable, inject } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SUPABASE } from '../supabase/supabase.client';
import { Formation, Inscription } from './formation.model';

const ERREUR_GENERIQUE = 'Le paiement est indisponible pour le moment. Réessaie plus tard.';

@Injectable({ providedIn: 'root' })
export class CommerceService {
  private readonly supabase = inject(SUPABASE);

  /** Formations publiées (policy RLS `formations_select_public`). */
  async chargerFormations(): Promise<Formation[]> {
    const { data } = await this.supabase
      .from('formations')
      .select('id_formation, titre, slug, description, prix_centimes, devise')
      .eq('est_publiee', true)
      .order('prix_centimes');
    return (data as Formation[] | null) ?? [];
  }

  /** Inscriptions actives du profil connecté (RLS : ses lignes uniquement). */
  async chargerInscriptions(): Promise<Inscription[]> {
    const { data } = await this.supabase
      .from('inscriptions')
      .select('id_inscription, id_formation, statut')
      .eq('statut', 'active');
    return (data as Inscription[] | null) ?? [];
  }

  /**
   * Démarre l'achat : l'Edge Function `checkout` crée la session Stripe et
   * renvoie l'URL de sa page de paiement hébergée, vers laquelle on redirige.
   * Retourne un message d'erreur prêt à afficher, ou null si la redirection part.
   */
  async lancerCheckout(idFormation: string): Promise<string | null> {
    const { data, error } = await this.supabase.functions.invoke<{ url?: string }>('checkout', {
      body: { id_formation: idFormation },
    });
    if (error instanceof FunctionsHttpError) {
      // L'Edge Function renvoie ses refus ({ erreur }) déjà rédigés en français.
      const corps = (await error.context.json().catch(() => null)) as { erreur?: string } | null;
      return corps?.erreur ?? ERREUR_GENERIQUE;
    }
    if (error || !data?.url) {
      return ERREUR_GENERIQUE;
    }
    location.assign(data.url);
    return null;
  }
}
