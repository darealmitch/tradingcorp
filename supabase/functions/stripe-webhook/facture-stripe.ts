import Stripe from 'npm:stripe@18';
import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Reflet, dans `factures`, de la facture que Stripe a émise au paiement.
 *
 * Stripe fait le travail légal : numérotation séquentielle à l'échelle du
 * compte et composition du PDF (Checkout, `invoice_creation`, paramétré dans
 * `checkout`). Ce module en garde le reflet pour l'écran de facturation de
 * l'administrateur — numéro, montant, date, et l'identifiant Stripe à partir
 * duquel `generer-facture` redemande un lien frais —, et rend le lien du PDF,
 * que le webhook joint à la confirmation de commande.
 *
 * N'ÉCHOUE JAMAIS, comme tout ce que le webhook appelle après l'encaissement :
 * la facture existe chez Stripe et part par e-mail quoi qu'il arrive ici. Un
 * reflet manquant se rattrape ; un webhook rejoué pour un problème de miroir
 * risquerait, lui, de tout recommencer.
 */

export interface Contexte {
  idProfil: string;
  idPaiement: string;
  /** L'intitulé tel que vendu — celui de la table `formations`. */
  designation: string;
}

export interface FactureLue {
  /** Numéro attribué par Stripe. */
  numero: string;
  /** Lien de téléchargement du PDF, frais : il vient d'être lu chez Stripe. */
  lienPdf: string | null;
}

/** Rend la facture Stripe telle que lue, ou `null` si elle n'a pas pu l'être. */
export async function enregistrerFacture(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
  contexte: Contexte,
): Promise<FactureLue | null> {
  try {
    // Un client à soi plutôt que celui du webhook passé en paramètre. Typer ce
    // paramètre est un piège : `ReturnType<typeof createClient>` instancie les
    // génériques à leurs valeurs par défaut (`never` pour le schéma), et la CI
    // l'a refusé — la table `factures` n'existait plus pour le vérificateur.
    // L'ancien module de facturation procédait déjà ainsi.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // L'identifiant arrive normalement avec l'événement. S'il manque, on relit
    // la session : c'est elle qui fait foi. S'il manque encore, on le dit
    // dans le journal — la facture existe peut-être, elle n'est simplement pas
    // encore rattachée, et l'élève la reçoit de toute façon par e-mail.
    let idFacture = identifiant(session.invoice);
    if (!idFacture) {
      idFacture = identifiant((await stripe.checkout.sessions.retrieve(session.id)).invoice);
    }
    if (!idFacture) {
      console.error('[facture] aucune facture Stripe pour la session', session.id);
      return null;
    }

    const facture = await stripe.invoices.retrieve(idFacture);

    // A4 plutôt que Letter : Stripe ne réserve l'A4 qu'aux clients japonais par
    // défaut. Le format se règle même sur une facture finalisée, et le PDF est
    // produit au téléchargement — la correction vaut donc pour tous les liens.
    try {
      await stripe.invoices.update(idFacture, { rendering: { pdf: { page_size: 'a4' } } });
    } catch (erreur) {
      console.error('[facture] format A4 non appliqué', idFacture, erreur);
    }

    const numero = facture.number ?? idFacture;
    const payeeLe = facture.status_transitions?.paid_at ?? facture.created;

    // `ignoreDuplicates` : une relance de Stripe retombe sur la ligne existante
    // et n'en crée pas une seconde. La contrainte unique sur l'identifiant
    // Stripe en est la garantie ; ce paramètre évite seulement l'erreur.
    const { error } = await admin.from('factures').upsert(
      {
        stripe_invoice_id: idFacture,
        numero,
        id_profil: contexte.idProfil,
        id_paiement: contexte.idPaiement,
        designation: contexte.designation,
        montant_centimes: facture.amount_paid,
        devise: facture.currency,
        client_nom: facture.customer_name ?? session.customer_details?.name ?? null,
        client_email: facture.customer_email ?? session.customer_details?.email ?? null,
        date_emission: new Date(payeeLe * 1000).toISOString(),
        mode_test: !facture.livemode,
      },
      { onConflict: 'stripe_invoice_id', ignoreDuplicates: true },
    );
    if (error) {
      console.error('[facture] reflet non enregistré', idFacture, error);
    }
    return { numero, lienPdf: facture.invoice_pdf ?? null };
  } catch (erreur) {
    console.error('[facture] lecture impossible', session.id, erreur);
    return null;
  }
}

/** `session.invoice` est un identifiant, ou l'objet entier s'il a été développé. */
function identifiant(valeur: string | Stripe.Invoice | null | undefined): string | null {
  if (!valeur) {
    return null;
  }
  return typeof valeur === 'string' ? valeur : (valeur.id ?? null);
}

/**
 * Télécharge le PDF d'une facture Stripe, pour le joindre à la confirmation.
 *
 * Rend `null` plutôt que de lever, comme tout ce qui suit l'encaissement : sans
 * pièce jointe, la confirmation part quand même, et le journal dit pourquoi.
 *
 * Trois précautions. Un délai maximal, parce que le webhook dispose de vingt
 * secondes en tout et que Stripe compose le PDF au premier téléchargement. La
 * redirection suivie — Stripe répond 302 avant de servir le fichier (vérifié le
 * 22/09/2026), ce que `fetch` fait par défaut. Et la signature `%PDF` vérifiée :
 * joindre une page d'erreur HTML sous le nom « facture.pdf » serait pire que
 * de ne rien joindre.
 */
export async function telechargerPdf(lien: string): Promise<Uint8Array | null> {
  try {
    const reponse = await fetch(lien, { signal: AbortSignal.timeout(8000) });
    if (!reponse.ok) {
      console.error('[facture] PDF indisponible', reponse.status);
      return null;
    }
    const octets = new Uint8Array(await reponse.arrayBuffer());
    const signature = new TextDecoder().decode(octets.subarray(0, 4));
    if (signature !== '%PDF') {
      console.error('[facture] le fichier reçu n’est pas un PDF', signature);
      return null;
    }
    return octets;
  } catch (erreur) {
    console.error('[facture] téléchargement du PDF impossible', erreur);
    return null;
  }
}
