-- =============================================================================
-- TradingCorp — Schéma initial (post-audit, voir AUDIT-ARCHITECTURE.md)
--
-- Choix de conception assumés :
--   - Statuts/catégories en TEXT + CHECK (pas d'enum Postgres) : un enum
--     nécessite ALTER TYPE pour évoluer (pénible, parfois hors transaction) ;
--     un CHECK se modifie en une ligne. Cf. §3.2 de l'audit (« évolutivité »).
--   - UUID partout, générés en base (gen_random_uuid()).
--   - date_creation sur toutes les tables ; date_modification + trigger sur
--     les tables réellement éditables après création (cf. §3.2).
--   - D7 (vidéo) : video_provider générique ('youtube' pour l'instant,
--     'bunny' plus tard) — aucune migration de schéma nécessaire au switch.
--
-- Ordre du fichier : les TABLES sont toutes créées avant les FONCTIONS qui
-- les référencent (les fonctions `language sql` sont validées par Postgres
-- dès leur création, contrairement à `plpgsql` qui ne l'est qu'à l'exécution
-- — créer une fonction SQL référençant une table qui n'existe pas encore
-- échoue immédiatement avec "relation ... does not exist").
-- =============================================================================

create extension if not exists pgcrypto;

-- =============================================================================
-- 1. Fonction générique de trigger (aucune dépendance à une table — peut
--    être créée n'importe où dans le fichier).
-- =============================================================================

create or replace function public.set_date_modification()
returns trigger
language plpgsql
as $$
begin
  new.date_modification = now();
  return new;
end;
$$;

-- =============================================================================
-- 2. Identité — PROFIL étend auth.users (Supabase Auth gère mot de passe,
--    e-mail, Google, MFA TOTP ; rien de tout cela ne vit ici).
-- =============================================================================

create table profils (
  id_profil       uuid primary key references auth.users (id) on delete cascade,
  nom             text not null default '',
  prenom          text not null default '',
  avatar_url      text,
  role            text not null default 'apprenant' check (role in ('apprenant', 'formateur', 'admin')),
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_profils_modif before update on profils
  for each row execute function set_date_modification();

-- Création automatique du profil à l'inscription (auth.users -> profils).
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profils (id_profil, prenom, nom, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'prenom', ''),
    coalesce(new.raw_user_meta_data ->> 'nom', ''),
    'apprenant'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- 3. Catalogue
-- =============================================================================

create table formations (
  id_formation    uuid primary key default gen_random_uuid(),
  titre           text not null,
  slug            text not null unique,
  description     text,
  prix_centimes   integer not null default 0 check (prix_centimes >= 0),
  devise          text not null default 'eur',
  est_publiee     boolean not null default false,
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_formations_modif before update on formations
  for each row execute function set_date_modification();

create table sections (
  id_section      uuid primary key default gen_random_uuid(),
  id_formation    uuid not null references formations (id_formation) on delete cascade,
  titre           text not null,
  description     text,
  position        integer not null default 0,
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_sections_modif before update on sections
  for each row execute function set_date_modification();

create table lecons (
  id_lecon          uuid primary key default gen_random_uuid(),
  id_section        uuid not null references sections (id_section) on delete cascade,
  titre             text not null,
  contenu           text,
  duree_s           integer,
  video_provider    text not null default 'youtube' check (video_provider in ('youtube', 'bunny')),
  video_provider_id text,
  position          integer not null default 0,
  apercu_gratuit    boolean not null default false,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_lecons_modif before update on lecons
  for each row execute function set_date_modification();

create table ressources (
  id_ressource    uuid primary key default gen_random_uuid(),
  id_lecon        uuid not null references lecons (id_lecon) on delete cascade,
  nom             text not null,
  type_mime       text not null,
  chemin_storage  text not null,
  taille          bigint,
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_ressources_modif before update on ressources
  for each row execute function set_date_modification();

-- =============================================================================
-- 4. Commerce
-- =============================================================================

create table paiements (
  id_paiement           uuid primary key default gen_random_uuid(),
  id_profil             uuid references profils (id_profil) on delete set null,
  montant_centimes      integer not null check (montant_centimes >= 0),
  devise                text not null default 'eur',
  statut                text not null default 'en_attente'
                          check (statut in ('en_attente', 'reussi', 'rembourse', 'echoue')),
  moyen_paiement        text,
  reference_transaction text not null unique,
  email                 text,
  date_paiement         timestamptz not null default now(),
  date_modification     timestamptz not null default now()
);
comment on column paiements.id_profil is
  'Nullable + ON DELETE SET NULL : le paiement (pièce comptable) survit à la suppression du compte.';

create trigger trg_paiements_modif before update on paiements
  for each row execute function set_date_modification();

create table inscriptions (
  id_inscription  uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete cascade,
  id_formation    uuid not null references formations (id_formation) on delete cascade,
  id_paiement     uuid references paiements (id_paiement) on delete set null,
  statut          text not null default 'active' check (statut in ('active', 'revoquee')),
  source          text not null default 'manuel' check (source in ('paiement', 'manuel')),
  date_inscription timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  unique (id_profil, id_formation)
);

create trigger trg_inscriptions_modif before update on inscriptions
  for each row execute function set_date_modification();

-- =============================================================================
-- 5. Pédagogie
-- =============================================================================

create table progression_lecons (
  id_progression_lecon uuid primary key default gen_random_uuid(),
  id_profil            uuid not null references profils (id_profil) on delete cascade,
  id_lecon             uuid not null references lecons (id_lecon) on delete cascade,
  terminee_le          timestamptz,
  position_video_s     integer not null default 0,
  date_creation        timestamptz not null default now(),
  unique (id_profil, id_lecon)
);

create table quiz (
  id_quiz           uuid primary key default gen_random_uuid(),
  id_formation      uuid not null references formations (id_formation) on delete cascade,
  titre             text not null,
  score_requis      integer not null default 70 check (score_requis between 0 and 100),
  est_examen_final  boolean not null default false,
  position          integer not null default 0,
  date_creation     timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_quiz_modif before update on quiz
  for each row execute function set_date_modification();

create table questions (
  id_question     uuid primary key default gen_random_uuid(),
  id_quiz         uuid not null references quiz (id_quiz) on delete cascade,
  libelle         text not null,
  position        integer not null default 0,
  type            text not null default 'choix_unique' check (type in ('choix_unique', 'choix_multiple')),
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_questions_modif before update on questions
  for each row execute function set_date_modification();

create table reponses (
  id_reponse      uuid primary key default gen_random_uuid(),
  id_question     uuid not null references questions (id_question) on delete cascade,
  contenu         text not null,
  correcte        boolean not null default false,
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);
comment on column reponses.correcte is
  'Jamais exposée au client authentifié — voir la vue reponses_publiques et la policy RLS staff-only.';

create trigger trg_reponses_modif before update on reponses
  for each row execute function set_date_modification();

create table tentatives_quiz (
  id_tentative      uuid primary key default gen_random_uuid(),
  id_profil         uuid not null references profils (id_profil) on delete cascade,
  id_quiz           uuid not null references quiz (id_quiz) on delete cascade,
  score             integer not null check (score between 0 and 100),
  reussi            boolean not null,
  reponses_donnees  jsonb not null default '{}'::jsonb,
  date_passage      timestamptz not null default now()
);
comment on table tentatives_quiz is
  'Écrite uniquement par le service_role (Edge Function de correction) — jamais par le client.';

create table certificats (
  id_certificat   uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete cascade,
  id_formation    uuid not null references formations (id_formation) on delete cascade,
  numero          text not null unique,
  date_obtention  timestamptz not null default now(),
  chemin_storage  text,
  unique (id_profil, id_formation)
);

-- =============================================================================
-- 6. Communauté
-- =============================================================================

create table commentaires (
  id_commentaire  uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete cascade,
  id_lecon        uuid not null references lecons (id_lecon) on delete cascade,
  id_parent       uuid references commentaires (id_commentaire) on delete cascade,
  contenu         text not null,
  statut          text not null default 'en_attente' check (statut in ('en_attente', 'approuve', 'rejete')),
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now()
);

create trigger trg_commentaires_modif before update on commentaires
  for each row execute function set_date_modification();

create table avis (
  id_avis         uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete cascade,
  id_formation    uuid not null references formations (id_formation) on delete cascade,
  note            integer not null check (note between 1 and 5),
  contenu         text,
  statut          text not null default 'en_attente' check (statut in ('en_attente', 'approuve', 'rejete')),
  date_creation   timestamptz not null default now(),
  date_modification timestamptz not null default now(),
  unique (id_profil, id_formation)
);

create trigger trg_avis_modif before update on avis
  for each row execute function set_date_modification();

create table notifications (
  id_notification uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete cascade,
  titre           text not null,
  message         text,
  type            text not null default 'info',
  lien            text,
  date_envoi      timestamptz not null default now(),
  lu_le           timestamptz
);

-- =============================================================================
-- 7. Administration
-- =============================================================================

create table journal_admin (
  id_journal      uuid primary key default gen_random_uuid(),
  id_profil       uuid not null references profils (id_profil) on delete restrict,
  action          text not null,
  cible           text,
  meta            jsonb,
  date_action     timestamptz not null default now()
);
comment on table journal_admin is
  'ON DELETE RESTRICT sur id_profil : un admin ne peut pas être supprimé silencieusement '
  'sans traiter d''abord son journal (intégrité de la piste d''audit).';

-- =============================================================================
-- 8. Index (Postgres n'indexe pas les FK automatiquement — §3.2 de l'audit)
-- =============================================================================

create index idx_sections_formation on sections (id_formation);
create index idx_lecons_section on lecons (id_section);
create index idx_ressources_lecon on ressources (id_lecon);
create index idx_inscriptions_profil on inscriptions (id_profil);
create index idx_inscriptions_formation on inscriptions (id_formation);
create index idx_paiements_profil on paiements (id_profil);
create index idx_progression_profil on progression_lecons (id_profil);
create index idx_progression_lecon on progression_lecons (id_lecon);
create index idx_quiz_formation on quiz (id_formation);
create index idx_questions_quiz on questions (id_quiz);
create index idx_reponses_question on reponses (id_question);
create index idx_tentatives_profil on tentatives_quiz (id_profil);
create index idx_tentatives_quiz on tentatives_quiz (id_quiz);
create index idx_certificats_profil on certificats (id_profil);
create index idx_commentaires_lecon_statut on commentaires (id_lecon, statut);
create index idx_commentaires_parent on commentaires (id_parent);
create index idx_avis_formation_statut on avis (id_formation, statut);
create index idx_notifications_profil_non_lues on notifications (id_profil) where lu_le is null;
create index idx_journal_profil on journal_admin (id_profil);

-- =============================================================================
-- 9. Fonctions de sécurité RLS
--    (SECURITY DEFINER : exécutées par le rôle propriétaire de la migration,
--    qui contourne RLS — évite toute récursion quand ces fonctions sont
--    appelées depuis une policy RLS. Créées ICI, après les tables qu'elles
--    référencent : ce sont des fonctions `language sql`, validées par
--    Postgres dès leur création.)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from profils where id_profil = auth.uid() and role = 'admin');
$$;

create or replace function public.is_formateur_ou_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profils where id_profil = auth.uid() and role in ('formateur', 'admin')
  );
$$;

create or replace function public.a_inscription_active(p_id_formation uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from inscriptions
    where id_profil = auth.uid() and id_formation = p_id_formation and statut = 'active'
  );
$$;

-- =============================================================================
-- 10. Vues
-- =============================================================================

-- Progression calculée (jamais stockée — cf. D4 de l'audit).
create view progression_formation as
select
  i.id_profil,
  i.id_formation,
  coalesce(
    round(
      100.0 * count(pl.id_progression_lecon) filter (where pl.terminee_le is not null)
      / nullif(count(l.id_lecon), 0)
    ),
    0
  )::integer as pourcentage_termine
from inscriptions i
join sections s on s.id_formation = i.id_formation
join lecons l on l.id_section = s.id_section
left join progression_lecons pl on pl.id_lecon = l.id_lecon and pl.id_profil = i.id_profil
group by i.id_profil, i.id_formation;

-- Options de réponse sans la colonne "correcte" (pour l'affichage du quiz).
create view reponses_publiques as
select id_reponse, id_question, contenu
from reponses;

grant select on reponses_publiques to authenticated;

-- Vérification publique d'un certificat (/verifier/{numero}) — pas d'accès
-- direct à la table certificats pour les visiteurs anonymes.
create view certificats_verification as
select c.numero, f.titre as titre_formation, p.prenom, p.nom, c.date_obtention
from certificats c
join formations f on f.id_formation = c.id_formation
join profils p on p.id_profil = c.id_profil;

grant select on certificats_verification to anon, authenticated;

-- =============================================================================
-- 11. Row Level Security — activée sur TOUTES les tables (§4 de l'audit)
-- =============================================================================

alter table profils enable row level security;
alter table formations enable row level security;
alter table sections enable row level security;
alter table lecons enable row level security;
alter table ressources enable row level security;
alter table paiements enable row level security;
alter table inscriptions enable row level security;
alter table progression_lecons enable row level security;
alter table quiz enable row level security;
alter table questions enable row level security;
alter table reponses enable row level security;
alter table tentatives_quiz enable row level security;
alter table certificats enable row level security;
alter table commentaires enable row level security;
alter table avis enable row level security;
alter table notifications enable row level security;
alter table journal_admin enable row level security;

-- --- profils ---
create policy "profils_select_self_ou_staff" on profils for select
  using (id_profil = auth.uid() or is_formateur_ou_admin());
create policy "profils_update_self" on profils for update
  using (id_profil = auth.uid()) with check (id_profil = auth.uid());
create policy "profils_update_admin" on profils for update
  using (is_admin()) with check (is_admin());

-- --- formations : catalogue public si publiée, tout pour formateur/admin ---
create policy "formations_select_public" on formations for select
  using (est_publiee or is_formateur_ou_admin());
create policy "formations_write_staff" on formations for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- sections : même logique, via la formation parente ---
create policy "sections_select_public" on sections for select
  using (
    is_formateur_ou_admin()
    or exists (select 1 from formations f where f.id_formation = sections.id_formation and f.est_publiee)
  );
create policy "sections_write_staff" on sections for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- leçons : aperçu gratuit, ou inscription active, ou staff ---
create policy "lecons_select_gated" on lecons for select
  using (
    is_formateur_ou_admin()
    or apercu_gratuit
    or exists (
      select 1 from sections s
      where s.id_section = lecons.id_section and a_inscription_active(s.id_formation)
    )
  );
create policy "lecons_write_staff" on lecons for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- ressources : gating identique via leçon -> section -> formation ---
create policy "ressources_select_gated" on ressources for select
  using (
    is_formateur_ou_admin()
    or exists (
      select 1 from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = ressources.id_lecon
        and (l.apercu_gratuit or a_inscription_active(s.id_formation))
    )
  );
create policy "ressources_write_staff" on ressources for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- paiements : lecture propriétaire/admin, écriture service_role uniquement ---
create policy "paiements_select_self_ou_admin" on paiements for select
  using (id_profil = auth.uid() or is_admin());

-- --- inscriptions : lecture propriétaire/staff, écriture admin (ou service_role) ---
create policy "inscriptions_select_self_ou_staff" on inscriptions for select
  using (id_profil = auth.uid() or is_formateur_ou_admin());
create policy "inscriptions_write_admin" on inscriptions for all
  using (is_admin()) with check (is_admin());

-- --- progression : propriétaire uniquement, lecture staff pour le suivi ---
create policy "progression_all_self" on progression_lecons for all
  using (id_profil = auth.uid()) with check (id_profil = auth.uid());
create policy "progression_select_staff" on progression_lecons for select
  using (is_formateur_ou_admin());

-- --- quiz / questions : gated comme le contenu de cours ---
create policy "quiz_select_gated" on quiz for select
  using (is_formateur_ou_admin() or a_inscription_active(id_formation));
create policy "quiz_write_staff" on quiz for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

create policy "questions_select_gated" on questions for select
  using (
    is_formateur_ou_admin()
    or exists (select 1 from quiz q where q.id_quiz = questions.id_quiz and a_inscription_active(q.id_formation))
  );
create policy "questions_write_staff" on questions for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- réponses : STAFF UNIQUEMENT (le client passe par la vue reponses_publiques) ---
create policy "reponses_select_staff" on reponses for select
  using (is_formateur_ou_admin());
create policy "reponses_write_staff" on reponses for all
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- tentatives : lecture propriétaire/staff, écriture service_role uniquement ---
create policy "tentatives_select_self_ou_staff" on tentatives_quiz for select
  using (id_profil = auth.uid() or is_formateur_ou_admin());

-- --- certificats : lecture propriétaire/staff (vérification publique = vue dédiée) ---
create policy "certificats_select_self_ou_staff" on certificats for select
  using (id_profil = auth.uid() or is_formateur_ou_admin());

-- --- commentaires : lecture des approuvés + les siens, modération staff ---
create policy "commentaires_select_approuves_ou_soi_ou_staff" on commentaires for select
  using (statut = 'approuve' or id_profil = auth.uid() or is_formateur_ou_admin());
create policy "commentaires_insert_inscrits" on commentaires for insert
  with check (
    id_profil = auth.uid()
    and exists (
      select 1 from lecons l
      join sections s on s.id_section = l.id_section
      where l.id_lecon = commentaires.id_lecon and a_inscription_active(s.id_formation)
    )
  );
create policy "commentaires_update_soi_en_attente" on commentaires for update
  using (id_profil = auth.uid() and statut = 'en_attente') with check (id_profil = auth.uid());
create policy "commentaires_moderation_staff" on commentaires for update
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());
create policy "commentaires_delete_soi_ou_staff" on commentaires for delete
  using (id_profil = auth.uid() or is_formateur_ou_admin());

-- --- avis : même logique que les commentaires ---
create policy "avis_select_approuves_ou_soi_ou_staff" on avis for select
  using (statut = 'approuve' or id_profil = auth.uid() or is_formateur_ou_admin());
create policy "avis_insert_inscrits" on avis for insert
  with check (id_profil = auth.uid() and a_inscription_active(id_formation));
create policy "avis_update_soi_en_attente" on avis for update
  using (id_profil = auth.uid() and statut = 'en_attente') with check (id_profil = auth.uid());
create policy "avis_moderation_staff" on avis for update
  using (is_formateur_ou_admin()) with check (is_formateur_ou_admin());

-- --- notifications : strictement le propriétaire ---
create policy "notifications_select_self" on notifications for select
  using (id_profil = auth.uid());
create policy "notifications_update_self" on notifications for update
  using (id_profil = auth.uid()) with check (id_profil = auth.uid());

-- --- journal_admin : strictement admin ---
create policy "journal_select_admin" on journal_admin for select
  using (is_admin());
create policy "journal_insert_admin" on journal_admin for insert
  with check (is_admin() and id_profil = auth.uid());

-- =============================================================================
-- Fin. Aucune policy INSERT/UPDATE n'est définie pour "authenticated" sur
-- paiements et tentatives_quiz : ces tables ne sont écrites QUE par le
-- service_role (webhook Stripe, Edge Function de correction), qui contourne
-- RLS par défaut dans Supabase. C'est intentionnel (cf. D3, D5 de l'audit).
-- =============================================================================
