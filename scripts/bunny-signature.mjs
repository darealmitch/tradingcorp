#!/usr/bin/env node
/**
 * Éprouve la formule de signature Bunny contre le CDN réel, AVANT la bascule.
 *
 * Pourquoi ce script existe : la documentation de Bunny et son implémentation
 * de référence se contredisent sur un point — la doc présente `token_path`
 * comme un simple chemin de signature, le code l'ajoute AUSSI aux paramètres
 * signés. Une erreur ici ne se voit pas à la relecture : elle se voit en
 * production, sous la forme d'un 403 sur les 64 chapitres à la fois. On ne
 * devine donc pas, on mesure.
 *
 * Le script signe une vraie vidéo avec les variantes candidates et demande au
 * CDN laquelle il accepte. Il ne modifie rien, ni en base ni chez Bunny.
 *
 *   export BUNNY_TOKEN_KEY="…"          # clé de la pull zone, jamais versionnée
 *   node scripts/bunny-signature.mjs    # éprouve sur un chapitre par défaut
 *   node scripts/bunny-signature.mjs https://vz-….b-cdn.net/<id>/playlist.m3u8
 *
 * La clé reste sur votre poste : elle n'est ni affichée, ni écrite, ni
 * transmise ailleurs qu'à bunny.net.
 *
 * ⚠️ À lancer APRÈS avoir activé « Token Authentication » sur la pull zone —
 * tant qu'elle est inactive, Bunny sert le fichier quelle que soit la
 * signature, et le script ne peut donc rien départager. Il le détecte et le
 * dit.
 */

import { createHmac } from 'node:crypto';

const CLE = process.env.BUNNY_TOKEN_KEY;
const URL_VIDEO =
  process.argv[2] ??
  'https://vz-8e333926-6ea.b-cdn.net/06b39366-0b6f-4eb2-95f9-8cdf221aaf17/playlist.m3u8';

// Le CDN exige un Referer (réglage « Block direct url file access ») : sans
// lui, TOUTES les variantes échoueraient et le test ne dirait rien.
const REFERER = 'https://tradingcorp.fr/';

if (!CLE) {
  console.error('BUNNY_TOKEN_KEY absente.');
  console.error('Bunny → CDN → pull zone « vz-8e333926-6ea » → Security → Token');
  console.error('Authentication. La clé est « URL Token Authentication Key », affichée');
  console.error('une fois le réglage activé. Ce n’est PAS la clé API de la bibliothèque');
  console.error('Stream, et le réglage n’est pas dans Stream → Security.');
  console.error('  export BUNNY_TOKEN_KEY="…"');
  process.exit(1);
}

const base64url = (buf) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const signer = (message) =>
  `HS256-${base64url(createHmac('sha256', CLE).update(message).digest())}`;

/**
 * Les formules plausibles, du plus probable au moins. Chacune ne diffère que
 * par ce qui entre dans le message signé — l'URL produite, elle, est toujours
 * la même forme « token dans le chemin », seule compatible avec les URLs
 * relatives d'une playlist HLS.
 */
const VARIANTES = [
  {
    nom: 'A · token_path signé, valeur brute (implémentation de référence)',
    message: (rep, exp) => `${rep}${exp}token_path=${rep}`,
  },
  {
    nom: 'B · token_path signé, valeur encodée',
    message: (rep, exp) => `${rep}${exp}token_path=${encodeURIComponent(rep)}`,
  },
  {
    nom: 'C · token_path non signé (lecture littérale de la documentation)',
    message: (rep, exp) => `${rep}${exp}`,
  },
];

const url = new URL(URL_VIDEO);
const repertoire = url.pathname.replace(/[^/]*$/, '');
const expires = Math.floor(Date.now() / 1000) + 3600;

function urlSignee(jeton) {
  const parametres = `&token_path=${encodeURIComponent(repertoire)}`;
  return `${url.origin}/bcdn_token=${jeton}${parametres}&expires=${expires}${url.pathname}`;
}

async function statut(adresse) {
  try {
    const reponse = await fetch(adresse, { headers: { Referer: REFERER } });
    return reponse.status;
  } catch (erreur) {
    return `réseau injoignable (${erreur.message})`;
  }
}

console.log(`Vidéo éprouvée : ${url.pathname}`);
console.log(`Répertoire signé : ${repertoire}\n`);

// Témoin : si l'URL NUE passe encore, le token n'est pas armé côté Bunny et
// aucun résultat ci-dessous n'a de valeur — tout passerait, y compris le faux.
const nue = await statut(URL_VIDEO);
if (nue === 200) {
  console.log('⚠️  L’URL NUE répond 200 : « Token Authentication » n’est pas activée');
  console.log('    sur la pull zone. Activez-la, puis relancez — sans quoi ce test');
  console.log('    valide n’importe quelle signature, y compris une fausse.\n');
}

// Contrôle négatif : une signature délibérément fausse DOIT être refusée.
const faux = await statut(urlSignee('HS256-signatureDelibrementFausse'));
console.log(`Contrôle négatif (signature fausse) : HTTP ${faux}${faux === 403 ? ' ✔' : ' ✖'}\n`);

let gagnante = null;
for (const variante of VARIANTES) {
  const code = await statut(urlSignee(signer(variante.message(repertoire, expires))));
  const verdict = code === 200 ? '✔ ACCEPTÉE' : `✖ refusée (HTTP ${code})`;
  console.log(`${verdict}  ${variante.nom}`);
  if (code === 200 && !gagnante) {
    gagnante = variante;
  }
}

console.log('');
if (!gagnante) {
  if (faux === 404) {
    // 404 et non 403 : le CDN n'a pas reconnu le préfixe `/bcdn_token=…/`, il
    // l'a pris pour un vrai répertoire. Le réglage n'est donc pas actif — la
    // clé, juste ou fausse, n'y est pour rien.
    console.log('Toutes les variantes rendent 404, y compris la signature volontairement');
    console.log('fausse : le CDN lit « /bcdn_token=… » comme un répertoire ordinaire.');
    console.log('« Token Authentication » n’est pas activée.');
    console.log('');
    console.log('  Bunny → CDN → pull zone « vz-8e333926-6ea » → Security');
    console.log('  (depuis Stream : bibliothèque → API → Pull Zone → Manage)');
    console.log('');
    console.log('Activez le réglage, copiez « URL Token Authentication Key », relancez.');
  } else {
    console.log('Aucune variante acceptée alors que le réglage semble actif : la clé');
    console.log('n’est probablement pas celle de CETTE pull zone (vz-8e333926-6ea).');
  }
  process.exit(1);
}
if (nue === 200 || faux === 200) {
  console.log('Résultat NON CONCLUANT : le CDN accepte aussi ce qu’il devrait refuser.');
  process.exit(1);
}
console.log(`Variante à retenir : ${gagnante.nom}`);
console.log('C’est celle qu’implémente supabase/functions/_partages/bunny.ts (variante A).');
console.log('Si une AUTRE variante l’emporte, dites-le — la fonction doit être alignée.');
