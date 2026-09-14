import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1';
// `import type` et non un import ordinaire : `Vendeur` est une interface, elle
// n'existe pas à l'exécution. Le dire explicitement évite de charger le module
// pour rien, et rend `facture.ts` lisible par l'aperçu hors Deno.
import type { Vendeur } from './vendeur.ts';

/**
 * Facture TradingCorp — composée nativement en PDF, comme le diplôme.
 *
 * Une facture n'est pas un objet de communication : elle se lit, s'archive et
 * se contrôle. La mise en page est donc sobre et dense, à l'opposé du diplôme.
 * Ce qui compte ici est que chaque mention imposée soit présente et trouvable :
 * numéro, dates, identités, désignation, décompte, total, régime de TVA.
 */

const PAGE = { largeur: 595.28, hauteur: 841.89 }; // A4 portrait
const MARGE = 56;

const ENCRE = rgb(0.13, 0.14, 0.22);
const ENCRE_DOUCE = rgb(0.42, 0.44, 0.52);
const TRAIT = rgb(0.85, 0.86, 0.9);
const ACCENT = rgb(0.62, 0.494, 0.106);
const ESSAI = rgb(0.85, 0.3, 0.35);

interface Polices {
  corps: PDFFont;
  gras: PDFFont;
}

export interface DonneesFacture {
  numero: string;
  /** ISO — date d'émission, celle qui fait foi pour la numérotation. */
  dateEmission: string;
  designation: string;
  montantCentimes: number;
  devise: string;
  clientNom: string | null;
  clientEmail: string | null;
  /** Moyen et date du règlement, quand ils sont connus. */
  moyenPaiement: string | null;
  datePaiement: string | null;
  /** Paiement de recette : le document doit le dire, sans ambiguïté possible. */
  modeTest: boolean;
}

/** « 13 septembre 2026 ». */
function enToutesLettres(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** 99700 → « 997,00 € ». Le montant est stocké en centimes, jamais en flottant. */
function montant(centimes: number, devise: string): string {
  const symbole = devise.toLowerCase() === 'eur' ? '€' : devise.toUpperCase();
  return `${(centimes / 100).toFixed(2).replace('.', ',')} ${symbole}`;
}

/**
 * Caractères que WinAnsi accepte au-delà du latin-1 — la part « haute » de
 * CP1252 : guillemets typographiques, tirets, euro, œ, ligatures.
 */
const WINANSI_EN_PLUS = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split(''));

/**
 * Rend un texte écrivable par une police standard de PDF.
 *
 * LES POLICES STANDARD ÉCRIVENT EN WINANSI (CP1252), et pdf-lib refuse le
 * document entier plutôt que d'écrire un caractère qu'il ne sait pas encoder.
 * Un seul suffit : « WinAnsi cannot encode "‎" (0x200e) » — une marque
 * gauche-à-droite invisible, arrivée par copier-coller dans un champ « nom ».
 *
 * Ce n'est pas une précaution théorique. Le nom du client est FIGÉ sur la
 * facture, tel qu'il a été saisi : un emoji, un prénom en arabe ou en
 * mandarin, une espace insécable exotique — et la composition échoue. Comme
 * `emettreFacture` avale ses erreurs pour ne jamais faire rejouer le webhook,
 * l'échec serait silencieux : paiement encaissé, accès ouvert, aucune facture.
 *
 * Le parti pris est donc d'écrire un document RÉGULIER plutôt que rien. Les
 * caractères inconnus sont retirés, la normalisation NFC recompose au passage
 * les accents décomposés (« e » + accent combinant devient « é », que WinAnsi
 * connaît). Si le nom disparaît entièrement, l'appelant retombe sur « Client »
 * — une facture au nom générique reste une facture, et l'adresse électronique
 * du client y figure juste en dessous.
 */
function lisible(contenu: string): string {
  return contenu
    .normalize('NFC')
    .replace(/[^\u0020-\u007e\u00a0-\u00ff]/gu, (caractere) =>
      WINANSI_EN_PLUS.has(caractere) ? caractere : '',
    )
    .trim();
}

function texte(
  page: PDFPage,
  contenu: string,
  x: number,
  y: number,
  police: PDFFont,
  taille: number,
  couleur = ENCRE,
): void {
  page.drawText(lisible(contenu), { x, y, size: taille, font: police, color: couleur });
}

/** Texte aligné à droite sur l'axe `x`. */
function aDroite(
  page: PDFPage,
  contenu: string,
  x: number,
  y: number,
  police: PDFFont,
  taille: number,
  couleur = ENCRE,
): void {
  // Mesuré sur le texte assaini, et pas sur l'original : `widthOfTextAtSize`
  // lève sur les mêmes caractères que `drawText`, et une largeur calculée sur
  // une chaîne plus longue décalerait l'alignement à droite.
  const largeur = police.widthOfTextAtSize(lisible(contenu), taille);
  texte(page, contenu, x - largeur, y, police, taille, couleur);
}

function filet(page: PDFPage, y: number, couleur = TRAIT): void {
  page.drawLine({
    start: { x: MARGE, y },
    end: { x: PAGE.largeur - MARGE, y },
    thickness: 0.75,
    color: couleur,
  });
}

/** En-tête : émetteur à gauche, nature du document à droite. */
function entete(page: PDFPage, p: Polices, v: Vendeur, f: DonneesFacture): number {
  let y = PAGE.hauteur - MARGE;

  texte(page, 'TRADINGCORP', MARGE, y - 14, p.gras, 16, ACCENT);
  aDroite(page, 'FACTURE', PAGE.largeur - MARGE, y - 12, p.gras, 20);

  y -= 38;
  aDroite(page, `N° ${f.numero}`, PAGE.largeur - MARGE, y, p.gras, 10);
  y -= 14;
  aDroite(
    page,
    `Émise le ${enToutesLettres(f.dateEmission)}`,
    PAGE.largeur - MARGE,
    y,
    p.corps,
    9,
    ENCRE_DOUCE,
  );

  // Coordonnées de l'émetteur, sous le nom.
  let yg = PAGE.hauteur - MARGE - 34;
  for (const ligne of [
    v.denomination,
    v.forme,
    ...v.adresse,
    `SIRET ${v.siret}`,
    v.email,
    v.telephone ?? '',
  ]) {
    if (!ligne) continue;
    texte(page, ligne, MARGE, yg, p.corps, 9, ENCRE_DOUCE);
    yg -= 12;
  }

  return Math.min(y, yg) - 24;
}

/** À qui la prestation est facturée. */
function client(page: PDFPage, p: Polices, f: DonneesFacture, y: number): number {
  texte(page, 'FACTURÉ À', MARGE, y, p.gras, 8, ENCRE_DOUCE);
  y -= 16;
  texte(page, f.clientNom?.trim() || 'Client', MARGE, y, p.gras, 11);
  if (f.clientEmail) {
    y -= 13;
    texte(page, f.clientEmail, MARGE, y, p.corps, 9, ENCRE_DOUCE);
  }
  return y - 30;
}

/** Le décompte : une ligne de prestation, son prix, le total. */
function decompte(page: PDFPage, p: Polices, f: DonneesFacture, y: number): number {
  const colQuantite = PAGE.largeur - MARGE - 190;
  const colPrix = PAGE.largeur - MARGE - 95;
  const colTotal = PAGE.largeur - MARGE;

  filet(page, y + 14);
  texte(page, 'DÉSIGNATION', MARGE, y, p.gras, 8, ENCRE_DOUCE);
  aDroite(page, 'QTÉ', colQuantite, y, p.gras, 8, ENCRE_DOUCE);
  aDroite(page, 'PRIX UNITAIRE', colPrix, y, p.gras, 8, ENCRE_DOUCE);
  aDroite(page, 'TOTAL', colTotal, y, p.gras, 8, ENCRE_DOUCE);
  y -= 10;
  filet(page, y);

  y -= 22;
  texte(page, f.designation, MARGE, y, p.corps, 10);
  aDroite(page, '1', colQuantite, y, p.corps, 10);
  aDroite(page, montant(f.montantCentimes, f.devise), colPrix, y, p.corps, 10);
  aDroite(page, montant(f.montantCentimes, f.devise), colTotal, y, p.corps, 10);

  y -= 18;
  filet(page, y);

  // Total. Pas de ligne de TVA : la franchise en base rend le HT égal au TTC,
  // et afficher « TVA 0 % » laisserait croire à une exonération, ce qui n'est
  // pas la même chose.
  y -= 24;
  aDroite(page, 'TOTAL À PAYER', colPrix, y, p.gras, 10);
  aDroite(page, montant(f.montantCentimes, f.devise), colTotal, y, p.gras, 12, ACCENT);

  return y - 34;
}

/** Ce qui reste à dire : régime de TVA, règlement, avertissement de recette. */
function mentions(page: PDFPage, p: Polices, f: DonneesFacture, v: Vendeur, y: number): void {
  texte(page, v.mentionTva, MARGE, y, p.corps, 9, ENCRE_DOUCE);
  y -= 16;

  if (f.datePaiement) {
    const moyen = f.moyenPaiement ? ` par ${f.moyenPaiement}` : '';
    texte(
      page,
      `Réglée le ${enToutesLettres(f.datePaiement)}${moyen}.`,
      MARGE,
      y,
      p.corps,
      9,
      ENCRE_DOUCE,
    );
    y -= 16;
  }

  if (f.modeTest) {
    texte(page, 'DOCUMENT DE TEST — aucun paiement réel', MARGE, y, p.gras, 10, ESSAI);
    y -= 16;
  }

  // Pied de page, à distance fixe du bas : il ne suit pas le contenu.
  const bas = MARGE + 8;
  filet(page, bas + 26);
  texte(
    page,
    `${v.denomination} — ${v.forme} — SIRET ${v.siret}`,
    MARGE,
    bas + 10,
    p.corps,
    8,
    ENCRE_DOUCE,
  );
  aDroite(page, f.numero, PAGE.largeur - MARGE, bas + 10, p.corps, 8, ENCRE_DOUCE);
}

/** Compose la facture et rend les octets du PDF. */
export async function composer(v: Vendeur, f: DonneesFacture): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`Facture ${f.numero}`);
  document.setProducer('TradingCorp');
  document.setCreationDate(new Date(f.dateEmission));

  const page = document.addPage([PAGE.largeur, PAGE.hauteur]);
  const polices: Polices = {
    corps: await document.embedFont(StandardFonts.Helvetica),
    gras: await document.embedFont(StandardFonts.HelveticaBold),
  };

  let y = entete(page, polices, v, f);
  y = client(page, polices, f, y);
  y = decompte(page, polices, f, y);
  mentions(page, polices, f, v, y);

  return await document.save();
}
