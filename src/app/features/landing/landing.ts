import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Formations } from './sections/formations/formations';
import { Hero } from './sections/hero/hero';
import { Results } from './sections/results/results';
import { Ticker } from './sections/ticker/ticker';
import { Notice } from './sections/notice/notice';
import { Trainer } from './sections/trainer/trainer';
import { Curriculum } from './sections/curriculum/curriculum';
import { Transition } from './sections/transition/transition';
import { Particles } from '../../shared/particles';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  imports: [Hero, Ticker, Formations, Notice, Results, Trainer, Curriculum, Transition, Particles],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {}
