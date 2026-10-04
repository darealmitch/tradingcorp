import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FicheApprenant, LeconSuivie } from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import { BarreProgression } from '../../../shared/ui/barre-progression';
import { Icone } from '../../../shared/ui/icone';
import { StatCard } from '../../../shared/ui/stat-card';
import { EtatLecon, EtatModule, LeconLue, lireParcours } from './lecture-parcours';

const LIBELLES_ETAT_MODULE: Record<EtatModule, string> = {
  termine: 'Terminé',
  en_cours: 'En cours',
  a_venir: 'À venir',
};

const LIBELLES_TYPE: Record<LeconSuivie['type_lecon'], string> = {
  video: 'Vidéo',
  article: 'Article',
  quiz: 'Quiz',
};

/**
 * Parcours d'un élève, vu par l'équipe : où il en est, ce qu'il a fait, ce
 * qu'il lui reste, et ce qui pourrait le retenir.
 *
 * La page n'invente aucun chiffre. Les états des leçons viennent de
 * `parcours_apprenant` (règles de l'élève), le regroupement de
 * `lireParcours` ; le pourcentage s'arrondit comme dans la liste, pour que les
 * deux écrans affichent le même nombre.
 */
@Component({
  selector: 'app-parcours-apprenant',
  templateUrl: './parcours-apprenant.html',
  styleUrls: ['../espace-pages.css', './parcours-apprenant.css'],
  imports: [RouterLink, BarreProgression, Icone, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ParcoursApprenant {
  private readonly pilotage = inject(PilotageService);
  private readonly idProfil = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly chargement = signal(true);
  protected readonly fiche = signal<FicheApprenant | null>(null);
  private readonly lignes = signal<LeconSuivie[]>([]);

  protected readonly lecture = computed(() => lireParcours(this.lignes()));

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [fiche, lignes] = await Promise.all([
      this.pilotage.ficheApprenant(this.idProfil),
      this.pilotage.parcoursApprenant(this.idProfil),
    ]);
    this.fiche.set(fiche);
    this.lignes.set(lignes);
    this.chargement.set(false);
  }

  protected libelleModule(etat: EtatModule): string {
    return LIBELLES_ETAT_MODULE[etat];
  }

  protected libelleType(lecon: LeconLue): string {
    return LIBELLES_TYPE[lecon.type_lecon] ?? lecon.type_lecon;
  }

  protected icone(etat: EtatLecon): string {
    return etat === 'terminee' ? 'coche' : etat === 'entamee' ? 'lecture' : 'horloge';
  }

  /** « 2 tentatives, meilleur score 60 % (70 % requis) » — null hors quiz ou sans tentative. */
  protected detailQuiz(lecon: LeconLue): string | null {
    if (lecon.type_lecon !== 'quiz' || lecon.nombre_tentatives === 0) {
      return null;
    }
    const tentatives = `${lecon.nombre_tentatives} tentative${lecon.nombre_tentatives > 1 ? 's' : ''}`;
    const meilleur = lecon.meilleur_score ?? 0;
    const requis = lecon.score_requis !== null ? ` (${lecon.score_requis} % requis)` : '';
    return `${tentatives}, meilleur score ${meilleur} %${requis}`;
  }

  protected date(iso: string | null): string {
    return iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(iso)) : '';
  }

  protected pluriel(nombre: number, mot: string): string {
    return `${nombre} ${mot}${nombre > 1 ? 's' : ''}`;
  }

  /** « 1 leçon validée sur 103 », « 29 leçons validées sur 103 ». */
  protected validees(nombre: number, total: number): string {
    const s = nombre > 1 ? 's' : '';
    return `${nombre} leçon${s} validée${s} sur ${total}`;
  }
}
