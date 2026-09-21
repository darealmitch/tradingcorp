import { envoyer } from './courriel.ts';

/**
 * Confirmation de commande, envoyée après chaque encaissement.
 *
 * CE N'EST PAS LA FACTURE, et les deux ne se remplacent pas. La facture est
 * émise et envoyée par Stripe au paiement (Checkout, `invoice_creation`). Cette
 * confirmation-ci répond à une autre obligation : l'article L221-13 du Code de
 * la consommation impose de confirmer le contrat sur un support durable, en
 * reprenant les informations précontractuelles — au premier rang desquelles le
 * droit de rétractation. L'e-mail de Stripe ne les porte pas.
 *
 * RIEN ICI NE DOIT FAIRE ÉCHOUER L'APPELANT. Le webhook Stripe encaisse et ouvre
 * l'accès ; un échec d'envoi est journalisé, jamais propagé. Un webhook en
 * erreur serait rejoué par Stripe — pour un problème d'e-mail.
 */

export interface Commande {
  /** Ce qui a été vendu, tel que l'acheteur l'a vu au paiement. */
  designation: string;
  montantCentimes: number;
  devise: string;
  clientNom: string | null;
  clientEmail: string | null;
  /** Numéro de la facture Stripe, s'il est connu au moment de l'envoi. */
  numeroFacture: string | null;
  /**
   * Essai déclenché depuis l'écran Paramètres : même gabarit, même envoi, mais
   * un bandeau dit en tête qu'aucune vente n'a eu lieu.
   */
  essai?: boolean;
}

/**
 * Le nom de l'acheteur et l'intitulé de la formation viennent d'une saisie : on
 * les échappe avant de les écrire dans du HTML. Sans cela, un nom contenant une
 * balise pourrait glisser un lien dans un e-mail signé TradingCorp.
 */
function echapper(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** 99700 → « 997,00 € ». Le montant est stocké en centimes, jamais en flottant. */
function montant(centimes: number, devise: string): string {
  const symbole = devise.toLowerCase() === 'eur' ? '€' : devise.toUpperCase();
  return `${(centimes / 100).toFixed(2).replace('.', ',')} ${symbole}`;
}

/** Corps de la confirmation. Les mentions suivent les CGV, article par article. */
function corps(c: Commande, adresseSite: string): string {
  const facture = c.numeroFacture
    ? `n° ${echapper(c.numeroFacture)}, envoyée par un e-mail séparé`
    : 'envoyée par un e-mail séparé';
  const bandeauEssai = c.essai
    ? `<p style="padding:10px 14px;border:1px solid #d94d59;border-radius:8px;color:#b3303c">
    Ceci est un <strong>essai</strong> déclenché depuis l’écran Paramètres : aucune vente n’a eu
    lieu. Le message est en tout point celui que reçoit un acheteur.
  </p>`
    : '';

  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2233;max-width:620px">
  ${bandeauEssai}
  <p>Bonjour${c.clientNom ? ` ${echapper(c.clientNom)}` : ''},</p>

  <p>Votre commande est confirmée et votre accès est ouvert.</p>

  <table style="border-collapse:collapse;margin:20px 0;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Formation</td><td><strong>${echapper(c.designation)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Montant réglé</td><td><strong>${montant(c.montantCentimes, c.devise)}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Facture</td><td>${facture}</td></tr>
  </table>

  <p>
    Votre facture reste disponible à tout moment dans votre espace, rubrique
    <a href="${adresseSite}/espace/factures">Mes factures</a>.
  </p>

  <p>
    L'accès est personnel : il ne peut être partagé ni revendu, et les contenus
    ne peuvent être reproduits ou diffusés (article 10 des conditions générales
    de vente).
  </p>

  <h3 style="font-size:15px;margin:26px 0 8px">Votre droit de rétractation</h3>
  <p>
    Vous disposez de <strong>14 jours</strong> à compter d'aujourd'hui pour vous
    rétracter, sans motif ni frais, même si vous avez déjà commencé la formation :
    nous ne vous demandons pas d'y renoncer. Il vous suffit de nous adresser une
    déclaration dénuée d'ambiguïté à
    <a href="mailto:contact@tradingcorp.fr">contact@tradingcorp.fr</a> avant
    l'expiration du délai. Le remboursement intégral intervient au plus tard
    14 jours après réception de votre demande, par le même moyen de paiement.
  </p>
  <p style="font-size:13px;color:#6b6f80">
    Un formulaire type est à votre disposition en annexe des
    <a href="${adresseSite}/cgv">conditions générales de vente</a> ; son usage
    n'est pas obligatoire.
  </p>

  <h3 style="font-size:15px;margin:26px 0 8px">Garantie légale</h3>
  <p>
    La formation est un contenu numérique : elle est couverte par la garantie
    légale de conformité des articles L224-25-12 et suivants du Code de la
    consommation, indépendamment du droit de rétractation.
  </p>

  <p style="margin-top:26px">
    Les <a href="${adresseSite}/cgv">conditions générales de vente</a> applicables
    sont celles en vigueur au jour de votre commande. Pour toute question, écrivez-nous
    à <a href="mailto:contact@tradingcorp.fr">contact@tradingcorp.fr</a>.
  </p>

  <p style="margin-top:26px;color:#6b6f80;font-size:13px">TradingCorp</p>
</div>`.trim();
}

/**
 * La même confirmation, en texte brut.
 *
 * Écrite à la main plutôt que déduite du HTML en retirant les balises : les
 * liens y garderaient leur libellé et perdraient leur adresse, alors que c'est
 * l'adresse de rétractation et celle des CGV qui comptent ici.
 */
function texteBrut(c: Commande, adresseSite: string): string {
  const facture = c.numeroFacture
    ? `n° ${c.numeroFacture}, envoyée par un e-mail séparé`
    : 'envoyée par un e-mail séparé';
  return [
    ...(c.essai
      ? [
          'ESSAI — déclenché depuis l’écran Paramètres : aucune vente n’a eu lieu.',
          'Le message est en tout point celui que reçoit un acheteur.',
          '',
        ]
      : []),
    `Bonjour${c.clientNom ? ` ${c.clientNom}` : ''},`,
    '',
    'Votre commande est confirmée et votre accès est ouvert.',
    '',
    `Formation : ${c.designation}`,
    `Montant réglé : ${montant(c.montantCentimes, c.devise)}`,
    `Facture : ${facture}`,
    '',
    `Votre facture reste disponible à tout moment dans votre espace : ${adresseSite}/espace/factures`,
    '',
    'L’accès est personnel : il ne peut être partagé ni revendu, et les contenus ne peuvent être',
    'reproduits ou diffusés (article 10 des conditions générales de vente).',
    '',
    'VOTRE DROIT DE RÉTRACTATION',
    'Vous disposez de 14 jours à compter d’aujourd’hui pour vous rétracter, sans motif ni frais,',
    'même si vous avez déjà commencé la formation : nous ne vous demandons pas d’y renoncer. Il',
    'vous suffit de nous adresser une déclaration dénuée d’ambiguïté à contact@tradingcorp.fr',
    'avant l’expiration du délai. Le remboursement intégral intervient au plus tard 14 jours après',
    'réception de votre demande, par le même moyen de paiement.',
    `Un formulaire type est disponible en annexe des conditions générales de vente : ${adresseSite}/cgv`,
    '',
    'GARANTIE LÉGALE',
    'La formation est un contenu numérique : elle est couverte par la garantie légale de conformité',
    'des articles L224-25-12 et suivants du Code de la consommation, indépendamment du droit de',
    'rétractation.',
    '',
    `Les conditions générales de vente applicables sont celles en vigueur au jour de votre commande : ${adresseSite}/cgv`,
    'Pour toute question : contact@tradingcorp.fr',
    '',
    'TradingCorp',
  ].join('\n');
}

/**
 * Envoie la confirmation. Rend `true` si Brevo l'a acceptée.
 * N'échoue jamais : toute anomalie part dans le journal.
 */
export async function envoyerConfirmation(c: Commande, adresseSite: string): Promise<boolean> {
  try {
    if (!c.clientEmail) {
      console.error('[confirmation] pas d’adresse — confirmation non envoyée', c.numeroFacture);
      return false;
    }
    const parti = await envoyer({
      destinataire: c.clientEmail,
      destinataireNom: c.clientNom,
      objet: c.essai
        ? 'Essai — confirmation de commande TradingCorp'
        : 'Confirmation de votre commande TradingCorp',
      html: corps(c, adresseSite),
      texte: texteBrut(c, adresseSite),
    });
    if (!parti) {
      console.error('[confirmation] non remise', c.numeroFacture, c.clientEmail);
    }
    return parti;
  } catch (erreur) {
    console.error('[confirmation] échec', erreur);
    return false;
  }
}
