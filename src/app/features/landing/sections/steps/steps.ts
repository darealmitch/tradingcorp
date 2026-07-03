import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Reveal } from '../../../../shared/reveal';

@Component({
  selector: 'app-steps',
  templateUrl: './steps.html',
  styleUrl: './steps.css',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Steps {}
