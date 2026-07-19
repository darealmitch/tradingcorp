import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  EtatLecon,
  EtatModule,
  LeconEtape,
  ModuleParcours,
} from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { Reveal } from '../../../shared/reveal';
import { Icone } from '../../../shared/ui/icone';
import { Verrou } from '../../../shared/ui/verrou';

const ETAT_LABEL: Record<EtatModule, string> = {
  verrouille: 'Verrouillé',
  debloque: 'À découvrir',
  en_cours: 'En cours',
  termine: 'Terminé',
};

const ETAT_LECON_ICONE: Record<EtatLecon, string> = {
  verrouille: 'cadenas',
  debloque: 'lecture',
  en_cours: 'lecture',
  termine: 'coche',
};

/**
 * Introduction d'un module — page GÉNÉRIQUE : titre, accroche, texte et
 * objectifs viennent de la base (table `sections`), jamais du code. Les 8
 * modules partagent donc cette page. L'état (verrouillé/débloqué/…) vient de
 * la RPC serveur : cette page ne débloque rien.
 */
@Component({
  selector: 'app-module-intro',
  templateUrl: './module-intro.html',
  styleUrl: './module-intro.css',
  imports: [RouterLink, Reveal, Icone, Verrou],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleIntro {
  private readonly contenu = inject(ContenuService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly chargement = signal(true);
  protected readonly module = signal<ModuleParcours | null>(null);
  protected readonly modules = signal<ModuleParcours[]>([]);
  protected readonly etapes = signal<LeconEtape[]>([]);
  protected readonly annonce = signal<string | null>(null);
  protected readonly ouverture = signal(false);

  /** Modules voisins dans l'ordre du parcours (navigation inter-modules). */
  protected readonly modulePrecedent = computed(() => this.voisin(-1));
  protected readonly moduleSuivant = computed(() => this.voisin(1));

  /** L'étape d'introduction (ancre de progression) — jamais un chapitre du lecteur. */
  protected readonly intro = computed(() => this.etapes().find((e) => e.type === 'intro') ?? null);
  /** Chapitres jouables du module (hors introduction). */
  protected readonly chapitres = computed(() => this.etapes().filter((e) => e.type !== 'intro'));

  constructor() {
    // Le routeur réutilise ce composant d'un module à l'autre : on recharge à
    // chaque changement de paramètre (navigation précédent/suivant comprise).
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => void this.charger(params.get('id')));
  }

  private async charger(id: string | null): Promise<void> {
    if (id) {
      this.chargement.set(true);
      const [parcours, etapes] = await Promise.all([
        this.contenu.chargerParcours(),
        this.contenu.etatsLecons(id),
      ]);
      this.modules.set(parcours?.modules ?? []);
      this.module.set(parcours?.modules.find((m) => m.id_section === id) ?? null);
      this.etapes.set(etapes);
    }
    this.chargement.set(false);
  }

  private voisin(decalage: -1 | 1): ModuleParcours | null {
    const courant = this.module();
    const liste = this.modules();
    if (!courant) {
      return null;
    }
    const i = liste.findIndex((m) => m.id_section === courant.id_section);
    return i >= 0 ? (liste[i + decalage] ?? null) : null;
  }

  /** Navigue vers un module voisin — jamais un module verrouillé. */
  protected async allerModule(m: ModuleParcours): Promise<void> {
    if (m.etat === 'verrouille') {
      return;
    }
    await this.router.navigate(['/parcours', m.id_section]);
  }

  private readonly typesLabel: Record<LeconEtape['type'], string> = {
    intro: 'Introduction',
    article: 'Article',
    video: 'Vidéo',
    quiz: 'Quiz',
  };

  protected iconeEtape(e: LeconEtape): string {
    return ETAT_LECON_ICONE[e.etat];
  }

  protected typeLabel(e: LeconEtape): string {
    return this.typesLabel[e.type];
  }

  /** Ouvre une étape depuis la liste — jamais une étape verrouillée. */
  protected async ouvrirEtape(m: ModuleParcours, e: LeconEtape): Promise<void> {
    if (e.etat === 'verrouille') {
      this.annonce.set('Termine les étapes précédentes pour y accéder.');
      return;
    }
    await this.router.navigate(['/parcours', m.id_section, 'lecon', e.id_lecon]);
  }

  protected numero(m: ModuleParcours): string {
    return String(m.position).padStart(2, '0');
  }

  /** Paragraphes du texte d'introduction (séparés par une ligne vide en base). */
  protected paragraphes(m: ModuleParcours): string[] {
    return (m.introduction ?? '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
  }

  protected label(m: ModuleParcours): string {
    return ETAT_LABEL[m.etat];
  }

  /** Introduction déjà validée → le module est en cours ou terminé. */
  protected introValidee(): boolean {
    return this.intro()?.etat === 'termine';
  }

  /** Un module verrouillé ne se démarre pas ; sinon « Suivant » est actif. */
  protected actionDesactivee(m: ModuleParcours): boolean {
    return m.etat === 'verrouille';
  }

  protected pourcent(m: ModuleParcours): number {
    return m.total_lecons > 0 ? Math.round((m.lecons_terminees / m.total_lecons) * 100) : 0;
  }

  /**
   * Bouton « Suivant » : valide l'étape d'introduction (progression + déblocage
   * de la 1re leçon, via la logique serveur existante) puis redirige vers cette
   * 1re leçon — sans rechargement. Idempotent si l'intro est déjà validée.
   */
  protected async suivant(m: ModuleParcours): Promise<void> {
    if (m.etat === 'verrouille' || this.ouverture()) {
      return;
    }
    this.ouverture.set(true);

    const intro = this.intro();
    if (intro && intro.etat !== 'termine') {
      await this.contenu.terminerLecon(intro.id_lecon);
    }

    const premiere = this.chapitres()[0];
    if (premiere) {
      await this.router.navigate(['/parcours', m.id_section, 'lecon', premiere.id_lecon]);
    } else {
      // Aucune leçon jouable encore publiée : on reste et on rafraîchit l'état.
      await this.charger(m.id_section);
      this.annonce.set(`« ${m.titre} » — le contenu de ce module est en préparation.`);
    }
    this.ouverture.set(false);
  }
}
