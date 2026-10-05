/**
 * Ce que dit l'annonce d'une mise à jour des conditions : notification, objet,
 * e-mail en HTML et en texte brut.
 *
 * Fonctions pures, sans accès à la base ni au réseau : ce que reçoit un
 * utilisateur se lit ici, d'un bout à l'autre.
 */

/** Les documents dont une mise à jour s'annonce, dans l'ordre où on les cite. */
export const DOCUMENTS = {
  cgu: {
    chemin: '/cgu',
    titre: 'Conditions générales d’utilisation',
    groupe: 'nos conditions générales d’utilisation',
  },
  confidentialite: {
    chemin: '/confidentialite',
    titre: 'Politique de confidentialité',
    groupe: 'notre politique de confidentialité',
  },
  cgv: {
    chemin: '/cgv',
    titre: 'Conditions générales de vente',
    groupe: 'nos conditions générales de vente',
  },
} as const;

export type DocumentLegal = keyof typeof DOCUMENTS;

export interface Annonce {
  /** « AAAA-MM-JJ » : la date de la nouvelle version. */
  date: string;
  documents: DocumentLegal[];
  /** Saisi par l'administrateur ; une ligne commençant par « - » devient une puce. */
  resume: string;
  /** Message envoyé aux seuls comptes de test. */
  essai: boolean;
}

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

/** « 2026-10-05 » → « 5 octobre 2026 ». Écrit à la main : rien ne dépend des données de langue du runtime. */
export function dateLongue(iso: string): string {
  const [annee, mois, jour] = iso.split('-').map(Number);
  return `${jour} ${MOIS[mois - 1]} ${annee}`;
}

/** Vrai pour une date « AAAA-MM-JJ » qui existe au calendrier. */
export function dateValide(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return false;
  }
  const [annee, mois, jour] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(annee, mois - 1, jour));
  return d.getUTCFullYear() === annee && d.getUTCMonth() === mois - 1 && d.getUTCDate() === jour;
}

/** « a », « a et b », « a, b et c ». */
function enumerer(elements: string[]): string {
  return elements.length <= 1
    ? (elements[0] ?? '')
    : `${elements.slice(0, -1).join(', ')} et ${elements[elements.length - 1]}`;
}

/** « nos conditions générales d'utilisation et notre politique de confidentialité ». */
function groupes(documents: DocumentLegal[]): string {
  return enumerer(documents.map((d) => DOCUMENTS[d].groupe));
}

/** « de nos conditions générales d'utilisation et de notre politique de confidentialité ». */
function complement(documents: DocumentLegal[]): string {
  return enumerer(documents.map((d) => `de ${DOCUMENTS[d].groupe}`));
}

/**
 * Depuis quand la version s'applique. Une date à venir s'annonce au futur :
 * l'article 14 des CGU prévoit justement de prévenir AVANT l'entrée en vigueur.
 */
function vigueur(a: Annonce, aujourdhui: string): string {
  return a.date > aujourdhui
    ? `Les nouvelles versions entreront en vigueur le ${dateLongue(a.date)}.`
    : `Les nouvelles versions sont en vigueur depuis le ${dateLongue(a.date)}.`;
}

export function objet(a: Annonce): string {
  return `${a.essai ? '[Essai] ' : ''}Mise à jour ${complement(a.documents)}`;
}

/** La notification de l'espace : courte, le détail est dans l'e-mail et sur la page. */
export function notification(a: Annonce): { titre: string; message: string; lien: string } {
  return {
    titre: 'Mise à jour de nos conditions',
    message: `Nouvelle version ${complement(a.documents)}, datée du ${dateLongue(a.date)}.`,
    lien: DOCUMENTS[a.documents[0]].chemin,
  };
}

/**
 * Le résumé est une saisie : on l'échappe avant de l'écrire dans du HTML. Sans
 * cela, une balise glissée dans le texte partirait dans un e-mail signé
 * TradingCorp.
 */
function echapper(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Lignes « - … » en liste à puces, le reste en paragraphes ; une ligne vide sépare. */
function resumeHtml(resume: string): string {
  const blocs: string[] = [];
  let puces: string[] = [];
  const fermerPuces = () => {
    if (puces.length > 0) {
      blocs.push(`<ul style="margin:0 0 12px;padding-left:20px">${puces.join('')}</ul>`);
      puces = [];
    }
  };
  for (const brute of resume.split('\n')) {
    const ligne = brute.trim();
    if (/^[-•]\s+/.test(ligne)) {
      puces.push(`<li style="margin-bottom:6px">${echapper(ligne.replace(/^[-•]\s+/, ''))}</li>`);
    } else {
      fermerPuces();
      if (ligne) {
        blocs.push(`<p>${echapper(ligne)}</p>`);
      }
    }
  }
  fermerPuces();
  return blocs.join('\n  ');
}

export function html(
  a: Annonce,
  prenom: string | null,
  adresseSite: string,
  aujourdhui: string,
): string {
  const bandeauEssai = a.essai
    ? `<p style="padding:10px 14px;border:1px solid #d94d59;border-radius:8px;color:#b3303c">
    Ceci est un <strong>essai</strong>, envoyé aux seuls comptes de test depuis l’écran
    Paramètres. Les utilisateurs n’ont rien reçu. Le message est en tout point celui qu’ils
    recevront.
  </p>`
    : '';
  const liens = a.documents
    .map((d) => `<li><a href="${adresseSite}${DOCUMENTS[d].chemin}">${DOCUMENTS[d].titre}</a></li>`)
    .join('');

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2233;max-width:620px">
  ${bandeauEssai}
  <p>Bonjour${prenom ? ` ${echapper(prenom)}` : ''},</p>

  <p>Nous avons mis à jour ${groupes(a.documents)}. ${vigueur(a, aujourdhui)}</p>

  <h3 style="font-size:15px;margin:26px 0 8px">Ce qui change</h3>
  ${resumeHtml(a.resume)}

  <p>Les nouvelles versions sont consultables à tout moment :</p>
  <ul style="padding-left:20px">${liens}</ul>

  <p style="margin-top:26px">
    Pour toute question, écrivez-nous à
    <a href="mailto:mailtradingcorp@gmail.com">mailtradingcorp@gmail.com</a>.
  </p>

  <p style="margin-top:26px;color:#6b6f80;font-size:13px">
    TradingCorp — vous recevez ce message parce que vous avez un compte sur la plateforme.
  </p>
</div>`.trim();
}

/** Le même message en texte brut, écrit à la main : les liens y gardent leur adresse. */
export function texte(
  a: Annonce,
  prenom: string | null,
  adresseSite: string,
  aujourdhui: string,
): string {
  const resume = a.resume
    .split('\n')
    .map((ligne) => ligne.trim().replace(/^•\s+/, '- '))
    .join('\n')
    .trim();
  return [
    ...(a.essai
      ? [
          'ESSAI — envoyé aux seuls comptes de test depuis l’écran Paramètres.',
          'Les utilisateurs n’ont rien reçu. Le message est en tout point celui qu’ils recevront.',
          '',
        ]
      : []),
    `Bonjour${prenom ? ` ${prenom}` : ''},`,
    '',
    `Nous avons mis à jour ${groupes(a.documents)}. ${vigueur(a, aujourdhui)}`,
    '',
    'CE QUI CHANGE',
    resume,
    '',
    'Les nouvelles versions sont consultables à tout moment :',
    ...a.documents.map((d) => `- ${DOCUMENTS[d].titre} : ${adresseSite}${DOCUMENTS[d].chemin}`),
    '',
    'Pour toute question : mailtradingcorp@gmail.com',
    '',
    'TradingCorp — vous recevez ce message parce que vous avez un compte sur la plateforme.',
  ].join('\n');
}
