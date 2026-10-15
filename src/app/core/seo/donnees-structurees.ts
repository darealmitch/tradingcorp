import { DOCUMENT } from '@angular/common';
import { DestroyRef, effect, inject } from '@angular/core';
import { Vitrine } from '../commerce/vitrine.model';
import { VitrineService } from '../commerce/vitrine.service';
import { SITE_CANONIQUE } from './url-canonique.service';

/** Repère de la balise posée, pour la retrouver et la retirer. */
const ID_BALISE = 'donnees-formation';

/** « PT40H17M » : la durée de vidéo au format ISO 8601 qu'attend schema.org. */
export function dureeIso(secondes: number): string {
  const minutes = Math.floor(secondes / 60);
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return `PT${heures}H${reste > 0 ? `${reste}M` : ''}`;
}

/**
 * La formation décrite pour les moteurs de recherche (schema.org `Course`).
 *
 * Tout vient de la vitrine — prix, durée, modules — et rien d'autre n'est
 * déclaré : ni note, ni avis, ni nombre d'élèves. Google n'affiche une fiche
 * enrichie qu'à partir de données vérifiables sur la page, et une donnée
 * structurée inventée est sanctionnée comme du contenu trompeur.
 */
export function donneesFormation(v: Vitrine): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: v.titre,
    description:
      "Formation en ligne au trading et à l'investissement, pensée pour les débutants : du premier " +
      'graphique à la construction de son portefeuille, en passant par le mental, la fiscalité et ' +
      "l'analyse fondamentale.",
    inLanguage: 'fr',
    url: `${SITE_CANONIQUE}/programme`,
    educationalLevel: 'Débutant',
    provider: { '@type': 'Organization', name: 'TradingCorp', url: SITE_CANONIQUE },
    offers: [
      {
        '@type': 'Offer',
        category: 'Paid',
        price: v.prix_centimes / 100,
        priceCurrency: v.devise.toUpperCase(),
        url: `${SITE_CANONIQUE}/#offre`,
      },
    ],
    hasCourseInstance: [
      {
        '@type': 'CourseInstance',
        courseMode: 'Online',
        courseWorkload: dureeIso(v.secondes_video),
      },
    ],
    syllabusSections: v.programme.map((m) => ({
      '@type': 'Syllabus',
      name: m.titre,
      ...(m.accroche ? { description: m.accroche } : {}),
    })),
  };
}

/**
 * Pose la description de la formation dans la page tant que le composant
 * appelant est affiché, et la retire ensuite : elle ne vaut que pour les pages
 * qui présentent l'offre. À appeler dans un contexte d'injection.
 *
 * Elle est posée par le navigateur, après lecture de la vitrine : Google
 * exécute le JavaScript des pages qu'il indexe et la lit comme si elle était
 * dans le HTML.
 */
export function exposerFormation(): void {
  const document = inject(DOCUMENT);
  const vitrine = inject(VitrineService);

  effect(() => {
    const v = vitrine.vitrine();
    if (!v) {
      return;
    }
    let balise = document.getElementById(ID_BALISE);
    if (!balise) {
      balise = document.createElement('script');
      balise.id = ID_BALISE;
      balise.setAttribute('type', 'application/ld+json');
      document.head.appendChild(balise);
    }
    balise.textContent = JSON.stringify(donneesFormation(v));
  });

  inject(DestroyRef).onDestroy(() => document.getElementById(ID_BALISE)?.remove());
}
