import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CertificatVerifie } from '../../core/contenu/apprentissage.model';
import { ContenuService } from '../../core/contenu/contenu.service';
import { Icone } from '../../shared/ui/icone';
import { Logo } from '../../shared/ui/logo';

/**
 * Vérification publique d'un certificat.
 *
 * Destinée à un TIERS — employeur, organisme — qui tient une attestation entre
 * les mains et veut savoir si elle est authentique. Aucune session n'est
 * requise : exiger un compte reviendrait à rendre la vérification impossible,
 * donc l'attestation invérifiable.
 *
 * Le numéro peut venir de l'URL (`/verification/TC-2026-XXXXXXXX`), ce qui
 * permet de l'imprimer sur le certificat ou de l'encoder dans un QR code : le
 * vérificateur n'a alors rien à recopier.
 */
@Component({
  selector: 'app-verification',
  imports: [FormsModule, Icone, Logo, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verification.html',
  styleUrl: './verification.css',
})
export class Verification {
  private readonly contenu = inject(ContenuService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly numero = signal('');
  protected readonly recherche = signal(false);
  /** null tant qu'aucune recherche n'a abouti ; distinct de « introuvable ». */
  protected readonly resultat = signal<CertificatVerifie | null>(null);
  protected readonly introuvable = signal(false);

  constructor() {
    const depuisUrl = this.route.snapshot.paramMap.get('numero');
    if (depuisUrl) {
      this.numero.set(depuisUrl);
      void this.verifier();
    }
  }

  protected async verifier(): Promise<void> {
    const saisi = this.numero().trim();
    if (!saisi || this.recherche()) {
      return;
    }
    this.recherche.set(true);
    this.resultat.set(null);
    this.introuvable.set(false);

    const certificat = await this.contenu.verifierCertificat(saisi);

    this.resultat.set(certificat);
    // « Introuvable » n'est PAS une erreur : c'est une réponse. Un numéro
    // inventé, mal recopié ou révoqué donne le même verdict — on ne dit jamais
    // lequel des trois, sous peine d'en faire un outil de test de numéros.
    this.introuvable.set(certificat === null);
    this.recherche.set(false);

    // L'URL porte la recherche : le vérificateur peut la transmettre ou la
    // garder en preuve de son contrôle.
    if (certificat) {
      void this.router.navigate(['/verification', certificat.numero], { replaceUrl: true });
    }
  }

  protected titulaire(certificat: CertificatVerifie): string {
    return `${certificat.prenom} ${certificat.nom}`.trim();
  }

  protected obtenuLe(certificat: CertificatVerifie): string {
    return new Date(certificat.date_obtention).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
