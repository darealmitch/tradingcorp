/**
 * Identité du vendeur, telle qu'elle doit figurer sur une facture.
 *
 * Rassemblée ici plutôt que dispersée dans la composition du document : ces
 * mentions sont imposées (arrêté du 3 octobre 1983 pour la note de prestation
 * de services, article 242 nonies A de l'annexe II au CGI pour la facture), et
 * une seule oubliée suffit à rendre le document irrégulier.
 *
 * L'ADRESSE ET LE TÉLÉPHONE VIENNENT DE L'ENVIRONNEMENT, le reste est en
 * constantes. Ce n'est pas une question de secret — une adresse d'entreprise
 * est publique, elle figure d'ailleurs dans les mentions légales — mais de
 * disponibilité : ces deux valeurs n'étaient pas encore arrêtées quand la
 * facturation a été écrite. Les poser en variables évite un redéploiement le
 * jour où elles le seront.
 */

export interface Vendeur {
  denomination: string;
  forme: string;
  adresse: string[];
  siret: string;
  email: string;
  telephone: string | null;
  mentionTva: string;
}

/** Séparateur des lignes d'adresse dans `VENDEUR_ADRESSE`. */
const SEPARATEUR_LIGNES = '|';

/**
 * Rend l'identité du vendeur, ou `null` si une mention obligatoire manque.
 *
 * Le null est volontaire, et il est traité en amont : une facture incomplète
 * vaut moins que pas de facture du tout, parce qu'elle donne l'illusion d'être
 * en règle. L'appelant journalise et poursuit — **le paiement et l'ouverture
 * de l'accès ne doivent jamais dépendre de la facturation**.
 */
export function vendeur(): Vendeur | null {
  const adresse = (Deno.env.get('VENDEUR_ADRESSE') ?? '')
    .split(SEPARATEUR_LIGNES)
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  if (adresse.length === 0) {
    return null;
  }

  return {
    denomination: 'Keryan André — TradingCorp',
    forme: 'Entrepreneur individuel (EI)',
    adresse,
    siret: '909 608 697 00019',
    email: 'contact@tradingcorp.fr',
    telephone: Deno.env.get('VENDEUR_TELEPHONE')?.trim() || null,
    // Franchise en base : la formation est facturée sans TVA, et l'absence de
    // cette mention exposerait à un rappel.
    mentionTva: 'TVA non applicable — article 293 B du Code général des impôts',
  };
}
