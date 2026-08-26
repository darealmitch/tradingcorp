import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-confidentialite',
  templateUrl: './confidentialite.html',
  styleUrls: ['../legal.css'],
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Confidentialite {}
