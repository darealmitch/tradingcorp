import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ProfilService } from '../../../core/profil/profil.service';

interface Message {
  texte: string;
  type: 'succes' | 'erreur';
}

const DELAI_SURNOM_MS = 30 * 24 * 60 * 60 * 1000;
const JOUR_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-mon-profil',
  templateUrl: './mon-profil.html',
  styleUrls: ['../espace-pages.css', './mon-profil.css'],
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MonProfil {
  private readonly router = inject(Router);
  private readonly profilService = inject(ProfilService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly auth = inject(AuthService);

  protected readonly enregistrementSurnom = signal(false);
  protected readonly message = signal<Message | null>(null);

  protected readonly surnomCtrl = this.fb.control(this.auth.profil()?.surnom ?? '', [
    Validators.maxLength(30),
  ]);

  /** Le surnom est modifiable si jamais changé, ou après 30 jours. */
  protected readonly surnomModifiable = computed(() => {
    const date = this.auth.profil()?.surnom_modifie_le;
    return !date || Date.now() - new Date(date).getTime() >= DELAI_SURNOM_MS;
  });

  /** Délai restant avant la prochaine modification autorisée (null si libre). */
  protected readonly prochaineModif = computed(() => {
    const date = this.auth.profil()?.surnom_modifie_le;
    if (!date) {
      return null;
    }
    const prochaine = new Date(date).getTime() + DELAI_SURNOM_MS;
    if (prochaine <= Date.now()) {
      return null;
    }
    return {
      date: new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(prochaine)),
      jours: Math.ceil((prochaine - Date.now()) / JOUR_MS),
    };
  });

  constructor() {
    // Le champ suit la règle serveur : verrouillé tant que 30 jours ne sont
    // pas écoulés (le blocage réel reste côté RPC, ceci n'est que l'UX).
    effect(() => {
      if (this.surnomModifiable()) {
        this.surnomCtrl.enable({ emitEvent: false });
      } else {
        this.surnomCtrl.disable({ emitEvent: false });
      }
    });
  }

  protected async changerSurnom(): Promise<void> {
    if (!this.surnomModifiable() || this.surnomCtrl.invalid) {
      return;
    }
    const valeur = this.surnomCtrl.value.trim();
    if (!valeur) {
      this.message.set({ texte: 'Le surnom ne peut pas être vide.', type: 'erreur' });
      return;
    }
    this.message.set(null);
    this.enregistrementSurnom.set(true);
    const erreur = await this.profilService.changerSurnom(valeur);
    this.message.set(
      erreur ? { texte: erreur, type: 'erreur' } : { texte: 'Surnom mis à jour.', type: 'succes' },
    );
    this.enregistrementSurnom.set(false);
  }

  protected membreDepuis(): string {
    const date = this.auth.profil()?.date_creation;
    if (!date) {
      return '—';
    }
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(date));
  }

  protected async deconnecter(): Promise<void> {
    await this.auth.deconnexion();
    await this.router.navigateByUrl('/');
  }
}
