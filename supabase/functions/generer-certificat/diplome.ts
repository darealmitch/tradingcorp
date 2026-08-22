import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'npm:pdf-lib@1';

/**
 * Diplôme TradingCorp — composé NATIVEMENT en PDF.
 *
 * Tout ce que porte ce document est dessiné ici : cadre, sceau, filigrane,
 * typographie. Aucune image de fond, donc aucun texte à recouvrir et aucune
 * trace d'un document antérieur. Le fichier naît pour son titulaire.
 *
 * Le design suit celui du diplôme de référence — double cadre doré à pans
 * coupés, sceau en haut à droite, titre en romain italique, mention, nom en
 * capitales dorées, paragraphe d'attestation, signature du président. Les
 * proportions sont transposées à l'A4 paysage, format d'impression d'un
 * diplôme.
 */

const PAGE = { largeur: 841.89, hauteur: 595.28 };

/** Palette relevée sur le diplôme d'origine. */
const OR = rgb(0.62, 0.494, 0.106); // 158,126,27 — le doré du nom
const OR_CLAIR = rgb(0.78, 0.66, 0.36);
const OR_SOMBRE = rgb(0.51, 0.39, 0.09);
const ENCRE = rgb(0.13, 0.14, 0.22);
const ENCRE_DOUCE = rgb(0.32, 0.34, 0.42);
const FILIGRANE = rgb(0.976, 0.979, 0.985);
const BLANC = rgb(1, 1, 1);

interface Polices {
  titre: PDFFont;
  corps: PDFFont;
  gras: PDFFont;
}

export interface Titulaire {
  prenom: string;
  nom: string;
  date_naissance: string | null;
}

/** « 19 septembre 2024 » — la forme du diplôme de référence. */
function enToutesLettres(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Texte centré sur un axe vertical. */
function centre(
  page: PDFPage,
  texte: string,
  x: number,
  y: number,
  police: PDFFont,
  taille: number,
  couleur = ENCRE,
) {
  const largeur = police.widthOfTextAtSize(texte, taille);
  page.drawText(texte, { x: x - largeur / 2, y, size: taille, font: police, color: couleur });
}

/**
 * Texte centré dont la taille se réduit jusqu'à tenir dans la largeur donnée.
 *
 * Un diplôme ne tronque pas le nom de son titulaire : c'est la fonte qui cède,
 * pas le nom. « Jean-Christophe de la Rochefoucauld-Montmorency » entre ainsi
 * sans jamais toucher le cadre.
 */
function centreAjuste(
  page: PDFPage,
  texte: string,
  x: number,
  y: number,
  police: PDFFont,
  taille: number,
  largeurMax: number,
  couleur = ENCRE,
) {
  let t = taille;
  while (police.widthOfTextAtSize(texte, t) > largeurMax && t > 9) {
    t -= 0.5;
  }
  centre(page, texte, x, y, police, t, couleur);
}

/** Capitales espacées — le lettrage des mentions et du logo. */
function centreEspace(
  page: PDFPage,
  texte: string,
  x: number,
  y: number,
  police: PDFFont,
  taille: number,
  interlettre: number,
  couleur = ENCRE,
) {
  const lettres = [...texte];
  const largeur =
    lettres.reduce((total, l) => total + police.widthOfTextAtSize(l, taille), 0) +
    interlettre * (lettres.length - 1);
  let curseur = x - largeur / 2;
  for (const lettre of lettres) {
    page.drawText(lettre, { x: curseur, y, size: taille, font: police, color: couleur });
    curseur += police.widthOfTextAtSize(lettre, taille) + interlettre;
  }
}

/**
 * Fond : blanc, animé de facettes à peine perceptibles.
 *
 * Le diplôme d'origine porte un moirage géométrique. Les facettes sont ici
 * cantonnées À L'INTÉRIEUR du cadre et posées dans un gris très proche du
 * blanc : un premier essai plus contrasté et débordant du cadre donnait
 * l'impression d'une impression ratée, pas d'un papier travaillé.
 */
function filigrane(page: PDFPage) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width: PAGE.largeur,
    height: PAGE.hauteur,
    color: BLANC,
  });

  // Coordonnées exprimées depuis le HAUT de la page (repère de drawSvgPath),
  // toutes contenues entre les deux filets du cadre.
  const facettes = [
    'M 40 40 L 250 40 L 90 300 Z',
    'M 802 555 L 802 300 L 600 555 Z',
    'M 40 555 L 190 555 L 40 380 Z',
    'M 802 40 L 802 190 L 640 40 Z',
  ];
  for (const facette of facettes) {
    page.drawSvgPath(facette, { y: PAGE.hauteur, color: FILIGRANE, borderWidth: 0 });
  }
}

/**
 * Double cadre doré à pans coupés.
 *
 * Tracé en chemin fermé plutôt qu'en quatre traits : les angles se rejoignent
 * exactement, ce qu'un assemblage de segments ne garantit pas.
 */
function cadre(page: PDFPage) {
  const octogone = (marge: number, coupe: number) => {
    const g = marge;
    const d = PAGE.largeur - marge;
    // drawSvgPath place l'origine en haut à gauche : les Y sont donc exprimés
    // depuis le haut de la page.
    const yh = marge;
    const yb = PAGE.hauteur - marge;
    return [
      `M ${g + coupe} ${yh}`,
      `L ${d - coupe} ${yh}`,
      `L ${d} ${yh + coupe}`,
      `L ${d} ${yb - coupe}`,
      `L ${d - coupe} ${yb}`,
      `L ${g + coupe} ${yb}`,
      `L ${g} ${yb - coupe}`,
      `L ${g} ${yh + coupe}`,
      'Z',
    ].join(' ');
  };

  page.drawSvgPath(octogone(24, 26), { y: PAGE.hauteur, borderColor: OR, borderWidth: 2.2 });
  page.drawSvgPath(octogone(33, 20), { y: PAGE.hauteur, borderColor: OR_CLAIR, borderWidth: 0.8 });
}

/**
 * Sceau doré.
 *
 * Composé de trois couches : une collerette dentelée, le disque, puis un
 * anneau intérieur et une étoile. Les tons alternent du sombre au clair pour
 * suggérer le relief d'un cachet de cire, sans dégradé — le PDF n'en propose
 * pas nativement, et un aplat bien choisi vaut mieux qu'un dégradé simulé.
 */
function sceau(page: PDFPage, cx: number, cy: number, rayon: number) {
  // Collerette : des dents fines et nombreuses lisent comme un feston de cire.
  // Un premier essai à douze grosses dents évoquait une capsule de bouteille.
  const dents = 34;
  for (let i = 0; i < dents; i++) {
    const angle = (i / dents) * Math.PI * 2;
    page.drawCircle({
      x: cx + Math.cos(angle) * rayon * 0.96,
      y: cy + Math.sin(angle) * rayon * 0.96,
      size: rayon * 0.1,
      color: i % 2 === 0 ? OR : OR_SOMBRE,
    });
  }

  page.drawCircle({ x: cx, y: cy, size: rayon * 0.93, color: OR_SOMBRE });
  page.drawCircle({ x: cx, y: cy, size: rayon * 0.84, color: OR });
  // Deux anneaux plutôt qu'un : c'est ce jeu de cernes qui donne au disque son
  // épaisseur, faute de dégradé disponible en PDF natif.
  page.drawCircle({ x: cx, y: cy, size: rayon * 0.7, borderColor: OR_CLAIR, borderWidth: 1.2 });
  page.drawCircle({ x: cx, y: cy, size: rayon * 0.63, borderColor: OR_SOMBRE, borderWidth: 0.6 });

  // Étoile à cinq branches, tracée point par point : un caractère typographique
  // ne serait pas garanti présent dans l'encodage des polices standard.
  const branches: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rayon * 0.4 : rayon * 0.16;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * r;
    const y = PAGE.hauteur - (cy + Math.sin(a) * r);
    branches.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }
  page.drawSvgPath(branches.join(' ') + ' Z', { y: PAGE.hauteur, color: OR_CLAIR, borderWidth: 0 });
}

/** Filet décoratif — sous le titre, et au-dessus de la signature. */
function filet(page: PDFPage, x: number, y: number, largeur: number) {
  page.drawLine({
    start: { x: x - largeur / 2, y },
    end: { x: x + largeur / 2, y },
    thickness: 0.8,
    color: OR_CLAIR,
  });
}

/**
 * Compose le diplôme.
 *
 * Toutes les données viennent du profil du titulaire ; aucune valeur n'est
 * écrite en dur dans le document.
 */
export async function composer(
  titulaire: Titulaire,
  formation: string,
  dateObtention: string,
  numero: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const nomComplet = `${titulaire.prenom} ${titulaire.nom}`.trim();

  pdf.setTitle(`Certificat de fin de programme — ${nomComplet}`);
  pdf.setSubject(formation);
  pdf.setAuthor('TradingCorp');
  pdf.setProducer('TradingCorp');
  pdf.setCreator('TradingCorp');

  const polices: Polices = {
    titre: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    corps: await pdf.embedFont(StandardFonts.Helvetica),
    gras: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  const page = pdf.addPage([PAGE.largeur, PAGE.hauteur]);
  const axe = PAGE.largeur / 2;

  filigrane(page);
  cadre(page);
  sceau(page, 722, 466, 42);

  // ===== En-tête =====
  page.drawText(enToutesLettres(dateObtention), {
    x: 70,
    y: 528,
    size: 10.5,
    font: polices.corps,
    color: ENCRE_DOUCE,
  });
  const marque = 'Trading corp';
  page.drawText(marque, {
    x: 640 - polices.corps.widthOfTextAtSize(marque, 10.5),
    y: 528,
    size: 10.5,
    font: polices.corps,
    color: ENCRE_DOUCE,
  });

  // ===== Titre =====
  centre(page, 'Certificat de fin de programme', axe, 452, polices.titre, 32, ENCRE);
  filet(page, axe, 438, 210);

  // ===== Attribution =====
  centre(page, 'Ce certificat est décerné à', axe, 404, polices.corps, 12.5, ENCRE_DOUCE);

  // Le nom domine la page : c'est l'information que le document porte.
  centreAjuste(page, nomComplet.toUpperCase(), axe, 352, polices.gras, 40, 560, OR);

  if (titulaire.date_naissance) {
    // Distingue deux homonymes — un diplôme au nom de « Jean Martin » sans
    // date de naissance n'atteste de personne en particulier.
    centre(
      page,
      `né(e) le ${enToutesLettres(titulaire.date_naissance)}`,
      axe,
      331,
      polices.corps,
      10.5,
      ENCRE_DOUCE,
    );
  }

  centre(page, 'Pour avoir terminé le programme en ligne', axe, 300, polices.corps, 12.5, ENCRE);
  centreAjuste(page, formation, axe, 272, polices.gras, 19, 480, OR);

  // ===== Attestation =====
  const attestation = [
    'Ce document atteste que le programme a été suivi avec succès et que toutes les',
    "conditions requises ont été remplies. Le lauréat a fait preuve d'investissement et a",
    'acquis de nombreuses connaissances et compétences dans le cadre du programme.',
    'Ce diplôme vient témoigner du travail accompli et est le gage de sa réussite future.',
  ];
  attestation.forEach((ligne, i) => {
    centre(page, ligne, axe, 232 - i * 15, polices.corps, 9.8, ENCRE_DOUCE);
  });

  // ===== Pied =====
  centreEspace(page, 'TRADING CORP', 250, 120, polices.gras, 9, 2.6, OR_CLAIR);

  filet(page, 620, 138, 200);
  centre(page, 'Andre Keryan', 620, 122, polices.gras, 12, ENCRE);
  centre(page, 'Président', 620, 106, polices.corps, 9.5, ENCRE_DOUCE);

  // Le numéro rend le document vérifiable : c'est lui qu'un tiers saisira sur
  // la page publique de vérification.
  page.drawText(`Certificat n° ${numero}`, {
    x: 70,
    y: 62,
    size: 8.5,
    font: polices.corps,
    color: ENCRE_DOUCE,
  });

  return await pdf.save();
}
