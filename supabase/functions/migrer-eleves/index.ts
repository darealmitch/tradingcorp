// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Reprise des anciens élèves de la plateforme Wix.
//
// L'export Wix ne donne qu'un COMPTEUR d'étapes achevées — « 29 sur 103 » — et
// jamais la liste de celles qui l'ont été. On reconstitue donc une progression
// linéaire équivalente : les N premières leçons de l'ordre canonique
// (sections.position, lecons.position). Les deux plateformes comptent 103
// éléments, et la fonction `prochaines_lecons` reprenant à la première leçon
// non terminée, l'élève retombe exactement là où il s'était arrêté.
//
// Rien n'est envoyé qui ressemble à un mot de passe : le compte reçoit un mot
// de passe temporaire aléatoire que personne ne voit, puis un e-mail de
// récupération dont l'élève tire un code à six chiffres pour choisir le sien.
//
// TOUT EST IDEMPOTENT : un compte déjà présent est rattaché et non recréé, une
// inscription existante est laissée telle quelle, une leçon déjà terminée n'est
// pas réécrite. Relancer la migration sur les mêmes élèves ne fait aucun dégât.

interface Eleve {
  email?: string;
  etapes_terminees?: number;
  prenom?: string;
  nom?: string;
}

interface Bilan {
  email: string;
  compte: 'cree' | 'rattache' | 'ignore';
  inscription: 'creee' | 'deja_presente' | 'aucune';
  lecons_marquees: number;
  pourcentage: number | null;
  reprise_a: string | null;
  invitation: 'envoyee' | 'non_demandee' | 'echec';
  probleme: string | null;
}

/** Au-delà, on dépasse le plafond d'envoi du fournisseur d'e-mails. */
const LOT_MAXIMUM = 40;

function json(req: Request, corps: unknown, statut: number): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { ...enTetesCors(req), 'Content-Type': 'application/json' },
  });
}

/** Mot de passe temporaire : personne ne le lit, il est remplacé par l'élève. */
function motDePasseJetable(): string {
  const octets = new Uint32Array(24);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => o.toString(36))
    .join('')
    .slice(0, 32);
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
      data: { user: appelant },
    } = await porteur.auth.getUser();
    if (!appelant) {
      return json(req, { erreur: 'Connexion requise.' }, 401);
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
      return json(req, { erreur: 'Réservé aux administrateurs.' }, 403);
    }

    const corps = (await req.json().catch(() => ({}))) as {
      eleves?: Eleve[];
      simulation?: boolean;
      envoyer_invitation?: boolean;
    };
    const eleves = corps.eleves ?? [];
    // La simulation est le défaut : on ne migre personne par mégarde.
    const simulation = corps.simulation !== false;
    const inviter = corps.envoyer_invitation === true && !simulation;

    if (eleves.length === 0) {
      return json(req, { erreur: 'Aucun élève fourni.' }, 400);
    }
    if (eleves.length > LOT_MAXIMUM) {
      return json(
        req,
        { erreur: `Au plus ${LOT_MAXIMUM} élèves par appel — plafond d'envoi des e-mails.` },
        400,
      );
    }

    const { data: formation } = await admin
      .from('formations')
      .select('id_formation')
      .eq('est_publiee', true)
      .order('prix_centimes')
      .limit(1)
      .maybeSingle();
    if (!formation) {
      return json(req, { erreur: 'Aucune formation publiée.' }, 500);
    }

    // L'ordre canonique des leçons, lu une fois pour tout le lot.
    const { data: lecons } = await admin.rpc('lecons_ordonnees');
    const ordre = (lecons ?? []) as { id_lecon: string; titre: string; rang: number }[];
    if (ordre.length === 0) {
      return json(req, { erreur: 'Impossible de lire l’ordre des leçons.' }, 500);
    }

    const bilans: Bilan[] = [];

    for (const eleve of eleves) {
      const email = eleve.email?.trim().toLowerCase();
      const etapes = Number(eleve.etapes_terminees ?? 0);
      const bilan: Bilan = {
        email: email ?? '(vide)',
        compte: 'ignore',
        inscription: 'aucune',
        lecons_marquees: 0,
        pourcentage: null,
        reprise_a: null,
        invitation: 'non_demandee',
        probleme: null,
      };

      if (!email || !email.includes('@')) {
        bilan.probleme = 'Adresse invalide.';
        bilans.push(bilan);
        continue;
      }
      if (!Number.isInteger(etapes) || etapes < 0 || etapes > ordre.length) {
        bilan.probleme = `Nombre d'étapes hors bornes (0 à ${ordre.length}).`;
        bilans.push(bilan);
        continue;
      }

      // 1) Le compte : rattaché s'il existe, créé sinon.
      const { data: existant } = await admin.rpc('id_profil_par_email', { p_email: email });
      let idProfil = existant as string | null;

      if (idProfil) {
        bilan.compte = 'rattache';
      } else if (simulation) {
        bilan.compte = 'cree';
      } else {
        const { data: cree, error: erreurCreation } = await admin.auth.admin.createUser({
          email,
          password: motDePasseJetable(),
          email_confirm: true,
          // cree_par_admin : sans ce drapeau, `handle_new_user` refuse tout
          // compte sans date de naissance — et l'export Wix n'en portait aucune.
          // L'élève la renseignera pendant la récupération de son compte.
          user_metadata: {
            prenom: eleve.prenom?.trim() ?? '',
            nom: eleve.nom?.trim() ?? '',
            cree_par_admin: 'true',
          },
        });
        if (erreurCreation || !cree.user) {
          bilan.probleme = `Création refusée : ${erreurCreation?.message ?? 'inconnue'}`;
          bilans.push(bilan);
          continue;
        }
        idProfil = cree.user.id;
        bilan.compte = 'cree';
      }

      if (simulation && !idProfil) {
        // Compte à créer : on annonce ce qui serait fait, sans identifiant.
        bilan.inscription = 'creee';
        bilan.lecons_marquees = etapes;
        bilan.pourcentage = Math.round((100 * etapes) / ordre.length);
        bilan.reprise_a = ordre[etapes]?.titre ?? '(formation achevée)';
        bilan.invitation = corps.envoyer_invitation ? 'non_demandee' : 'non_demandee';
        bilans.push(bilan);
        continue;
      }

      // 2) L'inscription à la formation.
      const { data: inscriptionExistante } = await admin
        .from('inscriptions')
        .select('id_inscription')
        .eq('id_profil', idProfil)
        .eq('id_formation', formation.id_formation)
        .maybeSingle();

      if (inscriptionExistante) {
        bilan.inscription = 'deja_presente';
      } else if (simulation) {
        bilan.inscription = 'creee';
      } else {
        const { error } = await admin.from('inscriptions').insert({
          id_profil: idProfil,
          id_formation: formation.id_formation,
          statut: 'active',
          source: 'manuel',
        });
        bilan.inscription = error ? 'aucune' : 'creee';
        if (error) bilan.probleme = `Inscription refusée : ${error.message}`;
      }

      // 3) La progression : les `etapes` premières leçons de l'ordre canonique.
      const aMarquer = ordre.slice(0, etapes);
      if (!simulation && aMarquer.length > 0) {
        const { error } = await admin.from('progression_lecons').upsert(
          aMarquer.map((l) => ({
            id_profil: idProfil,
            id_lecon: l.id_lecon,
            terminee_le: new Date().toISOString(),
          })),
          { onConflict: 'id_profil,id_lecon', ignoreDuplicates: true },
        );
        if (error) bilan.probleme = `Progression refusée : ${error.message}`;
      }

      const { count } = await admin
        .from('progression_lecons')
        .select('id_progression_lecon', { count: 'exact', head: true })
        .eq('id_profil', idProfil)
        .not('terminee_le', 'is', null);

      bilan.lecons_marquees = simulation ? aMarquer.length : (count ?? 0);
      bilan.pourcentage = Math.round((100 * bilan.lecons_marquees) / ordre.length);
      bilan.reprise_a = ordre[bilan.lecons_marquees]?.titre ?? '(formation achevée)';

      // 4) L'invitation : un e-mail de récupération, jamais un mot de passe.
      if (inviter) {
        const { error } = await porteur.auth.resetPasswordForEmail(email);
        bilan.invitation = error ? 'echec' : 'envoyee';
        if (error) bilan.probleme = `Invitation non partie : ${error.message}`;
      }

      bilans.push(bilan);
    }

    if (!simulation) {
      await admin.from('journal_admin').insert({
        id_profil: appelant.id,
        action: 'migration_anciens_eleves',
        cible: `${bilans.length} élève(s)`,
        meta: { emails: bilans.map((b) => b.email), invitations: inviter },
      });
    }

    return json(req, { simulation, total: bilans.length, bilans }, 200);
  } catch (erreur) {
    console.error('[migrer-eleves]', erreur);
    return json(req, { erreur: 'La migration a échoué.' }, 500);
  }
});
