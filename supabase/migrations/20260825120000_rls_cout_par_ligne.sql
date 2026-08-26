-- =============================================================================
-- TradingCorp — La RLS cesse de payer au nombre de lignes
--
-- Audit du 31/07/2026, P-13. L'analyseur remontait deux familles de coût :
--
--   • 17 × auth_rls_initplan : les policies appellent `auth.uid()` directement.
--     PostgreSQL réévalue la fonction POUR CHAQUE LIGNE examinée. Enveloppée
--     dans un sous-select non corrélé — `(select auth.uid())` — elle devient un
--     InitPlan, évalué UNE fois par requête. Le résultat est identique : la
--     valeur ne dépend pas de la ligne. C'est une transformation d'exécution,
--     pas de sémantique.
--
--   • 72 × multiple_permissive_policies : deux causes cumulées.
--
--     1. Toutes les policies visaient `public`, c'est-à-dire TOUS les rôles.
--        Chaque cumul était donc compté autant de fois qu'il y a de rôles.
--        Elles visent désormais `authenticated`, et `anon` uniquement là où
--        une page publique en dépend (catalogue et programme).
--
--     2. Chaque table de contenu portait un `FOR ALL … is_formateur_ou_admin()`
--        EN PLUS d'une policy SELECT qui contenait déjà `is_formateur_ou_admin()`.
--        Le staff était donc autorisé deux fois en lecture, et PostgreSQL
--        évaluait les deux. Le `FOR ALL` est remplacé par les trois commandes
--        d'écriture qu'il visait réellement ; la lecture reste couverte par la
--        policy SELECT, inchangée dans ce qu'elle autorise.
--
-- Les fonctions de garde sans paramètre — `is_admin()`, `is_formateur_ou_admin()`
-- — sont enveloppées pour la même raison que `auth.uid()` : STABLE et sans
-- argument, leur résultat est constant sur toute la requête. Celles qui prennent
-- une colonne — `a_inscription_active(id_formation)`, `lecon_debloquee(id_lecon)`
-- — dépendent de la ligne et RESTENT appelées par ligne : les envelopper
-- changerait le résultat.
--
-- AUCUNE AUTORISATION N'EST MODIFIÉE. Chaque policy recréée autorise exactement
-- ce qu'autorisait la précédente, aux deux nuances suivantes, voulues :
--
--   • `anon` perd l'accès en lecture aux tables où il n'avait de toute façon
--     rien à lire (ses `auth.uid()` valaient NULL) : avis, commentaires,
--     certificats, inscriptions, notifications, paiements, profils,
--     progression, tentatives, et le contenu pédagogique protégé. Vérifié côté
--     front : aucune page accessible sans connexion ne les interroge — la
--     landing et les facteurs ne lisent que `formations` et `sections`, et la
--     vérification publique d'un certificat passe par une RPC SECURITY DEFINER,
--     hors RLS.
--   • Les deux policies UPDATE de `profils` disparaissent : voir la migration
--     jumelle sur les privilèges (P-12), elles n'ont jamais pu s'appliquer.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- avis
-- -----------------------------------------------------------------------------
drop policy if exists avis_select_approuves_ou_soi_ou_staff on public.avis;
drop policy if exists avis_insert_inscrits                  on public.avis;
drop policy if exists avis_moderation_staff                 on public.avis;
drop policy if exists avis_update_soi_en_attente            on public.avis;

create policy avis_select_approuves_ou_soi_ou_staff on public.avis
  for select to authenticated
  using (
    statut = 'approuve'
    or id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

create policy avis_insert_inscrits on public.avis
  for insert to authenticated
  with check (
    id_profil = (select auth.uid())
    and a_inscription_active(id_formation)
    and statut = 'en_attente'
  );

-- Les deux anciennes policies UPDATE — modération par le staff, correction par
-- l'auteur tant que l'avis est en attente — fusionnées en une seule. Deux
-- policies permissives se combinaient déjà par OU ; l'écrire ainsi ne change
-- rien à ce qui passe, et n'évalue plus qu'une expression au lieu de deux.
create policy avis_update_staff_ou_auteur_en_attente on public.avis
  for update to authenticated
  using (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente')
  )
  with check (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente')
  );

-- -----------------------------------------------------------------------------
-- certificats
-- -----------------------------------------------------------------------------
drop policy if exists certificats_select_self_ou_staff on public.certificats;

create policy certificats_select_self_ou_staff on public.certificats
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

-- -----------------------------------------------------------------------------
-- commentaires
-- -----------------------------------------------------------------------------
drop policy if exists commentaires_select_approuves_ou_soi_ou_staff on public.commentaires;
drop policy if exists commentaires_insert_inscrits                  on public.commentaires;
drop policy if exists commentaires_moderation_staff                 on public.commentaires;
drop policy if exists commentaires_update_soi_en_attente            on public.commentaires;
drop policy if exists commentaires_delete_soi_ou_staff              on public.commentaires;

create policy commentaires_select_approuves_ou_soi_ou_staff on public.commentaires
  for select to authenticated
  using (
    statut = 'approuve'
    or id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

create policy commentaires_insert_inscrits on public.commentaires
  for insert to authenticated
  with check (
    id_profil = (select auth.uid())
    and statut = 'en_attente'
    and exists (
      select 1
      from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = commentaires.id_lecon
        and a_inscription_active(s.id_formation)
    )
  );

create policy commentaires_update_staff_ou_auteur_en_attente on public.commentaires
  for update to authenticated
  using (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente')
  )
  with check (
    (select is_formateur_ou_admin())
    or (id_profil = (select auth.uid()) and statut = 'en_attente')
  );

create policy commentaires_delete_soi_ou_staff on public.commentaires
  for delete to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

-- -----------------------------------------------------------------------------
-- formations — le catalogue est la vitrine : `anon` doit continuer à le lire.
-- -----------------------------------------------------------------------------
drop policy if exists formations_select_public on public.formations;
drop policy if exists formations_write_staff   on public.formations;

create policy formations_select_public on public.formations
  for select to anon, authenticated
  using (est_publiee or (select is_formateur_ou_admin()));

create policy formations_insert_staff on public.formations
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy formations_update_staff on public.formations
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy formations_delete_staff on public.formations
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- inscriptions
-- -----------------------------------------------------------------------------
drop policy if exists inscriptions_select_self_ou_staff on public.inscriptions;
drop policy if exists inscriptions_write_admin          on public.inscriptions;

create policy inscriptions_select_self_ou_staff on public.inscriptions
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

create policy inscriptions_insert_admin on public.inscriptions
  for insert to authenticated with check ((select is_admin()));

create policy inscriptions_update_admin on public.inscriptions
  for update to authenticated
  using ((select is_admin())) with check ((select is_admin()));

create policy inscriptions_delete_admin on public.inscriptions
  for delete to authenticated using ((select is_admin()));

-- -----------------------------------------------------------------------------
-- journal_admin
-- -----------------------------------------------------------------------------
drop policy if exists journal_select_admin on public.journal_admin;
drop policy if exists journal_insert_admin on public.journal_admin;

create policy journal_select_admin on public.journal_admin
  for select to authenticated using ((select is_admin()));

create policy journal_insert_admin on public.journal_admin
  for insert to authenticated
  with check ((select is_admin()) and id_profil = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- lecons
-- -----------------------------------------------------------------------------
drop policy if exists lecons_select_gated on public.lecons;
drop policy if exists lecons_write_staff  on public.lecons;

create policy lecons_select_gated on public.lecons
  for select to authenticated
  using (
    (select is_formateur_ou_admin())
    or (
      est_publiee
      and exists (
        select 1 from sections s
        where s.id_section = lecons.id_section
          and a_inscription_active(s.id_formation)
      )
      and lecon_debloquee(id_lecon)
    )
  );

create policy lecons_insert_staff on public.lecons
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy lecons_update_staff on public.lecons
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy lecons_delete_staff on public.lecons
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------
drop policy if exists notifications_select_self on public.notifications;
drop policy if exists notifications_update_self on public.notifications;

create policy notifications_select_self on public.notifications
  for select to authenticated using (id_profil = (select auth.uid()));

create policy notifications_update_self on public.notifications
  for update to authenticated
  using (id_profil = (select auth.uid()))
  with check (id_profil = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- paiements
-- -----------------------------------------------------------------------------
drop policy if exists paiements_select_self_ou_admin on public.paiements;

create policy paiements_select_self_ou_admin on public.paiements
  for select to authenticated
  using (id_profil = (select auth.uid()) or (select is_admin()));

-- -----------------------------------------------------------------------------
-- profils — les deux policies UPDATE ne sont pas recréées : aucun rôle n'a le
-- privilège UPDATE sur cette table, elles n'ont jamais pu s'appliquer (P-12).
-- -----------------------------------------------------------------------------
drop policy if exists profils_select_self_ou_staff on public.profils;
drop policy if exists profils_update_self          on public.profils;
drop policy if exists profils_update_admin         on public.profils;

create policy profils_select_self_ou_staff on public.profils
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

-- -----------------------------------------------------------------------------
-- progression_lecons — le `FOR ALL` de l'apprenant se décompose ; la lecture du
-- staff, qui faisait l'objet d'une seconde policy, rejoint la policy SELECT.
-- -----------------------------------------------------------------------------
drop policy if exists progression_all_self      on public.progression_lecons;
drop policy if exists progression_select_staff  on public.progression_lecons;

create policy progression_select_self_ou_staff on public.progression_lecons
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );

create policy progression_insert_self on public.progression_lecons
  for insert to authenticated with check (id_profil = (select auth.uid()));

create policy progression_update_self on public.progression_lecons
  for update to authenticated
  using (id_profil = (select auth.uid()))
  with check (id_profil = (select auth.uid()));

create policy progression_delete_self on public.progression_lecons
  for delete to authenticated using (id_profil = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- questions
-- -----------------------------------------------------------------------------
drop policy if exists questions_select_gated on public.questions;
drop policy if exists questions_write_staff  on public.questions;

create policy questions_select_gated on public.questions
  for select to authenticated
  using (
    (select is_formateur_ou_admin())
    or exists (
      select 1 from quiz q
      where q.id_quiz = questions.id_quiz
        and a_inscription_active(q.id_formation)
        and (q.id_lecon is null or lecon_debloquee(q.id_lecon))
    )
  );

create policy questions_insert_staff on public.questions
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy questions_update_staff on public.questions
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy questions_delete_staff on public.questions
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- quiz
-- -----------------------------------------------------------------------------
drop policy if exists quiz_select_gated on public.quiz;
drop policy if exists quiz_write_staff  on public.quiz;

create policy quiz_select_gated on public.quiz
  for select to authenticated
  using (
    (select is_formateur_ou_admin())
    or (
      a_inscription_active(id_formation)
      and (id_lecon is null or lecon_debloquee(id_lecon))
    )
  );

create policy quiz_insert_staff on public.quiz
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy quiz_update_staff on public.quiz
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy quiz_delete_staff on public.quiz
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- reponses — `correcte` ne sort jamais d'ici pour un apprenant : la lecture est
-- réservée au staff, les apprenants passent par `reponses_publiques()`.
-- -----------------------------------------------------------------------------
drop policy if exists reponses_select_staff on public.reponses;
drop policy if exists reponses_write_staff  on public.reponses;

create policy reponses_select_staff on public.reponses
  for select to authenticated using ((select is_formateur_ou_admin()));

create policy reponses_insert_staff on public.reponses
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy reponses_update_staff on public.reponses
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy reponses_delete_staff on public.reponses
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- ressources
-- -----------------------------------------------------------------------------
drop policy if exists ressources_select_gated on public.ressources;
drop policy if exists ressources_write_staff  on public.ressources;

create policy ressources_select_gated on public.ressources
  for select to authenticated
  using (
    (est_active or (select is_formateur_ou_admin()))
    and ((select is_formateur_ou_admin()) or lecon_debloquee(id_lecon))
  );

create policy ressources_insert_staff on public.ressources
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy ressources_update_staff on public.ressources
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy ressources_delete_staff on public.ressources
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- sections — le programme est visible depuis la vitrine, `anon` compris.
-- -----------------------------------------------------------------------------
drop policy if exists sections_select_public on public.sections;
drop policy if exists sections_write_staff   on public.sections;

create policy sections_select_public on public.sections
  for select to anon, authenticated
  using (
    (select is_formateur_ou_admin())
    or (
      est_publiee
      and exists (
        select 1 from formations f
        where f.id_formation = sections.id_formation and f.est_publiee
      )
    )
  );

create policy sections_insert_staff on public.sections
  for insert to authenticated with check ((select is_formateur_ou_admin()));

create policy sections_update_staff on public.sections
  for update to authenticated
  using ((select is_formateur_ou_admin()))
  with check ((select is_formateur_ou_admin()));

create policy sections_delete_staff on public.sections
  for delete to authenticated using ((select is_formateur_ou_admin()));

-- -----------------------------------------------------------------------------
-- tentatives_quiz — écrites uniquement par l'Edge Function de correction, en
-- rôle de service : aucune policy d'écriture, c'est voulu.
-- -----------------------------------------------------------------------------
drop policy if exists tentatives_select_self_ou_staff on public.tentatives_quiz;

create policy tentatives_select_self_ou_staff on public.tentatives_quiz
  for select to authenticated
  using (
    id_profil = (select auth.uid())
    or (select is_formateur_ou_admin())
  );
