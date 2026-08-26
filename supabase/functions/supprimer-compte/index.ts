// Types des API intégrées au runtime Edge de Supabase (Deno.serve, Deno.env).
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { enTetesCors, reponsePreflight } from '../_partages/cors.ts';

// Suppression d'un compte. Deux cas, un seul chemin :
//
//   • un ADMINISTRATEUR supprime le compte d'un tiers (cas d'origine) ;
//   • une PERSONNE supprime SON PROPRE compte — droit à l'effacement,
//     RGPD art. 17. Jusqu'ici impossible : la fonction exigeait le rôle admin,
//     si bien qu'aucun apprenant ne pouvait quitter la plateforme sans passer
//     par un humain (audit RGPD §3.3).
//
// Symétrique de creer-compte : auth.users n'est pas accessible au client, seule
// la clé service_role peut supprimer l'utilisateur — ce qui propage ensuite les
// cascades du schéma (profils, inscriptions, progression, notifications…).
//
// CE QUI SURVIT À LA SUPPRESSION, ET POURQUOI :
//
//   • les PAIEMENTS (id_profil → NULL) : pièces comptables, conservées dix ans
//     au titre de l'article L123-22 du Code de commerce. C'est une exception
//     expressément prévue au droit à l'effacement (RGPD art. 17.3.b). L'e-mail
//     qu'ils portent est retiré au terme de ces dix ans par la politique de
//     conservation ;
//   • le JOURNAL d'administration : l'action reste tracée, mais l'identité en
//     clair en est retirée séance tenante (anonymiser_journal_personne). La
//     preuve subsiste, la personne n'est plus identifiable.
//
// CE QUI NE SURVIT PLUS : les diplômes PDF du Storage. Ils échappaient à la
// cascade — la ligne `certificats` partait avec son `chemin_storage`, laissant
// dans le bucket un fichier nominatif que plus rien ne référençait et que rien
// n'aurait supprimé (audit RGPD §3.5).

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
      .select('role, est_proprietaire')
      .eq('id_profil', appelant.id)
      .maybeSingle();

    const corps = (await req.json().catch(() => ({}))) as { id_profil?: string };
    // Sans cible explicite, l'appelant se supprime lui-même. C'est le cas par
    // défaut : un apprenant n'a aucune raison de connaître son propre UUID.
    const idCible = corps.id_profil?.trim() || appelant.id;
    const autoSuppression = idCible === appelant.id;

    // Supprimer AUTRUI reste réservé aux administrateurs. Supprimer SON PROPRE
    // compte est un droit, ouvert à tout utilisateur authentifié.
    if (!autoSuppression && profilAppelant?.role !== 'admin') {
      return json(req, { erreur: 'Réservé aux administrateurs.' }, 403);
    }

    // Le compte propriétaire ne se supprime pas lui-même : la plateforme
    // resterait sans détenteur, et `profils_proprietaire_est_admin` n'a personne
    // d'autre à désigner. Ce n'est pas un refus du droit à l'effacement — c'est
    // une bascule de propriété à opérer d'abord.
    if (autoSuppression && profilAppelant?.est_proprietaire) {
      return json(
        req,
        {
          erreur:
            'Le compte propriétaire ne peut pas être supprimé. Transfère la propriété de la plateforme à un autre administrateur au préalable.',
        },
        400,
      );
    }

    const { data: cible } = await admin
      .from('profils')
      .select('id_profil, prenom, nom, role')
      .eq('id_profil', idCible)
      .maybeSingle();
    if (!cible) {
      return json(req, { erreur: 'Profil introuvable.' }, 404);
    }

    // Supprimer un pair est réservé au compte propriétaire (profils.est_proprietaire).
    // Contrôle porté par le serveur : l'Edge Function est l'unique voie de
    // suppression, auth.users étant hors de portée du client. Le masquage du
    // bouton côté interface n'est qu'un confort, jamais la garantie.
    if (cible.role === 'admin') {
      // La réserve au propriétaire vise la suppression d'un PAIR : elle protège
      // les administrateurs les uns des autres. Elle n'a pas à s'appliquer à
      // quelqu'un qui s'en va de lui-même — l'opposer à sa propre demande
      // reviendrait à retenir une personne sur la plateforme, ce que le droit à
      // l'effacement interdit.
      // `?.` et non `.` : le contrôle « réservé aux administrateurs » plus haut
      // est désormais conditionné à `!autoSuppression`, donc il ne garantit
      // plus que `profilAppelant` soit non nul ici. Un profil introuvable —
      // cas anormal — doit refuser, et c'est ce que fait `!undefined`.
      if (!autoSuppression && !profilAppelant?.est_proprietaire) {
        return json(
          req,
          { erreur: 'Seul le propriétaire de la plateforme peut supprimer un administrateur.' },
          403,
        );
      }

      // Celle-ci, en revanche, s'applique dans les deux cas : un back-office
      // sans administrateur ne se rattrape pas depuis l'application.
      const { count } = await admin
        .from('profils')
        .select('id_profil', { count: 'exact', head: true })
        .eq('role', 'admin');
      if ((count ?? 0) <= 1) {
        return json(req, { erreur: 'Impossible de supprimer le dernier administrateur.' }, 400);
      }
    }

    // E-mail relevé AVANT la suppression (après, il n'est plus résolvable),
    // mais journalisé APRÈS : une tentative qui échoue ne doit pas laisser
    // dans la piste d'audit la trace d'une suppression qui n'a pas eu lieu.
    const {
      data: { user: utilisateurCible },
    } = await admin.auth.admin.getUserById(idCible);
    const emailCible = utilisateurCible?.email ?? null;

    // Fichiers nominatifs à retirer du Storage — relevés MAINTENANT, car la
    // cascade emportera dans un instant les lignes `certificats` qui portent
    // leur chemin. Après, plus rien ne permettrait de les retrouver : ils
    // resteraient dans le bucket, orphelins et hors de portée de toute purge.
    const { data: fichiers } = await admin.rpc('fichiers_personnels', {
      p_id_profil: idCible,
    });
    const chemins = ((fichiers ?? []) as { chemin: string }[]).map((f) => f.chemin).filter(Boolean);

    if (chemins.length > 0) {
      const { error: erreurStorage } = await admin.storage.from('certificats').remove(chemins);
      if (erreurStorage) {
        // On s'arrête là. Poursuivre supprimerait le compte en laissant les
        // diplômes derrière, et l'échec deviendrait invisible : la référence
        // aux fichiers aurait disparu avec la cascade.
        console.error('[supprimer-compte] purge des fichiers', erreurStorage);
        return json(
          req,
          {
            erreur:
              'La suppression des documents personnels a échoué. Aucune donnée n’a été supprimée.',
          },
          500,
        );
      }
    }

    // Cascade depuis auth.users : révoque aussi sessions et identités.
    const { error: erreurSuppression } = await admin.auth.admin.deleteUser(idCible);
    if (erreurSuppression) {
      console.error('[supprimer-compte]', erreurSuppression);
      return json(req, { erreur: 'La suppression du compte a échoué.' }, 500);
    }

    // Le compte est parti : l'échec de journalisation ne peut plus l'annuler.
    // On trace l'incident sans faire échouer une suppression déjà effective.
    //
    // Ce qui est écrit ici a changé. L'ancienne version consignait l'e-mail, le
    // prénom et le nom de la personne supprimée — c'est ainsi qu'un compte
    // effacé le 26 juillet figurait encore en clair dans le journal un mois
    // plus tard (audit RGPD §3.5). Ne subsistent que l'action, son auteur, et
    // l'identifiant technique de la personne : de quoi prouver ce qui s'est
    // passé, pas de quoi savoir qui c'était.
    const { error: erreurJournal } = await admin.from('journal_admin').insert({
      id_profil: appelant.id,
      id_profil_cible: idCible,
      action: 'suppression_compte',
      meta: {
        role: cible.role,
        origine: autoSuppression ? 'demande_de_la_personne' : 'administration',
      },
    });
    if (erreurJournal) {
      console.error('[supprimer-compte] journalisation manquée', erreurJournal);
    }

    // Les entrées ANTÉRIEURES, elles, portent encore l'identité : changements
    // de rôle, corrections d'identité, octrois d'accès… toutes citent l'e-mail
    // et parfois le nom. La cascade ne les touche pas (`id_profil` passe à NULL,
    // les colonnes restent). On les anonymise donc explicitement : l'action
    // demeure prouvable par `id_profil_cible`, la personne n'est plus
    // identifiable.
    const { error: erreurAnonymisation } = await admin.rpc('anonymiser_journal_personne', {
      p_id_profil: idCible,
      p_email: emailCible,
    });
    if (erreurAnonymisation) {
      // Signalé, mais non bloquant : le compte est supprimé, et une purge
      // manquée se rattrape — `appliquer_retention()` repassera dessus.
      console.error('[supprimer-compte] anonymisation du journal', erreurAnonymisation);
    }

    return json(req, { supprime: true }, 200);
  } catch (erreur) {
    console.error('[supprimer-compte]', erreur);
    return json(req, { erreur: 'La suppression du compte a échoué.' }, 500);
  }
});
