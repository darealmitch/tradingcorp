import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MesureClic } from '../../../../shared/mesure-clic';
import { Reveal } from '../../../../shared/reveal';

@Component({
  selector: 'app-transition',
  templateUrl: './transition.html',
  styleUrl: './transition.css',
  imports: [RouterLink, Reveal, MesureClic],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Transition {}
