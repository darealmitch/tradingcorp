import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommerceService } from '../../../core/commerce/commerce.service';
import { Formation } from '../../../core/commerce/formation.model';
import { lignesInclus } from '../../../core/commerce/vitrine.textes';
import { VitrineService } from '../../../core/commerce/vitrine.service';
import { Certificat, ModuleParcours } from '../../../core/contenu/apprentissage.model';
import { ContenuService } from '../../../core/contenu/contenu.service';
import { Icone } from '../../../shared/ui/icone';
import { Verrou } from '../../../shared/ui/verrou';
import { AvisFormation } from './avis-formation';

@Component({
  selector: 'app-mes-formations',
  templateUrl: './mes-formations.html',
  styleUrls: ['../espace-pages.css', './mes-formations.css'],
  imports: [Icone, Verrou, AvisFormation, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MesFormations {
  private readonly commerce = inject(CommerceService);
  private readonly contenu = inject(ContenuService);
  private readonly router = inject(Router);
  private readonly vitrine = inject(VitrineService);

  protected readonly chargement = signal(true);
  protected readonly formations = signal<Formation[]>([]);
  protected readonly inscrites = signal<ReadonlySet<string>>(new Set());
  protected readonly achatEnCours = signal<string | null>(null);
  protected readonly erreurAchat = signal<string | null>(null);

  /** Modules du parcours (états serveur) — accès direct aux chapitres. */
  protected readonly modules = signal<ModuleParcours[]>([]);

  /** Certificats obtenus — l'aboutissement du parcours, mis en tête de page. */
  protected readonly certificats = signal<Certificat[]>([]);

  /**
   * Ce que l'achat comprend, au moment de décider : la même liste que la page
   * de vente, lue en base. L'écran n'affichait jusqu'ici que le titre, la
   * description de la formation et le bouton — 997 € sans un mot du contenu.
   */
  protected readonly inclus = computed(() => {
    const v = this.vitrine.vitrine();
    return v ? lignesInclus(v) : [];
  });

  /** La formation en vitrine est-elle celle de cette carte ? Ses chiffres ne valent que pour elle. */
  protected decrite(formation: Formation): boolean {
    return this.vitrine.vitrine()?.id_formation === formation.id_formation;
  }

  constructor() {
    void this.charger();
  }

  private async charger(): Promise<void> {
    const [formations, inscriptions, parcours, certificats] = await Promise.all([
      this.commerce.chargerFormations(),
      this.commerce.chargerInscriptions(),
      this.contenu.chargerParcours(),
      this.contenu.mesCertificats(),
      this.vitrine.charger(),
    ]);
    this.formations.set(formations);
    this.inscrites.set(new Set(inscriptions.map((i) => i.id_formation)));
    this.modules.set(parcours?.inscrit ? parcours.modules : []);
    this.certificats.set(certificats);
    this.chargement.set(false);
  }

  /** Certificat en cours de préparation — le PDF se compose côté serveur. */
  protected readonly certificatEnCours = signal<string | null>(null);
  protected readonly erreurCertificat = signal<string | null>(null);

  /**
   * Ouvre le certificat PDF du titulaire dans un nouvel onglet.
   *
   * L'ouverture se fait sur une URL signée que le serveur vient de produire ;
   * elle expire, donc on ne la mémorise pas — chaque consultation en redemande
   * une, et le PDF lui-même n'est composé qu'une fois.
   */
  protected async ouvrirCertificat(certificat: Certificat): Promise<void> {
    this.erreurCertificat.set(null);
    this.certificatEnCours.set(certificat.id_certificat);

    const { url, erreur } = await this.contenu.lienCertificat(certificat.id_formation);

    this.certificatEnCours.set(null);
    if (erreur || !url) {
      this.erreurCertificat.set(erreur ?? 'Le certificat est indisponible.');
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  /** Date d'obtention en toutes lettres — un certificat se date, pas s'horodate. */
  protected dateObtention(certificat: Certificat): string {
    return new Date(certificat.date_obtention).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected async acheter(formation: Formation): Promise<void> {
    this.erreurAchat.set(null);
    this.achatEnCours.set(formation.id_formation);
    const erreur = await this.commerce.lancerCheckout(formation.id_formation);
    if (erreur) {
      this.erreurAchat.set(erreur);
      this.achatEnCours.set(null);
    }
    // Sinon on laisse le bouton désactivé : la page part vers Stripe.
  }

  protected prix(formation: Formation): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: formation.devise.toUpperCase(),
      minimumFractionDigits: 0,
    }).format(formation.prix_centimes / 100);
  }

  /** Ouvre l'introduction d'un module — jamais un module verrouillé. */
  protected async ouvrirModule(m: ModuleParcours): Promise<void> {
    if (m.etat === 'verrouille') {
      return;
    }
    await this.router.navigate(['/parcours', m.id_section]);
  }

  protected numero(m: ModuleParcours): string {
    return String(m.position).padStart(2, '0');
  }
}
