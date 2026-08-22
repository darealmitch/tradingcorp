// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';
import { Titulaire, composer } from './diplome.ts';

// Génération du diplôme PDF d'un apprenant.
//
// La fonction ne DÉCIDE pas qui a droit à un certificat : elle appelle
// delivrer_certificat(), qui porte déjà toutes les conditions (formation
// certifiante, inscription active, compte non-test, parcours réellement achevé)
// et reste la seule autorité en la matière. Ici on ne fait que mettre en forme
// ce que la base a accordé.
//
// Le fichier est produit une fois puis conservé : `chemin_storage` sert de
// mémoire. Régénérer à chaque consultation produirait un document légèrement
// différent à chaque fois — un diplôme doit être stable.
//
// La mise en page vit dans diplome.ts, composée nativement en PDF : ni image
// de fond, ni document antérieur recouvert. Elle est lançable hors du serveur,
// ce qui permet d'en contrôler le rendu à l'œil avant tout déploiement.

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return reponsePreflight(req, 'POST, OPTIONS');
  }

  try {
    const porteur = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const {
      data: { user },
    } = await porteur.auth.getUser();
    if (!user) {
      return json(req, { erreur: 'Connexion requise.' }, 401);
    }

    const { id_formation } = (await req.json().catch(() => ({}))) as { id_formation?: string };
    if (!id_formation) {
      return json(req, { erreur: 'Formation manquante.' }, 400);
    }

    // Le droit au certificat se demande à la base, en contexte UTILISATEUR :
    // delivrer_certificat vérifie le parcours achevé et rend l'identifiant du
    // certificat, existant ou nouvellement créé. Elle rend null quand les
    // conditions ne sont pas réunies — c'est le seul verdict qui compte.
    const { data: idCertificat } = await porteur.rpc('delivrer_certificat', {
      p_id_profil: user.id,
      p_id_formation: id_formation,
    });
    if (!idCertificat) {
      return json(
        req,
        { erreur: "Le certificat n'est pas encore accessible : termine la formation." },
        403,
      );
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: certificat } = await admin
      .from('certificats')
      .select('id_certificat, numero, date_obtention, chemin_storage')
      .eq('id_certificat', idCertificat)
      .maybeSingle();
    if (!certificat) {
      return json(req, { erreur: 'Certificat introuvable.' }, 404);
    }

    let chemin = certificat.chemin_storage as string | null;

    if (!chemin) {
      const [{ data: profil }, { data: formation }] = await Promise.all([
        admin
          .from('profils')
          .select('prenom, nom, date_naissance')
          .eq('id_profil', user.id)
          .maybeSingle(),
        admin.from('formations').select('titre').eq('id_formation', id_formation).maybeSingle(),
      ]);
      if (!profil) {
        return json(req, { erreur: 'Profil introuvable.' }, 404);
      }

      const pdf = await composer(
        profil as Titulaire,
        formation?.titre ?? 'Formation',
        certificat.date_obtention as string,
        certificat.numero as string,
      );

      // Le chemin porte l'identifiant du certificat, pas celui du profil : un
      // certificat est un document daté, il ne se remplace pas quand le compte
      // en obtient un second sur une autre formation.
      chemin = `${user.id}/${certificat.numero}.pdf`;
      const { error: erreurDepot } = await admin.storage
        .from('certificats')
        .upload(chemin, pdf, { contentType: 'application/pdf', upsert: true });
      if (erreurDepot) {
        console.error('[generer-certificat] dépôt', erreurDepot);
        return json(req, { erreur: 'Le certificat n’a pas pu être enregistré.' }, 500);
      }

      const { error: erreurMaj } = await admin
        .from('certificats')
        .update({ chemin_storage: chemin })
        .eq('id_certificat', certificat.id_certificat);
      if (erreurMaj) {
        console.error('[generer-certificat] chemin', erreurMaj);
        return json(req, { erreur: 'Le certificat n’a pas pu être rattaché.' }, 500);
      }
    }

    // URL signée plutôt que fichier public : le bucket reste fermé, et le lien
    // expire. Dix minutes suffisent à ouvrir ou télécharger le document.
    const { data: lien, error: erreurLien } = await admin.storage
      .from('certificats')
      .createSignedUrl(chemin, 600);
    if (erreurLien || !lien) {
      console.error('[generer-certificat] signature', erreurLien);
      return json(req, { erreur: 'Le lien de téléchargement a échoué.' }, 500);
    }

    return json(req, { url: lien.signedUrl, numero: certificat.numero }, 200);
  } catch (erreur) {
    console.error('[generer-certificat]', erreur);
    return json(req, { erreur: 'La génération du certificat a échoué.' }, 500);
  }
});
