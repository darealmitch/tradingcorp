import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Reveal } from '../../../../shared/reveal';

@Component({
  selector: 'app-transition',
  templateUrl: './transition.html',
  styleUrl: './transition.css',
  imports: [RouterLink, Reveal],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Transition {}
