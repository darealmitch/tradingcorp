import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LOT_MAXIMUM, MigrationService } from '../../../core/comptes/migration.service';
import { BilanMigration, EleveAMigrer } from '../../../core/comptes/migration.model';

/** Une ligne de l'export, telle qu'elle a été lue — avant tout filtrage. */
interface LigneLue {
  email: string;
  nom: string;
  etapes: number;
  retenue: boolean;
  motif: string | null;
}

/**
 * Reprise des anciens élèves de la plateforme Wix.
 *
 * On colle ici l'export `participants.csv` du programme, tel que Wix l'envoie
 * par courrier. Il donne, pour chaque inscrit, un COMPTEUR d'étapes achevées —
 * jamais la liste de celles qui l'ont été. La progression est donc reconstituée
 * linéairement : les N premières leçons du parcours. Les deux plateformes
 * comptant 103 éléments et la reprise se faisant à la première leçon non
 * terminée, l'élève retombe là où il s'était arrêté.
 *
 * L'écran impose une simulation avant toute écriture : la migration touche à de
 * vraies personnes, à qui part un e-mail. On regarde d'abord ce qui serait fait.
 */
@Component({
  selector: 'app-migration',
  templateUrl: './migration.html',
  styleUrls: ['../espace-pages.css', './migration.css'],
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Migration {
  private readonly service = inject(MigrationService);

  protected readonly colle = signal('');
  protected readonly inclureSansProgression = signal(false);
  protected readonly chargement = signal(false);
  protected readonly erreur = signal<string | null>(null);
  protected readonly bilans = signal<BilanMigration[] | null>(null);
  protected readonly derniereSimulation = signal(true);

  protected readonly lignes = computed(() => this.analyser(this.colle()));
  protected readonly retenues = computed(() => this.lignes().filter((l) => l.retenue));
  protected readonly ecartees = computed(() => this.lignes().filter((l) => !l.retenue));

  /** Au-delà du plafond, l'envoi groupé serait refusé par le fournisseur. */
  protected readonly tropNombreux = computed(() => this.retenues().length > LOT_MAXIMUM);
  protected readonly plafond = LOT_MAXIMUM;

  /**
   * Lit l'export Wix : point-virgule en séparateur, valeurs entre guillemets.
   * On repère les colonnes par leur nom plutôt que par leur rang — Wix en a
   * déjà changé l'ordre entre deux exports.
   */
  private analyser(texte: string): LigneLue[] {
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
        motif = 'adresse en double dans le fichier';
      } else if (!Number.isInteger(etapes) || etapes < 0) {
        motif = 'compteur d’étapes illisible';
      } else if (etapes === 0 && !this.inclureSansProgression()) {
        motif = 'aucune étape achevée';
      }
      vues.add(email);

      return { email, nom, etapes: Number.isInteger(etapes) ? etapes : 0, retenue: !motif, motif };
    });
  }

  private aMigrer(): EleveAMigrer[] {
    return this.retenues().map((l) => {
      // Wix concatène prénom et nom dans un seul champ, souvent vide.
      const morceaux = l.nom.split(/\s+/).filter(Boolean);
      return {
        email: l.email,
        etapes_terminees: l.etapes,
        prenom: morceaux[0] ?? '',
        nom: morceaux.slice(1).join(' '),
      };
    });
  }

  protected async simuler(): Promise<void> {
    await this.executer({ simulation: true, envoyerInvitation: false });
  }

  protected async migrer(): Promise<void> {
    const nombre = this.retenues().length;
    const message =
      `Migrer ${nombre} élève(s) pour de vrai ?\n\n` +
      'Les comptes seront créés et un e-mail de récupération partira vers ' +
      'chacun. Cette action ne se défait pas d’un clic.';
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
      this.erreur.set(erreur ?? 'La migration a échoué.');
      return;
    }
    this.derniereSimulation.set(resultat.simulation);
    this.bilans.set(resultat.bilans);
  }

  protected libelleCompte(bilan: BilanMigration): string {
    return { cree: 'créé', rattache: 'rattaché', ignore: 'ignoré' }[bilan.compte];
  }

  protected libelleInscription(bilan: BilanMigration): string {
    return { creee: 'créée', deja_presente: 'déjà là', aucune: '—' }[bilan.inscription];
  }

  protected libelleInvitation(bilan: BilanMigration): string {
    return { envoyee: 'envoyée', non_demandee: '—', echec: 'échec' }[bilan.invitation];
  }

  protected readonly enEchec = computed(
    () => (this.bilans() ?? []).filter((b) => b.probleme).length,
  );
}
