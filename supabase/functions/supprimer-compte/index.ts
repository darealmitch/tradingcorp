// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Suppression d'un compte par un administrateur. Symétrique de creer-compte :
// auth.users n'est pas accessible au client, seule la clé service_role peut
// supprimer l'utilisateur — ce qui propage ensuite les cascades du schéma
// (profils, inscriptions, progression, notifications…). Les paiements sont
// conservés (id_profil passe à NULL) : ce sont des pièces comptables.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const porteur = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const {
      data: { user: appelant },
    } = await porteur.auth.getUser();
    if (!appelant) {
      return json({ erreur: 'Connexion requise.' }, 401);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: profilAppelant } = await admin
      .from('profils')
      .select('role')
      .eq('id_profil', appelant.id)
      .maybeSingle();
    if (profilAppelant?.role !== 'admin') {
      return json({ erreur: 'Réservé aux administrateurs.' }, 403);
    }

    const corps = (await req.json().catch(() => ({}))) as { id_profil?: string };
    const idCible = corps.id_profil?.trim();
    if (!idCible) {
      return json({ erreur: 'Profil à supprimer non précisé.' }, 400);
    }
    // Même garde-fou anti-verrouillage que changer_role : on ne se retire pas
    // soi-même l'accès au back-office par mégarde.
    if (idCible === appelant.id) {
      return json({ erreur: 'Tu ne peux pas supprimer ton propre compte.' }, 400);
    }

    const { data: cible } = await admin
      .from('profils')
      .select('id_profil, prenom, nom, role')
      .eq('id_profil', idCible)
      .maybeSingle();
    if (!cible) {
      return json({ erreur: 'Profil introuvable.' }, 404);
    }

    // Un back-office sans administrateur ne se rattrape pas depuis l'application.
    if (cible.role === 'admin') {
      const { count } = await admin
        .from('profils')
        .select('id_profil', { count: 'exact', head: true })
        .eq('role', 'admin');
      if ((count ?? 0) <= 1) {
        return json({ erreur: 'Impossible de supprimer le dernier administrateur.' }, 400);
      }
    }

    const {
      data: { user: utilisateurCible },
    } = await admin.auth.admin.getUserById(idCible);
    const emailCible = utilisateurCible?.email ?? null;

    // Journalisé AVANT la suppression : après, l'e-mail n'est plus résolvable.
    const { error: erreurJournal } = await admin.from('journal_admin').insert({
      id_profil: appelant.id,
      action: 'suppression_compte',
      cible: emailCible,
      meta: {
        id_profil: idCible,
        prenom: cible.prenom,
        nom: cible.nom,
        role: cible.role,
      },
    });
    if (erreurJournal) {
      return json({ erreur: "La suppression a été interrompue avant d'être effectuée." }, 500);
    }

    // Cascade depuis auth.users : révoque aussi sessions et identités.
    const { error: erreurSuppression } = await admin.auth.admin.deleteUser(idCible);
    if (erreurSuppression) {
      console.error('[supprimer-compte]', erreurSuppression);
      return json({ erreur: 'La suppression du compte a échoué.' }, 500);
    }

    return json({ supprime: true }, 200);
  } catch (erreur) {
    console.error('[supprimer-compte]', erreur);
    return json({ erreur: 'La suppression du compte a échoué.' }, 500);
  }
});
