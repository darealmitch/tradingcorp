import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1';

/**
 * Le gabarit mesure 1127 × 794 px ; tous les repères ci-dessous sont exprimés
 * dans CE repère, tel que relevé au pixel sur le visuel fourni. Changer le
 * visuel sans conserver ces dimensions décalerait tous les champs.
 */
const GABARIT = { largeur: 1127, hauteur: 794 };

/**
 * Emplacement des champs, relevé au pixel sur le visuel d'origine avant que les
 * données d'exemple n'en soient retirées. `ligne_de_base` est la ligne sur
 * laquelle le texte repose, `taille` la hauteur de fonte correspondante.
 */
const CHAMPS = {
  date: { x: 98, ligne_de_base: 109, taille: 15 },
  nom: { centre_x: 567, ligne_de_base: 352, taille: 62, largeur_max: 820 },
  programme: { centre_x: 566, ligne_de_base: 442, taille: 28, largeur_max: 640 },
  naissance: { centre_x: 567, ligne_de_base: 374, taille: 15 },
  numero: { x: 98, ligne_de_base: 745, taille: 11 },
};

/** Or du diplôme, prélevé sur le nom d'origine (158, 126, 27). */
const OR = rgb(158 / 255, 126 / 255, 27 / 255);
/** Encre sombre des mentions secondaires. */
const ENCRE = rgb(0.16, 0.17, 0.25);

/** « 19 septembre 2024 » — la forme employée sur le diplôme de référence. */
function enToutesLettres(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface Titulaire {
  prenom: string;
  nom: string;
  date_naissance: string | null;
}

/**
 * Compose le PDF : le gabarit en fond, les données par-dessus.
 *
 * La page reprend exactement les proportions du visuel, à l'échelle A4 paysage
 * — c'est le format sur lequel un diplôme s'imprime.
 */
export async function composer(
  gabarit: Uint8Array,
  titulaire: Titulaire,
  formation: string,
  dateObtention: string,
  numero: string,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Certificat ${numero}`);
  pdf.setSubject(formation);
  pdf.setProducer('TradingCorp');

  const A4_PAYSAGE = { largeur: 841.89, hauteur: 595.28 };
  const echelle = A4_PAYSAGE.largeur / GABARIT.largeur;
  const hauteurVisuel = GABARIT.hauteur * echelle;
  // Le visuel est un peu moins haut qu'une A4 : on le centre plutôt que de le
  // déformer pour remplir la page.
  const margeBasse = (A4_PAYSAGE.hauteur - hauteurVisuel) / 2;

  const page = pdf.addPage([A4_PAYSAGE.largeur, A4_PAYSAGE.hauteur]);
  const fond = await pdf.embedJpg(gabarit);
  page.drawImage(fond, {
    x: 0,
    y: margeBasse,
    width: A4_PAYSAGE.largeur,
    height: hauteurVisuel,
  });

  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const normal = await pdf.embedFont(StandardFonts.Helvetica);

  /** Convertit une ligne de base du repère image vers celui du PDF. */
  const versY = (ligneDeBase: number) => margeBasse + hauteurVisuel - ligneDeBase * echelle;

  const ecrire = (
    texte: string,
    champ: {
      x?: number;
      centre_x?: number;
      ligne_de_base: number;
      taille: number;
      largeur_max?: number;
    },
    police: typeof gras,
    couleur: typeof OR,
  ) => {
    let taille = champ.taille * echelle;

    // Un nom long ne doit pas sortir du cadre doré. Plutôt que de le tronquer
    // — un diplôme ne coupe pas le nom de son titulaire — on réduit la fonte
    // jusqu'à ce qu'il tienne. « Jean-Christophe de la Rochefoucauld » entre
    // ainsi sans déborder, en restant lisible.
    if (champ.largeur_max) {
      const maximum = champ.largeur_max * echelle;
      while (police.widthOfTextAtSize(texte, taille) > maximum && taille > 8) {
        taille -= 0.5;
      }
    }

    const largeur = police.widthOfTextAtSize(texte, taille);
    const x =
      champ.centre_x !== undefined
        ? champ.centre_x * echelle - largeur / 2
        : (champ.x ?? 0) * echelle;
    page.drawText(texte, {
      x,
      y: versY(champ.ligne_de_base),
      size: taille,
      font: police,
      color: couleur,
    });
  };

  ecrire(enToutesLettres(dateObtention), CHAMPS.date, normal, ENCRE);
  ecrire(`${titulaire.prenom} ${titulaire.nom}`.trim(), CHAMPS.nom, gras, OR);
  ecrire(formation, CHAMPS.programme, gras, OR);

  // La date de naissance distingue deux homonymes : sans elle, un diplôme au
  // nom de « Jean Martin » n'atteste de rien. Discrète, sous le nom, elle ne
  // touche à aucun élément du visuel d'origine.
  if (titulaire.date_naissance) {
    ecrire(
      `né(e) le ${enToutesLettres(titulaire.date_naissance)}`,
      CHAMPS.naissance,
      normal,
      ENCRE,
    );
  }

  // Le numéro rend le document vérifiable : c'est lui qu'un tiers saisira sur
  // la page publique de vérification.
  ecrire(`Certificat n° ${numero}`, CHAMPS.numero, normal, ENCRE);

  return await pdf.save();
}
