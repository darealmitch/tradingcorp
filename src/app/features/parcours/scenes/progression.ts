import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ModuleParcours } from '../../../core/contenu/apprentissage.model';
import { Reveal } from '../../../shared/reveal';

/** Scène bilan : progression globale calculée à partir des états serveur. */
@Component({
  selector: 'app-parcours-progression',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="prog">
      <div class="prog-inner" appReveal>
        <span class="eyebrow">Ta progression</span>
        <div class="prog-chiffre">
          <span class="prog-pourcent">{{ pourcent() }}<small>%</small></span>
          <p class="prog-detail">
            {{ etapesFaites() }} / {{ etapesTotal() }} étapes · {{ modulesTermines() }} /
            {{ modules().length }} modules terminés
          </p>
        </div>
        <div class="prog-jauge" [style.--p]="pourcent() + '%'" aria-hidden="true"></div>
        <div class="prog-points">
          @for (module of modules(); track module.id_section) {
            <span class="prog-point" [attr.data-etat]="module.etat"></span>
          }
        </div>
      </div>
    </section>
  `,
  styles: `
    .prog {
      min-height: 70svh;
      display: grid;
      place-content: center;
      padding: 60px 24px;
    }
    .prog-inner {
      width: min(92vw, 560px);
      text-align: center;
    }
    .prog-chiffre {
      margin-top: 14px;
    }
    .prog-pourcent {
      font-family: var(--font-title);
      font-size: clamp(3.4rem, 12vw, 6rem);
      line-height: 1;
      background: var(--gradient);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .prog-pourcent small {
      font-size: 0.4em;
      color: var(--muted);
      -webkit-text-fill-color: var(--muted);
    }
    .prog-detail {
      margin-top: 8px;
      color: var(--muted);
    }
    .prog-jauge {
      position: relative;
      height: 6px;
      margin: 28px 0 20px;
      border-radius: 999px;
      background: rgba(148, 163, 220, 0.14);
      overflow: hidden;
    }
    .prog-jauge::after {
      content: '';
      position: absolute;
      inset: 0;
      width: var(--p, 0%);
      background: var(--gradient);
      border-radius: inherit;
      transition: width 0.8s var(--ease-out);
    }
    .prog-points {
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    .prog-point {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      border: 1px solid var(--line);
      background: transparent;
    }
    .prog-point[data-etat='termine'] {
      background: var(--up);
      border-color: var(--up);
    }
    .prog-point[data-etat='en_cours'] {
      background: var(--cyan);
      border-color: var(--cyan);
    }
    .prog-point[data-etat='debloque'] {
      background: var(--violet);
      border-color: var(--violet);
    }
  `,
})
export class ParcoursProgression {
  readonly modules = input.required<ModuleParcours[]>();

  protected readonly etapesTotal = computed(() =>
    this.modules().reduce((s, m) => s + m.total_lecons, 0),
  );
  protected readonly etapesFaites = computed(() =>
    this.modules().reduce((s, m) => s + m.lecons_terminees, 0),
  );
  protected readonly modulesTermines = computed(
    () => this.modules().filter((m) => m.etat === 'termine').length,
  );
  protected readonly pourcent = computed(() => {
    const total = this.etapesTotal();
    return total > 0 ? Math.round((this.etapesFaites() / total) * 100) : 0;
  });
}
