// Signature des URLs vidéo Bunny — le seul endroit du projet qui manipule la
// clé de sécurité de la pull zone.
//
// POURQUOI. Jusqu'ici `lecon_contenu` renvoyait l'URL HLS nue
// (`https://vz-….b-cdn.net/<id>/playlist.m3u8`), permanente et identique pour
// tout le monde. Le seul rempart était le réglage Bunny « Block direct url
// file access », qui exige un en-tête `Referer` — mesuré : `curl` nu reçoit un
// 403, mais `curl -H "Referer: https://tradingcorp.fr/"` reçoit la playlist,
// les sous-playlists, les segments, et même le MP4 dont l'URL se devine à
// partir de l'identifiant. Un apprenant relevait donc dans l'onglet Réseau une
// adresse valable indéfiniment, pour n'importe qui.
//
// LE TOKEN EST DANS LE CHEMIN, PAS EN QUERY STRING. Une playlist HLS renvoie
// vers ses rendus (`240p/video.m3u8`) puis vers ses segments par des URLs
// RELATIVES. Le navigateur les résout contre le répertoire de la playlist, en
// laissant tomber la query string : un `?token=…` serait perdu dès la
// deuxième requête et la lecture casserait au bout de quelques secondes.
// Placé dans le chemin, le token fait partie du préfixe hérité par toutes les
// sous-requêtes — la lecture fonctionne sans rien changer à `hls.js`.
//
// Forme produite :
//   https://vz-….b-cdn.net/bcdn_token=HS256-…&token_path=%2F<id>%2F&expires=<ts>/<id>/playlist.m3u8

/** Encodage base64url : l'alphabet des URLs, sans remplissage. */
function base64url(octets: ArrayBuffer): string {
  const binaire = String.fromCharCode(...new Uint8Array(octets));
  return btoa(binaire).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Répertoire d'une URL de fichier — `/<id>/playlist.m3u8` donne `/<id>/`.
 * C'est l'unité que l'on signe : un jeton par vidéo, valable pour sa playlist,
 * ses rendus et ses segments, et pour rien d'autre.
 */
function repertoireDe(chemin: string): string {
  return chemin.replace(/[^/]*$/, '');
}

/** Validité minimale : un chapitre court ne doit pas produire un lien mort-né. */
const VALIDITE_MINIMALE_S = 45 * 60;
/** Validité maximale : c'est cette borne qui fait la protection. */
const VALIDITE_MAXIMALE_S = 4 * 60 * 60;

/**
 * Durée de validité d'un jeton, en secondes, pour une vidéo de `dureeVideoS`.
 *
 * Proportionnelle à la vidéo — un chapitre de quatre minutes n'a pas besoin de
 * la fenêtre d'un chapitre de cinquante — avec le DOUBLE de la durée pour
 * absorber ce qu'on fait réellement d'un cours : mettre en pause, revenir en
 * arrière, reprendre après une interruption.
 *
 * Les deux bornes traitent chacune un cas concret :
 *
 *   • le plancher couvre un `duree_s` faux ou absent. Les 64 chapitres sont
 *     aujourd'hui renseignés (de 375 à 4957 s), mais la colonne se remplit à
 *     la main et le seed pose 3600 par défaut (cf. VIDEOS-BUNNY.md) : une
 *     durée oubliée ou trop basse produirait un lien expirant en pleine
 *     lecture ;
 *   • le plafond est la mesure de sécurité elle-même. Un lien relevé dans
 *     l'onglet Réseau cesse de valoir quelque chose le jour même, là où
 *     l'ancienne URL nue restait partageable indéfiniment.
 *
 * Une durée inconnue retombe sur le plancher plutôt que sur le plafond : entre
 * un apprenant qui recharge sa page et un lien qui circule quatre heures, le
 * premier est le moindre mal.
 */
export function dureeJeton(dureeVideoS: number | null): number {
  const proportionnelle = Math.round((dureeVideoS ?? 0) * 2);
  return Math.min(VALIDITE_MAXIMALE_S, Math.max(VALIDITE_MINIMALE_S, proportionnelle));
}

/**
 * Signe l'URL d'une vidéo Bunny pour un accès limité dans le temps.
 *
 * L'algorithme suit l'implémentation de référence de Bunny (dépôt
 * BunnyWay/BunnyCDN.TokenAuthentication), qui fait autorité sur la
 * documentation : celle-ci laisse entendre que `token_path` sert seulement de
 * chemin de signature, alors que le code l'ajoute AUSSI aux paramètres signés.
 * Se tromper sur ce point ne produit pas une erreur visible ici — seulement un
 * 403 sur toutes les vidéos, en production. D'où `scripts/bunny-signature.mjs`,
 * qui éprouve la formule contre le CDN réel avant la bascule.
 *
 *   message = <répertoire> + <expires> + <paramètres triés>
 *   token   = "HS256-" + base64url(HMAC-SHA256(clé, message))
 *
 * @param urlVideo  URL de lecture nue, telle qu'elle est stockée en base.
 * @param cle       clé de sécurité de la pull zone (secret d'Edge Function).
 * @param dureeS    validité du jeton en secondes.
 */
export async function signerUrlVideo(
  urlVideo: string,
  cle: string,
  dureeS: number,
): Promise<string> {
  const url = new URL(urlVideo);
  const repertoire = repertoireDe(url.pathname);
  const expires = Math.floor(Date.now() / 1000) + dureeS;

  // Un seul paramètre signé aujourd'hui. Le tri alphabétique n'a donc pas
  // d'effet visible, mais il est conservé : c'est lui qui rend la formule
  // juste le jour où un deuxième paramètre s'ajoute (restriction par pays,
  // limite de débit), et l'oublier alors serait indétectable à la relecture.
  const parametres: Record<string, string> = { token_path: repertoire };
  const signes = Object.keys(parametres)
    .sort()
    .map((nom) => `${nom}=${parametres[nom]}`)
    .join('&');

  const encodeur = new TextEncoder();
  const cleHmac = await crypto.subtle.importKey(
    'raw',
    encodeur.encode(cle),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    cleHmac,
    encodeur.encode(`${repertoire}${expires}${signes}`),
  );

  const jeton = `HS256-${base64url(signature)}`;
  const parametresUrl = Object.keys(parametres)
    .sort()
    .map((nom) => `&${nom}=${encodeURIComponent(parametres[nom])}`)
    .join('');

  return `${url.origin}/bcdn_token=${jeton}${parametresUrl}&expires=${expires}${url.pathname}`;
}
