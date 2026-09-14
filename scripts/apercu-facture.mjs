#!/usr/bin/env node
/**
 * Aperçu d'une facture, hors du serveur.
 *
 * `facture.ts` vit dans les Edge Functions et s'exécute sous Deno ; ce script
 * la rend contrôlable à l'œil depuis le poste, avant tout déploiement — le
 * même service que rend `diplome.ts` pour le certificat. La mise en page d'un
 * document légal ne se relit pas dans le code : il faut la voir.
 *
 *   node scripts/apercu-facture.mjs [chemin de sortie]
 *
 * Aucune duplication de logique : le module réel est recopié tel quel dans un
 * dossier temporaire, avec pour seule retouche le spécificateur `npm:` de Deno,
 * que Node ne comprend pas. Node lit le TypeScript nativement depuis la v23
 * (retrait des types à la volée), d'où l'import direct du `.ts`.
 */

import { mkdtemp, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RACINE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(RACINE, 'supabase', 'functions', '_partages');

const sortie = process.argv[2] ?? join(RACINE, 'apercu-facture.pdf');

const atelier = await mkdtemp(join(tmpdir(), 'apercu-facture-'));
await copyFile(join(SOURCES, 'vendeur.ts'), join(atelier, 'vendeur.ts'));
const module = (await readFile(join(SOURCES, 'facture.ts'), 'utf8')).replace(
  "from 'npm:pdf-lib@1'",
  // Le bundle d'un seul tenant, et non le dossier ni `es/` : Node refuse
  // l'import d'un répertoire, et le build `es/` utilise des imports sans
  // extension que la résolution ESM rejette.
  `from '${pathToFileURL(join(RACINE, 'node_modules', 'pdf-lib', 'dist', 'pdf-lib.esm.js')).href}'`,
);
await writeFile(join(atelier, 'facture.ts'), module);

const { composer } = await import(pathToFileURL(join(atelier, 'facture.ts')).href);

/** Jeu d'essai : le cas réel, avec l'adresse encore à arrêter. */
const identite = {
  denomination: 'Keryan André — TradingCorp',
  forme: 'Entrepreneur individuel (EI)',
  adresse: (process.env.VENDEUR_ADRESSE ?? '12 rue Exemple|75002 Paris|France').split('|'),
  siret: '909 608 697 00019',
  email: 'contact@tradingcorp.fr',
  telephone: process.env.VENDEUR_TELEPHONE ?? null,
  mentionTva: 'TVA non applicable — article 293 B du Code général des impôts',
};

const pdf = await composer(identite, {
  numero: 'F2026-0001',
  dateEmission: new Date().toISOString(),
  designation: 'Formation TradingCorp — accès complet',
  montantCentimes: 99700,
  devise: 'eur',
  clientNom: 'Jean Dupont',
  clientEmail: 'jean.dupont@exemple.fr',
  moyenPaiement: 'carte bancaire',
  datePaiement: new Date().toISOString(),
  modeTest: process.argv.includes('--test'),
});

await writeFile(sortie, pdf);
console.log(`Aperçu écrit : ${sortie} (${Math.round(pdf.length / 1024)} Ko)`);
