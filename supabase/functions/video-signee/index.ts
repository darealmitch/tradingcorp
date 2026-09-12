// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';
import { dureeJeton, signerUrlVideo } from '../_partages/bunny.ts';
//
// Délivre l'URL de lecture d'un chapitre vidéo, signée et datée.
//
// C'est désormais la SEULE voie par laquelle une adresse de vidéo parvient à un
// apprenant : `lecon_contenu` ne renvoie plus l'URL nue. L'ancienne adresse
// (`https://vz-….b-cdn.net/<id>/playlist.m3u8`) était permanente et valait pour
// tout le monde — relevée une fois dans l'onglet Réseau, elle se partageait
// indéfiniment. Le lien produit ici expire, et ne couvre qu'une vidéo.
//
// L'AUTORISATION VIENT DE LA RLS, PAS D'UNE RÈGLE RECOPIÉE ICI. La fonction
// interroge d'abord `lecons` avec le jeton de l'appelant : `lecons_select_gated`
// exige le staff, ou bien un chapitre publié + une inscription active +
// `lecon_debloquee()`. Si aucune ligne ne revient, l'accès est refusé — la
// policy décide, et il n'existe pas de second exemplaire de la règle à tenir
// à jour.
//
// La lecture de l'ADRESSE, elle, demande le service_role : depuis la migration
// 20260912103000, `video_url` n'est plus lisible par `authenticated` (c'était
// la faille — un GET sur /rest/v1/lecons rendait les adresses). Deux requêtes,
// donc, et dans cet ordre : on n'élève le privilège qu'après avoir établi le
// droit sur cette ligne précise. C'est le motif de `corriger-quiz`.

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

interface CorpsRequete {
  id_lecon?: string;
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

    const { id_lecon } = (await req.json().catch(() => ({}))) as CorpsRequete;
    if (!id_lecon) {
      return json(req, { erreur: 'Requête invalide.' }, 400);
    }

    // 1. Le droit. Lecture sous RLS : c'est le contrôle d'accès lui-même, pas
    // une vérification de forme. Une étape verrouillée, un chapitre dépublié ou
    // une inscription expirée ne rendent aucune ligne.
    const { data: autorise } = await porteur
      .from('lecons')
      .select('id_lecon, duree_s, video_hebergee')
      .eq('id_lecon', id_lecon)
      .maybeSingle();
    if (!autorise) {
      // Volontairement indistinct de « le chapitre n'existe pas » : répondre
      // autrement dirait à un curieux quels identifiants sont réels.
      return json(req, { erreur: 'Chapitre indisponible.' }, 403);
    }
    if (!autorise.video_hebergee) {
      return json(req, { erreur: 'Aucune vidéo n’est associée à ce chapitre.' }, 404);
    }

    // 2. L'adresse, une fois le droit établi sur CETTE ligne. `video_url` n'est
    // plus lisible par `authenticated` : seul le service_role la voit encore.
    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );
    const { data: lecon } = await admin
      .from('lecons')
      .select('video_url')
      .eq('id_lecon', id_lecon)
      .maybeSingle();
    if (!lecon?.video_url) {
      return json(req, { erreur: 'Aucune vidéo n’est associée à ce chapitre.' }, 404);
    }

    // Repli explicite tant que la clé n'est pas posée : le site continue de
    // fonctionner exactement comme avant, sans signature. C'est ce qui rend la
    // bascule réversible — retirer le secret suffit à revenir en arrière si le
    // réglage Bunny pose problème, sans redéployer quoi que ce soit.
    const cle = Deno.env.get('BUNNY_TOKEN_KEY');
    if (!cle) {
      return json(req, { url: lecon.video_url, signee: false, expire_le: null }, 200);
    }

    const duree = dureeJeton(lecon.duree_s);
    const url = await signerUrlVideo(lecon.video_url, cle, duree);

    // `expire_le` permet au lecteur de renouveler AVANT la coupure plutôt que
    // de la subir : une erreur de segment en milieu de vidéo se présente
    // autrement comme une panne inexplicable.
    return json(
      req,
      { url, signee: true, expire_le: new Date(Date.now() + duree * 1000).toISOString() },
      200,
    );
  } catch (erreur) {
    console.error('[video-signee]', erreur);
    return json(req, { erreur: 'La vidéo n’a pas pu être préparée.' }, 500);
  }
});
