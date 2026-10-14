import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { compte, dureeAnnoncee } from '../../../../core/commerce/vitrine.textes';
import { VitrineService } from '../../../../core/commerce/vitrine.service';
import { Reveal } from '../../../../shared/reveal';

/**
 * Les questions qu'un visiteur se pose avant de payer 997 € — débutant ?
 * combien de temps ? et si ça ne me plaît pas ? — et que le site laissait
 * sans réponse.
 *
 * Chaque réponse s'appuie sur une source vérifiable, citée en commentaire dans
 * le gabarit : les conditions générales, ou la base pour les chiffres. Aucune
 * ne promet un résultat : la dernière dit précisément le contraire.
 *
 * Les questions sont des `<details>` natifs : ouvrables au clavier, lus par les
 * lecteurs d'écran, sans une ligne de script.
 */
@Component({
  selector: 'app-faq',
  templateUrl: './faq.html',
  styleUrl: './faq.css',
  imports: [RouterLink, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Faq {
  protected readonly vitrine = inject(VitrineService);

  /**
   * « Oui. Le parcours part des bases et se suit dans l'ordre : Développement
   * personnel, Éducation financière… » — les modules tels qu'ils sont publiés.
   */
  protected readonly parcours = computed(() => {
    const modules = this.vitrine.vitrine()?.programme ?? [];
    const debut = 'Oui. Le parcours part des bases et se suit dans l’ordre';
    return modules.length > 0
      ? `${debut}\u00a0: ${modules.map((m) => m.titre).join(', ')}.`
      : `${debut}, du mental à la finance de marché.`;
  });

  /** « 64 leçons vidéo, soit plus de 40 heures de vidéo, et 30 quiz ». */
  protected readonly volume = computed(() => {
    const v = this.vitrine.vitrine();
    if (!v) {
      return null;
    }
    return (
      `${compte(v.lecons_video, 'leçon vidéo', 'leçons vidéo')}, soit ` +
      `${dureeAnnoncee(v.secondes_video)} de vidéo, et ${compte(v.quiz, 'quiz', 'quiz')}`
    );
  });

  /** Les leçons offertes, nommées : « « 1.1 Le processus », « 1.2 … » et « 1.3 … » ». */
  protected readonly leconsOffertes = computed(() => {
    const titres = (this.vitrine.vitrine()?.lecons_offertes ?? []).map(
      (l) => `«\u00a0${l.titre}\u00a0»`,
    );
    if (titres.length === 0) {
      return null;
    }
    return titres.length === 1
      ? titres[0]
      : `${titres.slice(0, -1).join(', ')} et ${titres[titres.length - 1]}`;
  });
}
