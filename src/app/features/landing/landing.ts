import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Formations } from './sections/formations/formations';
import { Hero } from './sections/hero/hero';
import { Results } from './sections/results/results';
import { Ticker } from './sections/ticker/ticker';
import { Notice } from './sections/notice/notice';
import { Trainer } from './sections/trainer/trainer';
import { Curriculum } from './sections/curriculum/curriculum';
import { Faq } from './sections/faq/faq';
import { Offre } from './sections/offre/offre';
import { Transition } from './sections/transition/transition';
import { Particles } from '../../shared/particles';
import { exposerFormation } from '../../core/seo/donnees-structurees';
import { BarreAchat } from '../../shared/ui/barre-achat';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  imports: [
    Hero,
    Ticker,
    Formations,
    Notice,
    Results,
    Trainer,
    Curriculum,
    Offre,
    Faq,
    Transition,
    Particles,
    BarreAchat,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {
  constructor() {
    // La fiche « formation » lue par les moteurs de recherche : prix, durée,
    // modules, tirés de la vitrine.
    exposerFormation();
  }
}
