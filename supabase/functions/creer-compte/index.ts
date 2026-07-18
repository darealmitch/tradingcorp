// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Création manuelle de comptes par un administrateur (formateur, apprenant
// privilégié, migration d'un ancien client) : mot de passe temporaire généré
// ici, changement forcé à la première connexion via profils.doit_changer_mdp.

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

/** Mot de passe temporaire sans caractères ambigus (O/0, l/1…). */
function genererMotDePasse(): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!#%+=';
  const octets = new Uint32Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => charset[o % charset.length]).join('');
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

    const corps = (await req.json().catch(() => ({}))) as {
      email?: string;
      prenom?: string;
      nom?: string;
      role?: string;
      id_formation?: string | null;
    };
    const email = corps.email?.trim().toLowerCase();
    const role = corps.role;
    if (!email || !email.includes('@')) {
      return json({ erreur: 'Adresse e-mail invalide.' }, 400);
    }
    if (role !== 'apprenant' && role !== 'formateur') {
      return json({ erreur: 'Rôle invalide : apprenant ou formateur.' }, 400);
    }

    // Accès offert à une formation (compte privilégié, ancien client migré).
    let formation: { id_formation: string } | null = null;
    if (corps.id_formation) {
      const { data } = await admin
        .from('formations')
        .select('id_formation')
        .eq('id_formation', corps.id_formation)
        .maybeSingle();
      if (!data) {
        return json({ erreur: 'Formation introuvable.' }, 400);
      }
      formation = data;
    }

    const motDePasse = genererMotDePasse();
    const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
      email,
      password: motDePasse,
      email_confirm: true,
      // cree_par_admin : le trigger handle_new_user saute le contrôle de
      // majorité pour les comptes créés par un admin (aucune date de naissance).
      user_metadata: {
        prenom: corps.prenom?.trim() ?? '',
        nom: corps.nom?.trim() ?? '',
        cree_par_admin: 'true',
      },
    });
    if (erreurCreation || !cree.user) {
      const existe = erreurCreation?.message.toLowerCase().includes('already');
      return json(
        { erreur: existe ? 'Un compte existe déjà avec cet e-mail.' : 'La création a échoué.' },
        existe ? 409 : 500,
      );
    }

    // Le trigger handle_new_user a créé le profil en apprenant : on pose le
    // rôle demandé et le blocage jusqu'au changement de mot de passe.
    const { error: erreurProfil } = await admin
      .from('profils')
      .update({ role, doit_changer_mdp: true })
      .eq('id_profil', cree.user.id);
    if (erreurProfil) {
      return json({ erreur: 'Compte créé mais profil incomplet — vérifie la table profils.' }, 500);
    }

    if (formation && role === 'apprenant') {
      await admin.from('inscriptions').insert({
        id_profil: cree.user.id,
        id_formation: formation.id_formation,
        statut: 'active',
        source: 'manuel',
      });
    }

    await admin.from('journal_admin').insert({
      id_profil: appelant.id,
      action: 'creation_compte',
      cible: email,
      meta: { role, id_formation: formation?.id_formation ?? null },
    });

    // Le mot de passe n'est renvoyé qu'une fois, à l'admin qui l'a demandé.
    return json({ mot_de_passe: motDePasse }, 200);
  } catch (erreur) {
    console.error('[creer-compte]', erreur);
    return json({ erreur: 'La création du compte a échoué.' }, 500);
  }
});
