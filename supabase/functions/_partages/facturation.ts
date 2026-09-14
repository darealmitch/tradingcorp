import { createClient } from 'npm:@supabase/supabase-js@2';
import { composer } from './facture.ts';
import { envoyer } from './courriel.ts';
import { vendeur } from './vendeur.ts';

/**
 * Émission d'une facture et confirmation de commande.
 *
 * DEUX OBLIGATIONS DISTINCTES, remplies par un seul envoi :
 *
 *   • la NOTE — arrêté du 3 octobre 1983 : toute prestation de services à un
 *     particulier au-delà de 25 € TTC doit donner lieu à une note. La formation
 *     est à 997 € ;
 *   • la CONFIRMATION sur support durable — article L221-13 du Code de la
 *     consommation : elle reprend les informations précontractuelles et
 *     confirme le droit de rétractation. Une notification dans l'espace ne
 *     suffit pas, TradingCorp pouvant l'effacer.
 *
 * RIEN ICI NE DOIT FAIRE ÉCHOUER L'APPELANT. Le webhook Stripe encaisse et
 * ouvre l'accès ; si la facturation échoue, elle échoue seule et bruyamment
 * dans le journal. Un webhook en erreur serait rejoué par Stripe, au risque
 * d'une seconde inscription — pour un problème de document.
 */

export interface Commande {
  idProfil: string;
  idPaiement: string | null;
  /** Ce qui a été vendu, tel qu'il figurera sur la facture. */
  designation: string;
  montantCentimes: number;
  devise: string;
  clientNom: string | null;
  clientEmail: string | null;
  moyenPaiement: string | null;
  /** ISO. À défaut, la date d'émission fait foi. */
  datePaiement: string | null;
  modeTest: boolean;
}

/** Corps de la confirmation. Les mentions suivent les CGV, article par article. */
function corpsConfirmation(c: Commande, numero: string, adresseSite: string): string {
  const prix = `${(c.montantCentimes / 100).toFixed(2).replace('.', ',')} €`;
  return `
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2233;max-width:620px">
  <p>Bonjour${c.clientNom ? ` ${c.clientNom}` : ''},</p>

  <p>Votre commande est confirmée et votre accès est ouvert.</p>

  <table style="border-collapse:collapse;margin:20px 0;font-size:14px">
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Formation</td><td><strong>${c.designation}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Montant réglé</td><td><strong>${prix}</strong></td></tr>
    <tr><td style="padding:4px 16px 4px 0;color:#6b6f80">Facture</td><td>n° ${numero}, jointe à ce message</td></tr>
  </table>

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
 * Émet la facture, la dépose et envoie la confirmation.
 * N'échoue jamais : toute anomalie part dans le journal.
 */
export async function emettreFacture(c: Commande, adresseSite: string): Promise<void> {
  try {
    const identite = vendeur();
    if (!identite) {
      // Sans adresse, la facture serait irrégulière. Mieux vaut pas de document
      // qu'un document qui donne l'illusion d'être en règle.
      console.error(
        '[facturation] VENDEUR_ADRESSE absente — aucune facture émise pour le profil',
        c.idProfil,
      );
      return;
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Le numéro est tiré côté base : la continuité de la série s'y joue.
    const { data: attribue, error: erreurNumero } = await admin.rpc('numero_facture');
    if (erreurNumero || !attribue) {
      console.error('[facturation] numéro indisponible', erreurNumero);
      return;
    }
    const numero = attribue as string;

    const { data: facture, error: erreurLigne } = await admin
      .from('factures')
      .insert({
        numero,
        id_profil: c.idProfil,
        id_paiement: c.idPaiement,
        designation: c.designation,
        montant_centimes: c.montantCentimes,
        devise: c.devise,
        client_nom: c.clientNom,
        client_email: c.clientEmail,
        mode_test: c.modeTest,
      })
      .select('id_facture, date_emission')
      .maybeSingle();
    if (erreurLigne || !facture) {
      console.error('[facturation] enregistrement impossible', erreurLigne);
      return;
    }

    const pdf = await composer(identite, {
      numero,
      dateEmission: facture.date_emission as string,
      designation: c.designation,
      montantCentimes: c.montantCentimes,
      devise: c.devise,
      clientNom: c.clientNom,
      clientEmail: c.clientEmail,
      moyenPaiement: c.moyenPaiement,
      datePaiement: c.datePaiement,
      modeTest: c.modeTest,
    });

    // Le chemin porte le numéro : une facture ne se remplace pas, et le compte
    // peut en accumuler plusieurs.
    const chemin = `${c.idProfil}/${numero}.pdf`;
    const { error: erreurDepot } = await admin.storage
      .from('factures')
      .upload(chemin, pdf, { contentType: 'application/pdf', upsert: true });
    if (erreurDepot) {
      console.error('[facturation] dépôt impossible', erreurDepot);
    } else {
      await admin
        .from('factures')
        .update({ chemin_storage: chemin })
        .eq('id_facture', facture.id_facture);
    }

    if (!c.clientEmail) {
      console.error('[facturation] pas d’adresse — confirmation non envoyée', numero);
      return;
    }

    const parti = await envoyer({
      destinataire: c.clientEmail,
      destinataireNom: c.clientNom,
      objet: `Votre commande TradingCorp — facture ${numero}`,
      html: corpsConfirmation(c, numero, adresseSite),
      piecesJointes: [{ nom: `facture-${numero}.pdf`, contenu: pdf }],
    });
    if (!parti) {
      console.error('[facturation] confirmation non remise', numero, c.clientEmail);
    }
  } catch (erreur) {
    console.error('[facturation] échec', erreur);
  }
}
