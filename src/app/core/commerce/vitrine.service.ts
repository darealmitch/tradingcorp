import { Injectable, computed, inject, signal } from '@angular/core';
import { AccesDonnees } from '../supabase/acces-donnees';
import { Vitrine, prixAffiche } from './vitrine.model';

/**
 * La formation telle que les pages de vente la présentent : prix, chiffres du
 * programme, leçons offertes.
 *
 * Tout vient de la base (`vitrine_formation`), rien n'est recopié dans le
 * code : un chiffre écrit en dur finit par diverger de la formation, et c'est
 * la page de vente qui a tort. L'accueil, la page Programme, l'inscription et
 * l'écran d'achat lisent la même vitrine, chargée une fois par visite.
 *
 * En cas d'échec de lecture, `vitrine()` reste nulle et chaque page retombe
 * sur ses textes sans chiffres : on préfère ne rien annoncer qu'annoncer faux.
 */
@Injectable({ providedIn: 'root' })
export class VitrineService {
  private readonly acces = inject(AccesDonnees);

  private chargement: Promise<Vitrine | null> | null = null;
  private readonly vitrineSig = signal<Vitrine | null>(null);
  private readonly chargeeSig = signal(false);

  /** La formation en vitrine, ou null tant qu'elle n'est pas lue (ou en échec). */
  readonly vitrine = this.vitrineSig.asReadonly();

  /** La lecture est terminée, réussie ou non. */
  readonly chargee = this.chargeeSig.asReadonly();

  /** « 997 € », ou null sans vitrine. */
  readonly prix = computed(() => {
    const v = this.vitrineSig();
    return v ? prixAffiche(v.prix_centimes, v.devise) : null;
  });

  /** Nombre de leçons offertes aux comptes sans achat ; 0 sans vitrine. */
  readonly nombreOffertes = computed(() => this.vitrineSig()?.lecons_offertes.length ?? 0);

  /**
   * Lit la vitrine au premier appel ; les suivants reçoivent la même promesse.
   * Une seule requête par visite, quel que soit le nombre de sections qui
   * l'affichent.
   */
  charger(): Promise<Vitrine | null> {
    this.chargement ??= this.lire();
    return this.chargement;
  }

  private async lire(): Promise<Vitrine | null> {
    const [premiere] = await this.acces.lire<Vitrine[]>(
      'lecture de la vitrine',
      this.acces.appel('vitrine_formation'),
      [],
    );
    this.vitrineSig.set(premiere ?? null);
    this.chargeeSig.set(true);
    return premiere ?? null;
  }
}
