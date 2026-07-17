import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { EtatModule, ModuleParcours } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { Reveal } from '../../../shared/reveal';
import { Icone } from '../../../shared/ui/icone';

const ETAT_LABEL: Record<EtatModule, string> = {
  verrouille: 'Verrouillé',
  debloque: 'À découvrir',
  en_cours: 'En cours',
  termine: 'Terminé',
};

const ETAT_ACTION: Record<EtatModule, string> = {
  verrouille: 'Termine le module précédent',
  debloque: 'Commencer le module',
  en_cours: 'Reprendre le module',
  termine: 'Revoir le module',
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
  imports: [RouterLink, Reveal, Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ModuleIntro {
  private readonly contenu = inject(ContenuService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly chargement = signal(true);
  protected readonly module = signal<ModuleParcours | null>(null);
  protected readonly annonce = signal<string | null>(null);
  protected readonly ouverture = signal(false);

  constructor() {
    void this.charger(this.route.snapshot.paramMap.get('id'));
  }

  private async charger(id: string | null): Promise<void> {
    if (id) {
      this.module.set(await this.contenu.chargerModule(id));
    }
    this.chargement.set(false);
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

  protected action(m: ModuleParcours): string {
    return m.total_lecons === 0 ? 'Contenu en préparation' : ETAT_ACTION[m.etat];
  }

  /** Rien à ouvrir tant que le module n'a pas d'étape publiée. */
  protected actionDesactivee(m: ModuleParcours): boolean {
    return m.etat === 'verrouille' || m.total_lecons === 0;
  }

  protected pourcent(m: ModuleParcours): number {
    return m.total_lecons > 0 ? Math.round((m.lecons_terminees / m.total_lecons) * 100) : 0;
  }

  /** Ouvre la première étape vidéo du module (jamais celles verrouillées). */
  protected async demarrer(m: ModuleParcours): Promise<void> {
    this.ouverture.set(true);
    const etapes = await this.contenu.etatsLecons(m.id_section);
    const premiere = etapes[0];
    if (premiere) {
      await this.router.navigate(['/espace/parcours', m.id_section, 'lecon', premiere.id_lecon]);
    } else {
      this.annonce.set(`« ${m.titre} » — le contenu de ce module est en préparation.`);
    }
    this.ouverture.set(false);
  }
}
