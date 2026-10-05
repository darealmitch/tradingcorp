import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GOOGLE_OAUTH_ACTIF } from '../../../core/auth/auth.service';
import {
  DERNIERE_MISE_A_JOUR,
  DOCUMENTS_LEGAUX,
  DocumentLegal,
  LONGUEUR_MAX_RESUME,
  ModeAnnonce,
  ResultatAnnonce,
} from '../../../core/conditions/conditions.model';
import { ConditionsService } from '../../../core/conditions/conditions.service';
import { DomaineExpediteur, EssaiFacturation } from '../../../core/finance/finance.model';
import { FinanceService } from '../../../core/finance/finance.service';

/** « 1 compte », « 3 comptes ». */
function nombre(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n} ${n > 1 ? pluriel : singulier}`;
}

/**
 * Réglages de la plateforme, et les envois que l'administrateur déclenche.
 *
 * La page n'affiche que ce dont l'application connaît l'état par elle-même.
 * Elle annonçait auparavant des réglages d'infrastructure qu'elle ne lit nulle
 * part — « inscriptions ouvertes », « confirmation d'e-mail désactivée (dev) »
 * — écrits en dur : ils seraient restés identiques quoi qu'on change côté
 * Supabase, et l'un d'eux affichait une mention de développement à
 * l'administrateur. Un réglage affiché sans être lu vaut moins que pas de
 * réglage du tout : il donne à croire qu'on l'a vérifié.
 *
 * Les gestes de la page suivent la même règle : l'essai de facturation et
 * l'annonce d'une mise à jour des conditions ne déclarent rien, ils passent par
 * la chaîne réelle et rapportent ce qu'elle répond.
 */
@Component({
  selector: 'app-parametres',
  templateUrl: './parametres.html',
  styleUrls: ['../espace-pages.css', './parametres.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Parametres {
  private readonly finance = inject(FinanceService);
  private readonly conditions = inject(ConditionsService);

  /** Source unique : la constante qui commande l'affichage du bouton Google. */
  protected readonly googleActif = GOOGLE_OAUTH_ACTIF;

  /** Vide = l'adresse du compte connecté, que seule la fonction connaît. */
  protected readonly destinataire = signal('');
  protected readonly envoiEnCours = signal(false);
  protected readonly essai = signal<EssaiFacturation | null>(null);
  protected readonly erreurEssai = signal<string | null>(null);

  protected readonly lectureDns = signal(false);
  protected readonly domaines = signal<DomaineExpediteur[] | null>(null);
  protected readonly erreurDns = signal<string | null>(null);

  // Annonce d'une mise à jour des conditions (article 14 des CGU), pré-remplie
  // avec la dernière mise à jour écrite dans le dépôt.
  protected readonly documentsLegaux = DOCUMENTS_LEGAUX;
  protected readonly longueurMaxResume = LONGUEUR_MAX_RESUME;
  protected readonly annonceDate = signal(DERNIERE_MISE_A_JOUR.date);
  protected readonly annonceDocuments = signal<DocumentLegal[]>([
    ...DERNIERE_MISE_A_JOUR.documents,
  ]);
  protected readonly annonceResume = signal(DERNIERE_MISE_A_JOUR.resume);
  protected readonly annonceEnCours = signal(false);
  /** Deuxième temps de l'envoi à tous : il ne part qu'après confirmation. */
  protected readonly confirmationAnnonce = signal(false);
  protected readonly annonceResultat = signal<ResultatAnnonce | null>(null);
  protected readonly annonceErreur = signal<string | null>(null);
  protected readonly annoncePrete = computed(
    () =>
      /^\d{4}-\d{2}-\d{2}$/.test(this.annonceDate()) &&
      this.annonceDocuments().length > 0 &&
      this.annonceResume().trim().length > 0,
  );

  /**
   * Demande à Brevo ce qu'il attend dans la zone DNS du domaine.
   *
   * Sans authentification du domaine, les messages partent tout de même mais
   * échouent au contrôle DMARC : ils arrivent, jusqu'au jour où le volume
   * augmente et où un fournisseur strict cesse de les laisser passer.
   */
  protected async lireEnregistrementsDns(): Promise<void> {
    this.lectureDns.set(true);
    this.domaines.set(null);
    this.erreurDns.set(null);

    const { domaines, erreur } = await this.finance.enregistrementsExpediteur();

    this.lectureDns.set(false);
    if (erreur || !domaines) {
      this.erreurDns.set(erreur ?? 'Aucun domaine expéditeur n’est déclaré chez Brevo.');
      return;
    }
    this.domaines.set(domaines);
  }

  /** « 2 septembre 2026 », ou rien si Brevo ne donne pas la date. */
  protected depuis(domaine: DomaineExpediteur): string | null {
    if (!domaine.authentifieLe) {
      return null;
    }
    return new Date(domaine.authentifieLe).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected saisirDestinataire(evenement: Event): void {
    this.destinataire.set((evenement.target as HTMLInputElement).value);
  }

  /**
   * Envoie une confirmation de commande d'essai, de bout en bout, sans vente.
   *
   * Éprouve ce qui ne se relit pas dans le code : le gabarit, la clé Brevo,
   * l'expéditeur vérifié, la remise. La facture, elle, est émise par Stripe et
   * s'éprouve par un achat en mode test.
   *
   * Le destinataire est libre pour pouvoir vérifier ce qu'un client reçoit
   * réellement, chez lui : une remise dépend autant du fournisseur qui la
   * reçoit (Gmail, iCloud, Outlook) que de celui qui l'émet.
   */
  protected async essayerFacturation(): Promise<void> {
    this.envoiEnCours.set(true);
    this.essai.set(null);
    this.erreurEssai.set(null);

    const { resultat, erreur } = await this.finance.envoyerFactureEssai(this.destinataire());

    this.envoiEnCours.set(false);
    if (erreur || !resultat?.envoye) {
      this.erreurEssai.set(erreur ?? 'L’essai n’est pas parti.');
      return;
    }
    this.essai.set(resultat);
  }

  protected saisirDateAnnonce(evenement: Event): void {
    this.annonceDate.set((evenement.target as HTMLInputElement).value);
    this.confirmationAnnonce.set(false);
  }

  protected basculerDocument(document: DocumentLegal): void {
    const choisis = this.annonceDocuments();
    this.annonceDocuments.set(
      choisis.includes(document) ? choisis.filter((d) => d !== document) : [...choisis, document],
    );
    this.confirmationAnnonce.set(false);
  }

  protected saisirResumeAnnonce(evenement: Event): void {
    this.annonceResume.set((evenement.target as HTMLTextAreaElement).value);
    this.confirmationAnnonce.set(false);
  }

  /** L'essai part aux seuls comptes de test, avec un bandeau d'essai : à faire passer d'abord. */
  protected async envoyerEssaiAnnonce(): Promise<void> {
    this.confirmationAnnonce.set(false);
    await this.annoncer('essai');
  }

  /** L'envoi à tous ne part qu'au second clic : il touche chaque compte, sans retour possible. */
  protected demanderEnvoiAnnonce(): void {
    this.annonceResultat.set(null);
    this.annonceErreur.set(null);
    this.confirmationAnnonce.set(true);
  }

  protected annulerEnvoiAnnonce(): void {
    this.confirmationAnnonce.set(false);
  }

  protected async confirmerEnvoiAnnonce(): Promise<void> {
    await this.annoncer('envoi');
    this.confirmationAnnonce.set(false);
  }

  private async annoncer(mode: ModeAnnonce): Promise<void> {
    if (!this.annoncePrete() || this.annonceEnCours()) {
      return;
    }
    this.annonceEnCours.set(true);
    this.annonceResultat.set(null);
    this.annonceErreur.set(null);

    const { resultat, erreur } = await this.conditions.annoncer(mode, {
      date: this.annonceDate(),
      documents: this.annonceDocuments(),
      resume: this.annonceResume(),
    });

    this.annonceEnCours.set(false);
    if (erreur || !resultat) {
      this.annonceErreur.set(erreur ?? 'L’annonce n’a pas pu partir.');
      return;
    }
    this.annonceResultat.set(resultat);
  }

  /** Ce que l'envoi a réellement fait, chiffres à l'appui. */
  protected bilanAnnonce(r: ResultatAnnonce): string {
    if (r.deja_informes) {
      return 'Tous les comptes avaient déjà été prévenus de cette version : rien n’est reparti.';
    }
    const destinataires =
      r.mode === 'essai'
        ? nombre(r.notifies, 'compte de test', 'comptes de test')
        : nombre(r.notifies, 'compte');
    const refus =
      r.courriels_echoues > 0
        ? ` ${nombre(r.courriels_echoues, 'e-mail refusé', 'e-mails refusés')} par Brevo : ces comptes ont tout de même la notification dans leur espace.`
        : '';
    const envoi = r.mode === 'essai' ? 'Essai envoyé' : 'Annonce envoyée';
    const partis = nombre(r.courriels_envoyes, 'e-mail parti', 'e-mails partis');
    return `${envoi} à ${destinataires} : notification posée, ${partis}.${refus}`;
  }
}
