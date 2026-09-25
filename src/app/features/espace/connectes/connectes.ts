import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { EleveConnecte } from '../../../core/pilotage/pilotage.model';
import { PilotageService } from '../../../core/pilotage/pilotage.service';
import { SIGNAL_PRESENCE_S } from '../../../core/presence/presence.service';

/** Cadence de rafraîchissement de l'écran, en secondes. */
export const RAFRAICHISSEMENT_S = 30;

/** Ce que l'administration lit d'un élève : présent ou non, et depuis quand. */
export interface LecturePresence {
  enLigne: boolean;
  /** Pour la colonne « Dernier signe » : « à l'instant », « il y a 4 min »… */
  libelle: string;
}

/**
 * Traduit l'ancienneté du dernier signal d'un élève — en secondes, mesurée
 * par le serveur — en ce que l'administration lit à l'écran.
 */
export function lirePresence(inactifDepuisS: number): LecturePresence {
  const enLigne = inactifDepuisS <= 2 * SIGNAL_PRESENCE_S + RAFRAICHISSEMENT_S;
  if (inactifDepuisS < 60) {
    return { enLigne, libelle: 'à l’instant' };
  }
  const minutes = Math.floor(inactifDepuisS / 60);
  if (minutes < 60) {
    return { enLigne, libelle: `il y a ${minutes} min` };
  }
  return { enLigne, libelle: `il y a ${Math.floor(minutes / 60)} h` };
}

/**
 * Élèves connectés : qui suit la formation en ce moment, et qui est passé
 * ces dernières 24 heures.
 *
 * L'écran s'actualise seul. Un élève y entre dès son premier signal et en
 * sort quand ses signaux cessent — onglet fermé ou laissé en arrière-plan.
 */
@Component({
  selector: 'app-connectes',
  templateUrl: './connectes.html',
  styleUrls: ['../espace-pages.css', './connectes.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Connectes {
  private readonly pilotage = inject(PilotageService);

  protected readonly chargement = signal(true);
  protected readonly actualiseLe = signal<Date | null>(null);
  private readonly eleves = signal<EleveConnecte[]>([]);

  private readonly lus = computed(() =>
    this.eleves().map((eleve) => ({ eleve, presence: lirePresence(eleve.inactif_depuis_s) })),
  );
  protected readonly enLigne = computed(() => this.lus().filter((l) => l.presence.enLigne));
  protected readonly recents = computed(() => this.lus().filter((l) => !l.presence.enLigne));

  constructor() {
    void this.charger();
    const minuterie = setInterval(() => void this.charger(), RAFRAICHISSEMENT_S * 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(minuterie));
  }

  private async charger(): Promise<void> {
    this.eleves.set(await this.pilotage.elevesConnectes());
    this.actualiseLe.set(new Date());
    this.chargement.set(false);
  }

  /** Heure seule le jour même ; date et heure pour une visite commencée la veille. */
  protected heure(iso: string): string {
    const date = new Date(iso);
    const memeJour = date.toDateString() === new Date().toDateString();
    return new Intl.DateTimeFormat(
      'fr-FR',
      memeJour ? { timeStyle: 'short' } : { dateStyle: 'short', timeStyle: 'short' },
    ).format(date);
  }

  protected heureActualisation(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', { timeStyle: 'medium' }).format(date);
  }
}
