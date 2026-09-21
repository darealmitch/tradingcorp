import Stripe from 'npm:stripe@18';
import type { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Le client tel que `createClient` le rend dans le webhook. Plus sûr qu'un
 * `SupabaseClient` nu, dont les paramètres génériques par défaut ne
 * s'accordent pas toujours avec ceux d'un client créé sans schéma typé.
 */
type ClientSupabase = ReturnType<typeof createClient>;

/**
 * Reflet, dans `factures`, de la facture que Stripe a émise au paiement.
 *
 * Stripe fait tout le travail légal : numérotation séquentielle à l'échelle du
 * compte, composition du PDF, envoi à l'acheteur (Checkout, `invoice_creation`,
 * paramétré dans `checkout`). Ce module n'en garde que ce qu'il faut pour que
 * l'élève retrouve sa facture dans son espace, et l'administrateur toutes les
 * siennes : le numéro, le montant, la date — et l'identifiant Stripe, à partir
 * duquel `generer-facture` redemande un lien frais à chaque téléchargement.
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

/** Rend le numéro Stripe de la facture, ou `null` si elle n'a pas pu être lue. */
export async function enregistrerFacture(
  stripe: Stripe,
  admin: ClientSupabase,
  session: Stripe.Checkout.Session,
  contexte: Contexte,
): Promise<string | null> {
  try {
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
    return numero;
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
