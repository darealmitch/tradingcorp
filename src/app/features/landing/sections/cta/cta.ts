import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Reveal } from '../../../../shared/reveal';

@Component({
  selector: 'app-cta',
  templateUrl: './cta.html',
  styleUrl: './cta.css',
  imports: [Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Cta {}
