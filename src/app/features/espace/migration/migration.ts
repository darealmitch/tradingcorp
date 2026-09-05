import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LOT_MAXIMUM, MigrationService } from '../../../core/comptes/migration.service';
import { BilanMigration, EleveAMigrer } from '../../../core/comptes/migration.model';

/** Un ancien élève lu dans l'export, avant toute décision. */
interface EleveLu {
  email: string;
  nom: string;
  etapes: number;
  /** Motif d'exclusion automatique ; `null` si la ligne est exploitable. */
  motif: string | null;
}

/** Nombre d'étapes du programme Wix, égal au nombre de leçons TradingCorp. */
const ETAPES_PROGRAMME = 103;

/**
 * Reprise des anciens élèves de la plateforme Wix.
 *
 * On dépose ici le fichier que Wix envoie par courrier — `participants.csv`.
 * Il donne, pour chaque inscrit, un COMPTEUR d'étapes achevées, jamais la liste
 * de celles qui l'ont été. La progression est donc reconstituée linéairement :
 * les N premières leçons du parcours. Les deux plateformes comptant 103
 * éléments et la reprise se faisant à la première leçon non terminée, l'élève
 * retombe là où il s'était arrêté.
 *
 * L'écran impose de regarder avant d'agir : la migration touche à de vraies
 * personnes, à qui part un e-mail.
 */
@Component({
  selector: 'app-migration',
  templateUrl: './migration.html',
  styleUrls: ['../espace-pages.css', './migration.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Migration {
  private readonly service = inject(MigrationService);

  protected readonly nomFichier = signal<string | null>(null);
  protected readonly lus = signal<EleveLu[]>([]);
  protected readonly lectureImpossible = signal(false);
  protected readonly survol = signal(false);

  /** Adresses cochées. Les élèves sans progression ne le sont pas d'office. */
  private readonly choisis = signal<ReadonlySet<string>>(new Set());

  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly bilans = signal<BilanMigration[] | null>(null);
  protected readonly derniereVerification = signal(true);

  protected readonly exploitables = computed(() => this.lus().filter((e) => !e.motif));
  protected readonly ecartes = computed(() => this.lus().filter((e) => e.motif));
  protected readonly avecProgression = computed(() =>
    this.exploitables().filter((e) => e.etapes > 0),
  );
  protected readonly selection = computed(() =>
    this.exploitables().filter((e) => this.choisis().has(e.email)),
  );
  protected readonly tropNombreux = computed(() => this.selection().length > LOT_MAXIMUM);
  protected readonly plafond = LOT_MAXIMUM;
  protected readonly etapesProgramme = ETAPES_PROGRAMME;

  protected estChoisi(email: string): boolean {
    return this.choisis().has(email);
  }

  protected basculer(email: string): void {
    const suivant = new Set(this.choisis());
    if (!suivant.delete(email)) {
      suivant.add(email);
    }
    this.choisis.set(suivant);
  }

  protected toutChoisir(): void {
    this.choisis.set(new Set(this.exploitables().map((e) => e.email)));
  }

  protected neRienChoisir(): void {
    this.choisis.set(new Set());
  }

  /** Ne garde que ceux qui ont réellement suivi des leçons — le cas courant. */
  protected choisirCeuxQuiOntAvance(): void {
    this.choisis.set(new Set(this.avecProgression().map((e) => e.email)));
  }

  protected surDepot(evenement: DragEvent): void {
    evenement.preventDefault();
    this.survol.set(false);
    const fichier = evenement.dataTransfer?.files?.[0];
    if (fichier) {
      void this.lireFichier(fichier);
    }
  }

  protected surSurvol(evenement: DragEvent, dessus: boolean): void {
    evenement.preventDefault();
    this.survol.set(dessus);
  }

  protected surChoixFichier(evenement: Event): void {
    const fichier = (evenement.target as HTMLInputElement).files?.[0];
    if (fichier) {
      void this.lireFichier(fichier);
    }
  }

  private async lireFichier(fichier: File): Promise<void> {
    this.nomFichier.set(fichier.name);
    this.erreur.set(null);
    this.bilans.set(null);

    const texte = await fichier.text();
    const lus = this.analyser(texte);
    this.lus.set(lus);
    this.lectureImpossible.set(lus.length === 0);
    // Sélection de départ : ceux qui ont réellement suivi des leçons. Les
    // autres se sont inscrits sans jamais rien ouvrir — à l'éditeur d'en juger.
    this.choisis.set(new Set(lus.filter((e) => !e.motif && e.etapes > 0).map((e) => e.email)));
  }

  /**
   * Lit l'export Wix : point-virgule en séparateur, valeurs entre guillemets.
   * Les colonnes sont repérées par leur nom et non par leur rang — Wix en a
   * déjà changé l'ordre entre deux exports.
   */
  private analyser(texte: string): EleveLu[] {
    const lignes = texte
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lignes.length < 2) {
      return [];
    }

    const decouper = (ligne: string): string[] =>
      ligne.split(';').map((c) => c.trim().replace(/^"|"$/g, ''));

    const entetes = decouper(lignes[0]).map((e) => e.toLowerCase());
    const iEmail = entetes.indexOf('email');
    const iNom = entetes.indexOf('name');
    const iEtapes = entetes.indexOf('nstepscompleted');
    if (iEmail === -1 || iEtapes === -1) {
      return [];
    }

    const vues = new Set<string>();
    return lignes.slice(1).map((brut) => {
      const cellules = decouper(brut);
      // Wix mélange les majuscules d'un export à l'autre : sans normalisation,
      // le même élève reviendrait sous deux comptes.
      const email = (cellules[iEmail] ?? '').toLowerCase();
      const nom = iNom === -1 ? '' : (cellules[iNom] ?? '');
      const etapes = Number.parseInt(cellules[iEtapes] ?? '', 10);

      let motif: string | null = null;
      if (!email.includes('@')) {
        motif = 'adresse illisible';
      } else if (vues.has(email)) {
        motif = 'la même adresse apparaît deux fois';
      } else if (!Number.isInteger(etapes) || etapes < 0) {
        motif = 'avancement illisible';
      }
      vues.add(email);

      return { email, nom, etapes: Number.isInteger(etapes) ? etapes : 0, motif };
    });
  }

  private aMigrer(): EleveAMigrer[] {
    return this.selection().map((e) => {
      // Wix range prénom et nom dans un seul champ, souvent vide.
      const morceaux = e.nom.split(/\s+/).filter(Boolean);
      return {
        email: e.email,
        etapes_terminees: e.etapes,
        prenom: morceaux[0] ?? '',
        nom: morceaux.slice(1).join(' '),
      };
    });
  }

  protected async verifier(): Promise<void> {
    await this.executer({ simulation: true, envoyerInvitation: false });
  }

  protected async migrer(): Promise<void> {
    const nombre = this.selection().length;
    const message =
      `Reprendre ${nombre} ancien(s) élève(s) ?\n\n` +
      'Leur compte sera créé et un e-mail partira vers chacun pour qu’il ' +
      'choisisse son mot de passe. Cette action ne se défait pas d’un clic.';
    if (!confirm(message)) {
      return;
    }
    await this.executer({ simulation: false, envoyerInvitation: true });
  }

  private async executer(options: {
    simulation: boolean;
    envoyerInvitation: boolean;
  }): Promise<void> {
    const eleves = this.aMigrer();
    if (eleves.length === 0 || this.tropNombreux()) {
      return;
    }
    this.chargement.set(true);
    this.erreur.set(null);
    this.bilans.set(null);

    const { resultat, erreur } = await this.service.executer(eleves, options);
    this.chargement.set(false);

    if (erreur || !resultat) {
      this.erreur.set(erreur ?? 'La reprise a échoué.');
      return;
    }
    this.derniereVerification.set(resultat.simulation);
    this.bilans.set(resultat.bilans);
  }

  /** Ce que l'élève retrouvera, dit en français plutôt qu'en codes. */
  protected resume(bilan: BilanMigration): string {
    if (bilan.probleme) {
      return bilan.probleme;
    }
    const compte = bilan.compte === 'rattache' ? 'Compte existant retrouvé' : 'Compte créé';
    const progression =
      bilan.lecons_marquees === 0
        ? 'formation à commencer'
        : `${bilan.lecons_marquees} leçons retrouvées (${bilan.pourcentage} %), reprise à « ${bilan.reprise_a} »`;
    const courrier =
      bilan.invitation === 'envoyee'
        ? ' — e-mail envoyé'
        : bilan.invitation === 'echec'
          ? ' — e-mail NON envoyé'
          : '';
    return `${compte}, ${progression}${courrier}`;
  }

  protected readonly enEchec = computed(
    () => (this.bilans() ?? []).filter((b) => b.probleme).length,
  );

  protected pourcentage(etapes: number): number {
    return Math.round((100 * etapes) / ETAPES_PROGRAMME);
  }

  /** Nom affichable : Wix laisse souvent le champ vide. */
  protected intitule(eleve: EleveLu): string {
    return eleve.nom.trim() || eleve.email;
  }
}
