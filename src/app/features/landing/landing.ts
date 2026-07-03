import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Cta } from './sections/cta/cta';
import { Formations } from './sections/formations/formations';
import { Hero } from './sections/hero/hero';
import { Markets } from './sections/markets/markets';
import { Steps } from './sections/steps/steps';
import { Ticker } from './sections/ticker/ticker';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.html',
  imports: [Hero, Ticker, Formations, Markets, Steps, Cta],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Landing {}
