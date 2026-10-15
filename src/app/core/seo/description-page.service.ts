import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

/**
 * Description propre à chaque page publique, celle que les moteurs affichent
 * sous le titre d'un résultat. Sans elle, toutes les pages reprenaient celle
 * de l'accueil : des doublons, que Google remplace par un extrait de son
 * choix.
 *
 * Aucun chiffre ici (durée, nombre de modules…) : écrit en dur, il finirait par
 * contredire la formation. Les chiffres sont dans la page, lus en base.
 */
const DESCRIPTIONS: Record<string, string> = {
  '/':
    "Formation en ligne au trading et à l'investissement, pensée pour les débutants : du premier " +
    'graphique à la construction de ton portefeuille. Quiz, certificat vérifiable et leçons à essayer.',
  '/programme':
    'Le programme de la formation TradingCorp, module par module : objectifs, leçons vidéo, durée, ' +
    'quiz et sommaire de chaque module, avant de t’inscrire.',
  '/inscription':
    'Crée ton compte TradingCorp en quelques instants pour accéder à ton espace personnel et à la ' +
    'formation.',
  '/connexion':
    'Connecte-toi à ton espace TradingCorp pour reprendre ta formation là où tu l’as laissée.',
  '/verification': 'Vérifie l’authenticité d’un certificat TradingCorp à partir de son numéro.',
  '/cgv':
    'Conditions générales de vente de la formation TradingCorp : prix, paiement, accès, droit de ' +
    'rétractation de 14 jours et réclamations.',
  '/cgu': 'Conditions générales d’utilisation du site et de l’espace élève TradingCorp.',
  '/mentions-legales': 'Mentions légales du site TradingCorp : éditeur, hébergement et contact.',
  '/confidentialite':
    'Politique de confidentialité de TradingCorp : données collectées, finalités, durées de ' +
    'conservation et exercice de tes droits.',
  '/cookies':
    'Politique de cookies de TradingCorp : ce qui est déposé sur ton appareil, la mesure d’audience ' +
    'sans cookie, et comment modifier tes choix.',
  '/remboursement':
    'Politique de remboursement de TradingCorp : 14 jours pour te rétracter après l’achat, même si ' +
    'tu as commencé la formation.',
};

/**
 * Pose la description de la page consultée, ou remet celle d'`index.html`
 * pour une page qui n'en a pas.
 */
@Injectable({ providedIn: 'root' })
export class DescriptionPageService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);

  /** La description d'`index.html`, lue une fois : c'est elle qu'on rétablit. */
  private parDefaut: string | null = null;

  /** À appeler une seule fois, depuis le composant racine. */
  demarrer(): void {
    this.router.events
      .pipe(filter((evenement): evenement is NavigationEnd => evenement instanceof NavigationEnd))
      .subscribe((evenement) => this.poser(evenement.urlAfterRedirects));
    if (this.router.navigated) {
      this.poser(this.router.url);
    }
  }

  private poser(url: string): void {
    const chemin = url.split('?')[0].split('#')[0] || '/';
    const balise = this.document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!balise) {
      return;
    }
    this.parDefaut ??= balise.getAttribute('content');
    const texte = DESCRIPTIONS[chemin] ?? this.parDefaut;
    if (texte) {
      balise.setAttribute('content', texte);
    }
  }
}
