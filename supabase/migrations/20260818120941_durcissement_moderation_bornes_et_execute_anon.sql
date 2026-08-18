-- =============================================================================
-- TradingCorp — Trois durcissements côté serveur
--
-- 1. MODÉRATION CONTOURNABLE À L'INSERTION (faille réelle)
--
-- 20260731213450 avait fermé la voie UPDATE : un auteur ne peut plus faire
-- passer son avis de « en_attente » à « approuve ». Mais la voie INSERT est
-- restée ouverte — les policies avis_insert_inscrits et
-- commentaires_insert_inscrits ne contraignaient que id_profil et
-- l'inscription, jamais le statut. Or `authenticated` a le privilège INSERT
-- sur la colonne statut : un apprenant inscrit pouvait donc publier
-- directement un avis « approuve », la valeur par défaut 'en_attente' n'étant
-- appliquée qu'à défaut de valeur fournie. La modération devenait facultative
-- pour qui écrit sa requête à la main.
--
-- Corrigé en exigeant le statut d'entrée dans le WITH CHECK, comme le fait
-- déjà la règle d'UPDATE. Le staff garde sa policy de modération, seule voie
-- pour approuver.
--
-- 2. BORNES DE LONGUEUR
--
-- Les colonnes de texte libre écrites par les clients n'avaient aucune borne.
-- Un `text` Postgres accepte jusqu'à 1 Go : un compte inscrit pouvait gonfler
-- la base sans limite. Les bornes posées ici sont larges au regard de l'usage
-- réel (le plus long titre existant fait 49 caractères, les prénoms 7).
--
-- 3. EXECUTE RETIRÉ À anon
--
-- 20260724141418 avait retiré à anon les RPC d'administration, mais les RPC
-- de parcours restaient exécutables sans être connecté. Le contrôle interne
-- (auth.uid() nul, gating par inscription) les rendait inoffensives — vérifié
-- en appelant l'API en anonyme : lecon_contenu renvoie [], terminer_lecon
-- refuse. Ce n'est pas une faille, c'est une surface inutile : le front
-- n'appelle aucune de ces fonctions sans session (la landing ne touche pas la
-- base). Une évolution future qui relâcherait un contrôle interne n'aurait
-- alors plus de second rempart. delivrer_certificat était le cas le moins
-- confortable : elle prend l'identifiant du profil en PARAMÈTRE plutôt que
-- via auth.uid().
--
-- ⚠️ Ces révocations sont RESTÉES SANS EFFET, la grant PUBLIC couvrant anon :
-- voir 20260818121104, qui applique le motif complet (revoke à PUBLIC puis
-- grant à authenticated). Elles sont conservées ici parce qu'elles ont été
-- exécutées telles quelles en base.
--
-- verifier_certificat reste exécutable par anon : vérifier l'authenticité d'un
-- certificat depuis l'extérieur est sa raison d'être.
-- =============================================================================

-- 1. Modération -----------------------------------------------------------

drop policy if exists "avis_insert_inscrits" on public.avis;
create policy "avis_insert_inscrits" on public.avis for insert
  with check (
    id_profil = auth.uid()
    and a_inscription_active(id_formation)
    and statut = 'en_attente'
  );

drop policy if exists "commentaires_insert_inscrits" on public.commentaires;
create policy "commentaires_insert_inscrits" on public.commentaires for insert
  with check (
    id_profil = auth.uid()
    and statut = 'en_attente'
    and exists (
      select 1 from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = commentaires.id_lecon
        and a_inscription_active(s.id_formation)
    )
  );

-- 2. Bornes de longueur ---------------------------------------------------

alter table public.avis add constraint avis_contenu_borne
  check (contenu is null or length(contenu) <= 5000);

alter table public.commentaires add constraint commentaires_contenu_borne
  check (contenu is null or length(contenu) <= 5000);

alter table public.profils add constraint profils_identite_bornee
  check (
    (prenom is null or length(prenom) <= 100)
    and (nom is null or length(nom) <= 100)
  );

-- 3. EXECUTE retiré à anon ------------------------------------------------

revoke execute on function public.a_inscription_active(uuid) from anon;
revoke execute on function public.acces_demo() from anon;
revoke execute on function public.delivrer_certificat(uuid, uuid) from anon;
revoke execute on function public.etats_lecons(uuid) from anon;
revoke execute on function public.etats_modules(uuid) from anon;
revoke execute on function public.formation_achevee(uuid, uuid) from anon;
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_formateur_ou_admin() from anon;
revoke execute on function public.lecon_contenu(uuid) from anon;
revoke execute on function public.lecon_debloquee(uuid) from anon;
revoke execute on function public.reponses_publiques(uuid) from anon;
revoke execute on function public.terminer_lecon(uuid) from anon;
revoke execute on function public.video_lecon_terminee(uuid) from anon;
