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
  /** Corps en HTML. Brevo génère seul la version texte. */
  html: string;
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
    to: [{ email: message.destinataire, name: message.destinataireNom ?? undefined }],
    subject: message.objet,
    htmlContent: message.html,
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
