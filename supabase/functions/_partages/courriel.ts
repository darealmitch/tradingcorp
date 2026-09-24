/**
 * Envoi d'e-mails transactionnels, via l'API Brevo.
 *
 * Brevo sert déjà de SMTP aux messages d'authentification de Supabase, mais
 * ceux-là partent de la plateforme, sans que le code y touche. Ce module ouvre
 * la seconde voie : les messages que TradingCorp envoie lui-même — à commencer
 * par la confirmation de commande, qu'impose l'article L221-13 du Code de la
 * consommation.
 *
 * TOUT ÉCHEC EST AVALÉ, VOLONTAIREMENT. Ces envois sont déclenchés depuis le
 * webhook Stripe : si une panne de Brevo faisait échouer la fonction, Stripe
 * rejouerait l'événement, et l'acheteur risquerait une seconde inscription pour
 * un problème qui ne le concerne pas. L'incident est journalisé, le paiement
 * suit son cours.
 */

const API = 'https://api.brevo.com/v3/smtp/email';

/** Expéditeur — l'adresse doit être vérifiée dans Brevo, sinon tout est rejeté. */
const EXPEDITEUR = { name: 'TradingCorp', email: 'contact@tradingcorp.fr' };

/**
 * ADRESSE DE RÉPONSE — distincte de l'expéditeur, et c'est volontaire.
 *
 * L'expéditeur reste `contact@tradingcorp.fr` parce que c'est l'adresse
 * AUTHENTIFIÉE du domaine : le SPF de `tradingcorp.fr` autorise Brevo
 * (`include:spf.brevo.com`) et le DKIM est signé sous `brevo1`/`brevo2.
 * _domainkey.tradingcorp.fr`. C'est cet alignement qui fait passer les
 * messages — 8,2/10 à mail-tester le 21/09/2026.
 *
 * Mettre une adresse `@gmail.com` en expéditeur le romprait : Brevo signerait
 * au nom d'un domaine qui n'est pas le sien, et l'écart entre le `From` affiché
 * et le domaine signataire est précisément ce que les filtres lisent comme une
 * usurpation. Le DMARC de gmail.com (`p=none; sp=quarantine`) ne rejetterait
 * pas le message, mais Gmail et Outlook le classeraient.
 *
 * Reste le vrai problème : `contact@tradingcorp.fr` ne relève AUCUNE boîte.
 * Sans adresse de réponse, la demande de rétractation d'un client — que
 * l'article L221-13 nous fait justement obligation de recevoir — part dans le
 * vide pendant que son délai de quatorze jours continue de courir.
 *
 * Le nom reste « TradingCorp » : c'est lui qui s'affichera dans le champ « À »
 * quand le client cliquera sur Répondre, et une adresse Gmail nue y ferait
 * douter qu'on écrit bien au vendeur.
 *
 * L'adresse, elle, se surcharge par un secret. Le jour où `contact@` relèvera
 * enfin une boîte, il suffira de poser `COURRIEL_REPONSE` : sans cela, il
 * faudrait republier toutes les fonctions qui envoient du courrier pour changer
 * une seule ligne. `||` et non `??` — un secret déclaré vide rendrait la chaîne
 * vide, que `??` laisserait passer et que Brevo refuserait.
 */
const REPONDRE_A = {
  name: 'TradingCorp',
  email: Deno.env.get('COURRIEL_REPONSE') || 'mailtradingcorp@gmail.com',
};

export interface PieceJointe {
  /** Nom affiché dans le client de messagerie. */
  nom: string;
  /** Contenu du fichier ; encodé en base64 à l'envoi. */
  contenu: Uint8Array;
}

export interface Message {
  destinataire: string;
  destinataireNom?: string | null;
  objet: string;
  /** Corps en HTML. */
  html: string;
  /**
   * Version texte du même message.
   *
   * Brevo NE LA GÉNÈRE PAS : un envoi sans elle part en `text/html` seul
   * (règle MIME_HTML_ONLY de SpamAssassin, relevée par mail-tester le
   * 21/09/2026). Elle sert aussi les lecteurs d'écran et les clients de
   * messagerie qui n'affichent pas le HTML.
   */
  texte?: string;
  piecesJointes?: PieceJointe[];
}

/** base64 sans dépendance : Brevo attend les pièces jointes ainsi encodées. */
function base64(octets: Uint8Array): string {
  let binaire = '';
  // Par tranches : `String.fromCharCode(...)` sur un tableau de plusieurs
  // centaines de milliers d'éléments dépasse la pile d'appels.
  const TRANCHE = 8192;
  for (let i = 0; i < octets.length; i += TRANCHE) {
    binaire += String.fromCharCode(...octets.subarray(i, i + TRANCHE));
  }
  return btoa(binaire);
}

/**
 * Envoie le message. Rend `true` s'il est parti, `false` sinon — jamais
 * d'exception : voir l'en-tête de ce fichier.
 */
export async function envoyer(message: Message): Promise<boolean> {
  const cle = Deno.env.get('BREVO_API_KEY');
  if (!cle) {
    console.error('[courriel] BREVO_API_KEY absente — aucun envoi');
    return false;
  }

  const corps = {
    sender: EXPEDITEUR,
    replyTo: REPONDRE_A,
    to: [{ email: message.destinataire, name: message.destinataireNom ?? undefined }],
    subject: message.objet,
    htmlContent: message.html,
    textContent: message.texte,
    attachment: message.piecesJointes?.map((p) => ({
      name: p.nom,
      content: base64(p.contenu),
    })),
  };

  try {
    const reponse = await fetch(API, {
      method: 'POST',
      headers: {
        'api-key': cle,
        'Content-Type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(corps),
    });
    if (!reponse.ok) {
      console.error('[courriel] refus de Brevo', reponse.status, await reponse.text());
      return false;
    }
    return true;
  } catch (erreur) {
    console.error('[courriel] envoi impossible', erreur);
    return false;
  }
}
