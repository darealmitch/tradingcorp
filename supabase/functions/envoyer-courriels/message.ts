/**
 * L'e-mail qui double une notification des échanges : HTML et texte brut.
 *
 * Fonctions pures, sans accès à la base ni au réseau. Le texte est celui de la
 * notification, écrit par la base au moment de l'action : il dit ce qui s'est
 * passé et qui l'a fait. Le contenu d'un message n'y figure JAMAIS — un e-mail
 * se transfère et se lit par-dessus l'épaule ; un échange se lit sur la
 * plateforme, après connexion.
 *
 * MISE EN PAGE À TABLEAUX ET STYLES EN LIGNE, à dessein : c'est la seule que
 * toutes les messageries respectent. Outlook ignore flexbox et les marges
 * automatiques, Gmail retire une partie des feuilles de style. Le bloc
 * `<style>` ne porte que l'adaptation au mobile, qu'une messagerie qui
 * l'ignore remplace par une mise en page simplement plus large.
 */

/** Ce que la base a rangé dans la file, recopié de la notification. */
export interface Courriel {
  objet: string;
  message: string | null;
  lien: string | null;
}

/** Couleurs du thème clair du site, et le dégradé de la marque. */
const COULEUR = {
  fond: '#f3f4f8',
  carte: '#ffffff',
  bordure: '#e2e6f0',
  titre: '#0e111c',
  texte: '#1f2233',
  discret: '#6b6f80',
  bouton: '#1e2433',
  lien: '#5b46e0',
  // Repli uni pour les messageries qui ignorent les dégradés (Outlook).
  marque: '#7c6cff',
  degrade: 'linear-gradient(92deg, #38e1ff, #7c6cff 52%, #e14dff)',
};

const POLICE = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Copie recadrée du logo du site : le dessin est intact, seules les marges changent. */
const LOGO = '/images/courriel/logo-tradingcorp.png';

const CONFIDENTIALITE =
  'Le contenu des messages n’est jamais recopié par e-mail : il se lit sur TradingCorp, après connexion.';

const PIED =
  'Message automatique de TradingCorp : tu le reçois parce qu’une action sur les échanges ' +
  'des formations te concerne.';

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
  if (lien?.startsWith('/espace/moderation?onglet=prives')) {
    return 'Ouvrir les échanges privés';
  }
  if (lien?.startsWith('/espace/moderation')) {
    return 'Ouvrir la modération';
  }
  if (lien?.startsWith('/parcours/')) {
    return 'Voir l’échange';
  }
  return 'Ouvrir mon espace';
}

/**
 * Où le message se lit sur TradingCorp. Il n'y a pas de messagerie à part :
 * l'élève lit ses échanges sous la leçon, l'équipe dans la modération.
 */
export function ouLire(lien: string | null): string {
  if (lien?.startsWith('/espace/moderation?onglet=prives')) {
    return 'Tu peux le lire dans l’onglet « Échanges privés » de la modération, sur TradingCorp.';
  }
  if (lien?.startsWith('/espace/moderation')) {
    return 'Il t’attend dans l’onglet « À modérer » de la modération, sur TradingCorp.';
  }
  if (lien?.startsWith('/parcours/')) {
    return 'Tout se lit dans les échanges de la leçon, sur TradingCorp.';
  }
  return 'Tout se lit dans ton espace, sur TradingCorp.';
}

export function html(c: Courriel, prenom: string | null, adresseSite: string): string {
  const cible = echapper(adresse(c.lien, adresseSite));
  const objet = echapper(c.objet);
  const message = echapper(c.message ?? c.objet);
  const salutation = `Bonjour${prenom ? ` ${echapper(prenom)}` : ''},`;
  const paragraphe = `margin:0 0 16px;font-size:16px;line-height:1.6;color:${COULEUR.texte}`;

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${objet}</title>
<style>
  @media (max-width: 620px) {
    .tc-cadre { padding: 16px 8px !important; }
    .tc-carte { padding: 28px 22px !important; }
    .tc-titre { font-size: 20px !important; }
    .tc-bouton { width: 100% !important; }
    .tc-bouton a { display: block !important; text-align: center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${COULEUR.fond}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${message}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COULEUR.fond}">
  <tr>
    <td class="tc-cadre" align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">
        <tr>
          <td style="height:4px;line-height:4px;font-size:0;background-color:${COULEUR.marque};background-image:${COULEUR.degrade};border-radius:12px 12px 0 0">&nbsp;</td>
        </tr>
        <tr>
          <td class="tc-carte" style="background:${COULEUR.carte};padding:36px 40px;border:1px solid ${COULEUR.bordure};border-top:0;border-radius:0 0 12px 12px;font-family:${POLICE}">
            <a href="${echapper(adresseSite)}" style="text-decoration:none">
              <img src="${echapper(adresseSite + LOGO)}" width="259" alt="TradingCorp" style="display:block;border:0;width:259px;max-width:100%;height:auto">
            </a>
            <h1 class="tc-titre" style="margin:32px 0 16px;font-family:${POLICE};font-size:22px;line-height:1.3;font-weight:700;color:${COULEUR.titre}">${objet}</h1>
            <p style="${paragraphe}">${salutation}</p>
            <p style="${paragraphe}">${message}</p>
            <p style="${paragraphe};margin-bottom:28px">${echapper(ouLire(c.lien))}</p>
            <table role="presentation" class="tc-bouton" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="border-radius:8px;background:${COULEUR.bouton}">
                  <a href="${cible}" style="display:inline-block;padding:14px 28px;font-family:${POLICE};font-size:16px;font-weight:600;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:8px">${libelleBouton(c.lien)}</a>
                </td>
              </tr>
            </table>
            <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:${COULEUR.discret}">
              Si le bouton ne s’ouvre pas, copie cette adresse dans ton navigateur :<br>
              <a href="${cible}" style="color:${COULEUR.lien};word-break:break-all">${cible}</a>
            </p>
            <hr style="border:0;border-top:1px solid ${COULEUR.bordure};margin:28px 0 20px">
            <p style="margin:0;font-size:13px;line-height:1.5;color:${COULEUR.discret}">${CONFIDENTIALITE}</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 12px;font-family:${POLICE};font-size:12px;line-height:1.5;color:${COULEUR.discret}">
            ${PIED}<br>
            Une question ? <a href="mailto:mailtradingcorp@gmail.com" style="color:${COULEUR.discret}">mailtradingcorp@gmail.com</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Le même message en texte brut, pour les messageries qui n'affichent pas le HTML. */
export function texte(c: Courriel, prenom: string | null, adresseSite: string): string {
  return [
    c.objet,
    '',
    `Bonjour${prenom ? ` ${prenom}` : ''},`,
    '',
    c.message ?? c.objet,
    ouLire(c.lien),
    '',
    `${libelleBouton(c.lien)} : ${adresse(c.lien, adresseSite)}`,
    '',
    CONFIDENTIALITE,
    '',
    '—',
    PIED,
    'Une question ? mailtradingcorp@gmail.com',
  ].join('\n');
}
