import { Provenance } from './mesure.model';

/** Ce que le navigateur dit de l'arrivée sur le site : l'adresse et la page précédente. */
export interface Arrivee {
  /** Partie `?…` de l'adresse d'arrivée (paramètres `utm_*`, `gclid`…). */
  recherche: string;
  /** `document.referrer` : l'adresse de la page d'où vient le visiteur, ou vide. */
  referent: string;
}

/** Lu une fois, au démarrage : une redirection interne effacerait les paramètres. */
export function lireArrivee(): Arrivee {
  return {
    recherche: globalThis.location?.search ?? '',
    referent: globalThis.document?.referrer ?? '',
  };
}

/** Nos propres adresses : venir de l'une d'elles n'est pas une arrivée. */
const SITE = /(^|\.)tradingcorp\.(fr|pages\.dev)$|^localhost$|^127\.0\.0\.1$/;

/**
 * Retours d'un passage obligé du parcours — la page de paiement, la connexion
 * Google, le lien d'un e-mail d'authentification : le visiteur était déjà là.
 */
const RETOURS = /(^|\.)(stripe\.com|supabase\.co|accounts\.google\.com)$/;

const MOTEURS =
  /(^|\.)(google|bing|duckduckgo|qwant|ecosia|yahoo|yandex|baidu|startpage|lilo)\.[a-z.]+$|^search\.brave\.com$/;

const RESEAUX =
  /(^|\.)(facebook\.com|fb\.com|instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com|t\.co|linkedin\.com|lnkd\.in|snapchat\.com|pinterest\.[a-z.]+|reddit\.com|discord\.com|whatsapp\.com|t\.me|telegram\.org|threads\.net)$/;

const MESSAGERIES =
  /^(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$|(^|\.)(webmail|mail)\./;

/** Les valeurs de `utm_medium` qui désignent un clic payé. */
const MEDIUMS_PAYANTS = /^(cpc|ppc|paid|paid[-_ ]?social|paidsocial|ads?|display|cpm|cpv|video)$/;

/** `utm_source` d'un réseau social, quelle que soit sa graphie usuelle. */
const SOURCES_META = /^(facebook|fb|instagram|ig|meta)$/;
const SOURCES_TIKTOK = /^(tiktok|tt)$/;
const SOURCES_YOUTUBE = /^(youtube|yt)$/;
const SOURCES_GOOGLE = /^(google|adwords|googleads)$/;
const SOURCES_SOCIALES =
  /^(facebook|fb|instagram|ig|meta|tiktok|tt|youtube|yt|x|twitter|linkedin|snapchat|pinterest|reddit|discord|whatsapp|telegram|threads)$/;
const SOURCES_MOTEURS = /^(google|bing|duckduckgo|qwant|ecosia|yahoo|brave)$/;
const SOURCES_EMAIL = /^(e-?mail|newsletter|brevo|courriel)$/;

function hoteDe(adresse: string): string | null {
  if (!adresse) {
    return null;
  }
  try {
    return new URL(adresse).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * La provenance d'une visite, réduite à une catégorie.
 *
 * Seule cette catégorie quitte le navigateur. L'adresse d'origine, les
 * paramètres de campagne et les identifiants de clic (`gclid`, `fbclid`,
 * `ttclid`) restent sur l'appareil : ils servent à choisir la catégorie,
 * jamais à être transmis.
 *
 * `null` quand la visite n'est pas une arrivée : retour depuis la page de
 * paiement ou la connexion Google, page rechargée depuis le site lui-même.
 *
 * L'ordre compte. Une campagne balisée (`utm_*`) ou un identifiant de clic
 * publicitaire l'emporte sur la page d'origine : une annonce Google arrive
 * aussi « depuis google.com », et ce n'est pas une recherche naturelle.
 */
export function provenanceDe(arrivee: Arrivee): Provenance | null {
  const parametres = new URLSearchParams(arrivee.recherche);
  const source = (parametres.get('utm_source') ?? '').trim().toLowerCase();
  const medium = (parametres.get('utm_medium') ?? '').trim().toLowerCase();
  const payant = MEDIUMS_PAYANTS.test(medium);

  // 1. Les identifiants de clic que les régies ajoutent elles-mêmes à l'adresse.
  if (parametres.has('gclid') || parametres.has('gbraid') || parametres.has('wbraid')) {
    return SOURCES_YOUTUBE.test(source) ? 'youtube-ads' : 'google-ads';
  }
  if (parametres.has('ttclid')) {
    return 'tiktok-ads';
  }

  // 2. Les campagnes balisées. `fbclid` seul ne suffit pas : Facebook l'ajoute
  //    à TOUS ses liens sortants, publications gratuites comprises.
  if (source || medium) {
    return payant ? regiePayante(source) : canalBalise(source, medium);
  }

  // 3. Sans balise : la page d'où vient le visiteur.
  const hote = hoteDe(arrivee.referent);
  if (!hote) {
    return 'direct';
  }
  if (SITE.test(hote) || RETOURS.test(hote)) {
    return null;
  }
  if (MESSAGERIES.test(hote)) {
    return 'email';
  }
  if (MOTEURS.test(hote)) {
    return 'recherche';
  }
  return RESEAUX.test(hote) ? 'reseaux' : 'autre-site';
}

/** Un clic payé : la régie se lit dans `utm_source`. */
function regiePayante(source: string): Provenance {
  if (SOURCES_META.test(source)) {
    return 'meta-ads';
  }
  if (SOURCES_TIKTOK.test(source)) {
    return 'tiktok-ads';
  }
  if (SOURCES_YOUTUBE.test(source)) {
    return 'youtube-ads';
  }
  return SOURCES_GOOGLE.test(source) ? 'google-ads' : 'autre-site';
}

/** Un lien balisé mais gratuit : e-mail, publication, référencement. */
function canalBalise(source: string, medium: string): Provenance {
  if (medium === 'email' || medium === 'e-mail' || SOURCES_EMAIL.test(source)) {
    return 'email';
  }
  if (medium === 'social' || SOURCES_SOCIALES.test(source)) {
    return 'reseaux';
  }
  if (medium === 'organic' || SOURCES_MOTEURS.test(source)) {
    return 'recherche';
  }
  return 'autre-site';
}
