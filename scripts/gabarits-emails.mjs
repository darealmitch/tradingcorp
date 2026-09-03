#!/usr/bin/env node
/**
 * Synchronise les gabarits d'e-mails d'authentification entre le dépôt et la
 * console Supabase.
 *
 * Le corps ET l'objet de ces messages vivent dans la configuration Auth du
 * projet, hors du dépôt. Tant qu'on les recopie à la main, les deux versions
 * divergent sans prévenir — c'est arrivé le 3 septembre 2026 : la console
 * servait encore un gabarit de réinitialisation périmé, avec un lien, pendant
 * que le dépôt portait la version à code ; et les quatre objets étaient restés
 * à l'anglais d'origine de Supabase.
 *
 *   node scripts/gabarits-emails.mjs             compare, ne modifie rien
 *   node scripts/gabarits-emails.mjs --publier   pousse le dépôt vers Supabase
 *
 * Jeton personnel : https://supabase.com/dashboard/account/tokens
 *   export SUPABASE_ACCESS_TOKEN="sbp_…"
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REF = process.env.SUPABASE_PROJECT_REF ?? 'swzjzwymzjhdatcobibs';
const JETON = process.env.SUPABASE_ACCESS_TOKEN;
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;

const DOSSIER = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'gabarits-emails');

/**
 * Chaque gabarit occupe deux champs de la configuration Auth. Ces noms
 * viennent de l'API Management ; ils ne se devinent pas, et une faute de
 * frappe passerait inaperçue — l'API ignore en silence un champ inconnu.
 */
const GABARITS = [
  {
    fichier: 'reinitialisation-mot-de-passe.html',
    champObjet: 'mailer_subjects_recovery',
    champCorps: 'mailer_templates_recovery_content',
  },
  {
    fichier: 'invitation.html',
    champObjet: 'mailer_subjects_invite',
    champCorps: 'mailer_templates_invite_content',
  },
  {
    fichier: 'confirmation-inscription.html',
    champObjet: 'mailer_subjects_confirmation',
    champCorps: 'mailer_templates_confirmation_content',
  },
  {
    fichier: 'changement-email.html',
    champObjet: 'mailer_subjects_email_change',
    champCorps: 'mailer_templates_email_change_content',
  },
];

/**
 * L'en-tête de commentaire porte l'objet et le mode d'emploi du collage
 * manuel. Il ne part pas chez les destinataires : rien n'oblige une cliente
 * qui affiche la source du message à y lire nos notes internes.
 */
const EN_TETE = /^<!doctype html>\n<!--[\s\S]*?-->\n/;

function objetDe(html, fichier) {
  const trouve = html.match(/Objet\s*:\s*(.+?)\s*-->/);
  if (!trouve) {
    throw new Error(`${fichier} : aucune ligne « Objet : … » dans l'en-tête de commentaire.`);
  }
  return trouve[1].trim();
}

function corpsDe(html) {
  return html.replace(EN_TETE, '<!doctype html>\n').trim();
}

/** Situe le premier écart sans déverser cinq kilo-octets de HTML. */
function premierEcart(attendu, enLigne) {
  const n = Math.min(attendu.length, enLigne.length);
  let i = 0;
  while (i < n && attendu[i] === enLigne[i]) i++;
  const ligne = attendu.slice(0, i).split('\n').length;
  return `ligne ${ligne} — dépôt « ${attendu.slice(i, i + 42)}… » / en ligne « ${enLigne.slice(i, i + 42)}… »`;
}

async function configuration() {
  const reponse = await fetch(API, { headers: { Authorization: `Bearer ${JETON}` } });
  if (!reponse.ok) {
    throw new Error(`GET ${reponse.status} ${reponse.statusText} — ${await reponse.text()}`);
  }
  return reponse.json();
}

async function publier(charge) {
  const reponse = await fetch(API, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${JETON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(charge),
  });
  if (!reponse.ok) {
    throw new Error(`PATCH ${reponse.status} ${reponse.statusText} — ${await reponse.text()}`);
  }
  return reponse.json();
}

async function principal() {
  const doitPublier = process.argv.includes('--publier');

  if (!JETON) {
    console.error(
      'SUPABASE_ACCESS_TOKEN absent.\n' +
        'Crée un jeton sur https://supabase.com/dashboard/account/tokens, puis :\n' +
        '  export SUPABASE_ACCESS_TOKEN="sbp_…"',
    );
    process.exit(2);
  }

  const attendus = [];
  for (const gabarit of GABARITS) {
    const html = await readFile(join(DOSSIER, gabarit.fichier), 'utf8');
    attendus.push({ ...gabarit, objet: objetDe(html, gabarit.fichier), corps: corpsDe(html) });
  }

  const enLigne = await configuration();
  const ecarts = [];

  for (const g of attendus) {
    const objetEnLigne = enLigne[g.champObjet] ?? '';
    const corpsEnLigne = (enLigne[g.champCorps] ?? '').trim();
    const objetOk = objetEnLigne === g.objet;
    const corpsOk = corpsEnLigne === g.corps;

    console.log(`\n${g.fichier}`);
    console.log(`  objet  ${objetOk ? '=' : '≠'} « ${objetEnLigne || '(vide)'} »`);
    if (!objetOk) console.log(`         dépôt : « ${g.objet} »`);
    console.log(
      `  corps  ${corpsOk ? '=' : '≠'} ${corpsEnLigne.length} octets en ligne, ${g.corps.length} au dépôt`,
    );
    if (!corpsOk && corpsEnLigne) console.log(`         ${premierEcart(g.corps, corpsEnLigne)}`);

    if (!objetOk || !corpsOk) ecarts.push(g);
  }

  if (ecarts.length === 0) {
    console.log('\nLa console est conforme au dépôt.');
    return;
  }

  if (!doitPublier) {
    console.log(
      `\n${ecarts.length} gabarit(s) divergent. Pour aligner la console sur le dépôt :\n` +
        '  node scripts/gabarits-emails.mjs --publier',
    );
    process.exit(1);
  }

  // PATCH partiel : seuls les champs envoyés changent, le reste de la
  // configuration Auth — fournisseurs, durées de session, SMTP — est intact.
  const charge = {};
  for (const g of ecarts) {
    charge[g.champObjet] = g.objet;
    charge[g.champCorps] = g.corps;
  }

  console.log(`\nPublication de ${Object.keys(charge).length} champs…`);
  await publier(charge);

  // On relit plutôt que de croire le 200 : l'API ignore en silence un nom de
  // champ inconnu, et le succès porterait alors sur rien.
  const relu = await configuration();
  const restants = ecarts.filter(
    (g) => relu[g.champObjet] !== g.objet || (relu[g.champCorps] ?? '').trim() !== g.corps,
  );

  if (restants.length > 0) {
    console.error(
      `\nÉchec : ${restants.map((g) => g.fichier).join(', ')} n'ont pas été enregistrés.`,
    );
    process.exit(1);
  }
  console.log('Vérifié après écriture : la console est conforme au dépôt.');
}

principal().catch((erreur) => {
  console.error(`\n${erreur.message}`);
  process.exit(1);
});
