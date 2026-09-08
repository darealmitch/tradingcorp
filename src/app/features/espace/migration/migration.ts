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

  /** Identités corrigées à la main, par adresse. */
  private readonly identites = signal<ReadonlyMap<string, string>>(new Map());

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

  protected identite(email: string): string {
    return this.identites().get(email) ?? '';
  }

  protected corrigerIdentite(email: string, valeur: string): void {
    const suivant = new Map(this.identites());
    suivant.set(email, valeur);
    this.identites.set(suivant);
  }

  /**
   * Wix range dans son champ `name` ce que la personne a bien voulu y mettre :
   * parfois un nom, souvent l'identifiant tiré de l'adresse — « nathan.assimba ».
   * Importé tel quel, il donne des apprenants nommés comme des comptes
   * techniques. On ne retient donc que ce qui ressemble à une identité, et on
   * laisse le champ vide — mais modifiable — pour le reste.
   */
  private identiteProbable(nom: string, email: string): string {
    const brut = nom.trim();
    if (!brut) {
      return '';
    }
    const local = (email.split('@')[0] ?? '').toLowerCase();
    const identifiant =
      !brut.includes(' ') &&
      (brut.includes('.') || /\d/.test(brut) || brut.toLowerCase() === local);
    if (identifiant) {
      return '';
    }
    // « senku » → « Senku » : Wix ne capitalise rien.
    return brut
      .split(/\s+/)
      .map((mot) => mot.charAt(0).toUpperCase() + mot.slice(1))
      .join(' ');
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
    this.identites.set(
      new Map(lus.map((e) => [e.email, this.identiteProbable(e.nom, e.email)] as const)),
    );
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
      // Un seul champ côté Wix : le premier mot fait le prénom, le reste le nom.
      const morceaux = this.identite(e.email).trim().split(/\s+/).filter(Boolean);
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

  /**
   * Crée les comptes et la progression SANS prévenir personne.
   *
   * Sépare ce qui est réversible de ce qui ne l'est pas. Créer un compte ne se
   * voit pas de l'extérieur : l'élève n'apprend rien, rien n'arrive dans sa
   * boîte. L'e-mail, lui, part une fois pour toutes et à une heure qui compte —
   * un lien de récupération ne vit qu'une heure, l'envoyer la nuit revient à ne
   * rien envoyer.
   *
   * On prépare donc les comptes quand on veut, et on déclenche les liens à
   * l'heure où les gens les liront.
   */
  protected async creerSansPrevenir(): Promise<void> {
    const nombre = this.selection().length;
    const message =
      `Créer ${nombre} compte(s) sans prévenir personne ?\n\n` +
      'La progression est reprise, mais AUCUN e-mail ne part : les élèves ' +
      'n’apprendront rien tant que les liens ne seront pas déclenchés.';
    if (!confirm(message)) {
      return;
    }
    await this.executer({ simulation: false, envoyerInvitation: false });
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

  /** Ce que Wix proposait, quand ce n'était pas un identifiant. */
  protected suggestionRejetee(eleve: EleveLu): boolean {
    return eleve.nom.trim().length > 0 && this.identiteProbable(eleve.nom, eleve.email) === '';
  }
}
