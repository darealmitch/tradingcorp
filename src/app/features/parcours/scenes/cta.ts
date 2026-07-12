import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Reveal } from '../../../shared/reveal';

/** Scène finale : appel à l'action selon l'état d'inscription. */
@Component({
  selector: 'app-parcours-cta',
  imports: [Reveal, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="cta">
      <div class="cta-inner" appReveal>
        @if (inscrit()) {
          <h2>Continue sur ta lancée</h2>
          <p>Reprends là où tu t'es arrêté — chaque étape te rapproche du certificat.</p>
          <a class="btn btn-primary cta-btn" routerLink="/espace/formations">Voir ma formation</a>
        } @else {
          <h2>Prêt à commencer ?</h2>
          <p>Débloque la formation pour accéder au parcours complet, module après module.</p>
          <a class="btn btn-primary cta-btn" routerLink="/espace/formations"
            >Débloquer la formation</a
          >
        }
      </div>
    </section>
  `,
  styles: `
    .cta {
      min-height: 70svh;
      display: grid;
      place-content: center;
      padding: 60px 24px;
      text-align: center;
    }
    .cta-inner {
      width: min(92vw, 560px);
      padding: 48px 40px;
      border: 1px solid var(--line);
      border-radius: 24px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0));
    }
    .cta h2 {
      font-size: clamp(1.6rem, 4vw, 2.4rem);
    }
    .cta p {
      max-width: 420px;
      margin: 14px auto 0;
      color: var(--muted);
    }
    .cta-btn {
      margin-top: 26px;
    }
  `,
})
export class ParcoursCta {
  readonly inscrit = input.required<boolean>();
}
