/**
 * L'e-mail qui double une notification des échanges : HTML et texte brut.
 *
 * Fonctions pures, sans accès à la base ni au réseau. Le texte est celui de la
 * notification, écrit par la base au moment de l'action : il dit ce qui s'est
 * passé et qui l'a fait. Le contenu d'un message n'y figure JAMAIS — un e-mail
 * se transfère et se lit par-dessus l'épaule ; un échange se lit sur la
 * plateforme, après connexion.
 */

/** Ce que la base a rangé dans la file, recopié de la notification. */
export interface Courriel {
  objet: string;
  message: string | null;
  lien: string | null;
}

const PIED =
  'Message automatique de TradingCorp : tu le reçois parce qu’une action sur les échanges ' +
  'des formations te concerne. Le contenu des messages n’est jamais recopié par e-mail ; ' +
  'il se lit sur la plateforme, après connexion.';

/**
 * Le texte cite des prénoms et des titres de leçon saisis par des personnes :
 * on l'échappe avant de l'écrire dans du HTML, faute de quoi une balise glissée
 * dans un prénom partirait dans un e-mail signé TradingCorp.
 */
function echapper(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * L'adresse du bouton. La base n'écrit que des chemins internes ; on le
 * vérifie tout de même, puisqu'un lien qui sortirait du site partirait signé
 * TradingCorp. `//hote` est une adresse externe, pas un chemin.
 */
export function adresse(lien: string | null, adresseSite: string): string {
  return lien && /^\/(?!\/)/.test(lien) ? `${adresseSite}${lien}` : `${adresseSite}/espace`;
}

/** Le libellé du bouton, d'après la page où il mène. */
export function libelleBouton(lien: string | null): string {
  if (lien?.startsWith('/espace/moderation')) {
    return 'Ouvrir la modération';
  }
  if (lien?.startsWith('/parcours/')) {
    return 'Voir l’échange';
  }
  return 'Ouvrir mon espace';
}

export function html(c: Courriel, prenom: string | null, adresseSite: string): string {
  const cible = echapper(adresse(c.lien, adresseSite));
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2233;max-width:620px">
  <p>Bonjour${prenom ? ` ${echapper(prenom)}` : ''},</p>

  <p>${echapper(c.message ?? c.objet)}</p>

  <p style="margin:26px 0">
    <a href="${cible}" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#1e2433;color:#ffffff;text-decoration:none;font-weight:600">${libelleBouton(c.lien)}</a>
  </p>

  <p style="color:#6b6f80;font-size:13px">
    Si le bouton ne s’ouvre pas, recopie cette adresse : <a href="${cible}">${cible}</a>
  </p>

  <p style="margin-top:26px;color:#6b6f80;font-size:13px">
    ${PIED}<br>
    Pour toute question : <a href="mailto:mailtradingcorp@gmail.com">mailtradingcorp@gmail.com</a>.
  </p>
</div>`.trim();
}

/** Le même message en texte brut, pour les messageries qui n'affichent pas le HTML. */
export function texte(c: Courriel, prenom: string | null, adresseSite: string): string {
  return [
    `Bonjour${prenom ? ` ${prenom}` : ''},`,
    '',
    c.message ?? c.objet,
    '',
    `${libelleBouton(c.lien)} : ${adresse(c.lien, adresseSite)}`,
    '',
    PIED,
    'Pour toute question : mailtradingcorp@gmail.com',
  ].join('\n');
}
