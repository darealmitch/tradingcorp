-- =============================================================================
-- Factures : table, numérotation continue et espace de stockage.
--
-- POURQUOI. Un paiement ne laissait aucune trace remise à l'acheteur : le
-- webhook enregistrait la ligne dans `paiements` et posait une notification
-- dans l'espace. Or l'arrêté du 3 octobre 1983 impose une note pour toute
-- prestation de services à un particulier au-delà de 25 € TTC — la formation
-- est à 997 €. Et l'article L221-13 du Code de la consommation exige une
-- confirmation sur support durable, ce qu'une notification effaçable n'est pas.
--
-- LA NUMÉROTATION EST LE POINT DÉLICAT. `numero_certificat()` tire un code
-- aléatoire : très bien pour un diplôme, INTERDIT pour une facture. L'article
-- 242 nonies A de l'annexe II au CGI impose une séquence chronologique,
-- continue et sans rupture. D'où un compteur en table plutôt qu'une séquence
-- Postgres : `nextval` ne se rembobine pas, et une transaction annulée y
-- laisserait un trou impossible à justifier lors d'un contrôle.
-- =============================================================================

-- 1. Le compteur ---------------------------------------------------------------
--
-- Une ligne par année. L'`insert … on conflict do update … returning` verrouille
-- la ligne de l'année en cours : deux paiements simultanés s'ordonnent au lieu
-- de se disputer le même numéro. Si la transaction échoue, l'incrément est
-- annulé avec elle — pas de trou.
create table if not exists public.compteur_factures (
  annee integer primary key,
  dernier integer not null default 0 check (dernier >= 0)
);

comment on table public.compteur_factures is
  'Dernier rang de facture attribué, par année. Support de numero_facture() : '
  'garantit une numérotation continue, ce qu''une séquence ne peut pas faire.';

alter table public.compteur_factures enable row level security;

-- Une policy qui n'autorise RIEN, plutôt qu'aucune policy.
--
-- Le résultat est le même — la table reste hermétique, seul `numero_facture()`
-- y touche en SECURITY DEFINER — mais l'intention est écrite. Une table sous
-- RLS sans aucune policy se lit comme un oubli, et le socle de sécurité du
-- projet la refuse pour cette raison (00_socle_securite : « une table protégée
-- mais sans policy est hermétique : c'est un oubli, pas une protection »).
drop policy if exists "compteur_factures_ferme" on public.compteur_factures;
create policy "compteur_factures_ferme" on public.compteur_factures for all
  to authenticated, anon
  using (false)
  with check (false);

-- ⚠️ LA POLICY NE SUFFIT PAS. Supabase accorde par défaut tous les privilèges
-- aux rôles de l'API sur chaque table créée — `TRUNCATE` compris. Or TRUNCATE
-- n'est PAS soumis à la RLS : un compte authentifié aurait pu vider ce
-- compteur, faire repartir la numérotation à 0001 et produire des numéros de
-- facture en double. La révocation est donc la vraie protection ; la policy
-- ci-dessus n'exprime que l'intention.
revoke all on public.compteur_factures from authenticated, anon;

create or replace function public.numero_facture()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_annee integer := extract(year from now())::integer;
  v_rang  integer;
begin
  insert into compteur_factures (annee, dernier)
  values (v_annee, 1)
  on conflict (annee) do update set dernier = compteur_factures.dernier + 1
  returning dernier into v_rang;

  -- « F2026-0001 » : l'année rend la série lisible, le rang sur quatre chiffres
  -- garde l'ordre alphabétique aligné sur l'ordre chronologique.
  return 'F' || v_annee || '-' || lpad(v_rang::text, 4, '0');
end;
$$;

revoke execute on function public.numero_facture() from public;
grant execute on function public.numero_facture() to service_role;
-- Personne d'autre que le serveur : un client qui l'appellerait consommerait
-- des numéros pour rien, et créerait les trous que tout ceci évite. Le
-- `grant` au service_role n'est pas décoratif — la révocation à PUBLIC le
-- prive aussi du droit, et le webhook appelle la fonction sous ce rôle.

-- 2. Les factures ---------------------------------------------------------------
--
-- L'identité de l'acheteur est FIGÉE à l'émission plutôt que jointe au profil.
-- Une facture est un document daté : elle ne doit pas changer parce que
-- l'apprenant corrige son nom, et elle doit survivre à la suppression de son
-- compte — l'obligation comptable de conservation (dix ans) l'emporte sur le
-- droit à l'effacement (RGPD art. 17.3.b).
create table if not exists public.factures (
  id_facture       uuid primary key default gen_random_uuid(),
  numero           text not null unique,
  id_profil        uuid references public.profils(id_profil) on delete set null,
  id_paiement      uuid references public.paiements(id_paiement) on delete set null,
  designation      text not null,
  montant_centimes integer not null check (montant_centimes >= 0),
  devise           text not null default 'eur',
  -- Identité de l'acheteur au jour de la vente.
  client_nom       text,
  client_email     text,
  date_emission    timestamptz not null default now(),
  chemin_storage   text,
  mode_test        boolean not null default false
);

comment on table public.factures is
  'Factures émises. Numérotation continue par numero_facture(). Les données '
  'client sont figées à l''émission : une facture ne se réécrit pas, et se '
  'conserve dix ans même après suppression du compte.';

create index if not exists factures_id_profil_idx on public.factures (id_profil);
create index if not exists factures_date_idx on public.factures (date_emission desc);

alter table public.factures enable row level security;

-- Lecture : son titulaire, ou le staff. Aucune policy d'écriture — une facture
-- ne naît que du webhook, en service_role, jamais d'un client.
drop policy if exists "factures_select_titulaire" on public.factures;
create policy "factures_select_titulaire" on public.factures for select
  to authenticated
  using (id_profil = auth.uid() or (select is_formateur_ou_admin()));

-- Privilèges de colonne explicites, comme sur `lecons` et `ressources`
-- (20260912103000). `chemin_storage` n'est pas servi au client : le fichier
-- s'obtient par URL signée, pas en devinant un chemin.
revoke all on public.factures from authenticated, anon;
grant select (
  id_facture,
  numero,
  designation,
  montant_centimes,
  devise,
  date_emission
) on public.factures to authenticated;

-- 3. L'espace de stockage --------------------------------------------------------
--
-- Même régime que `certificats` : privé, sans aucune policy de lecture pour les
-- rôles de l'API, écriture réservée au service_role. Une facture porte un nom et
-- une adresse — un bucket public laisserait les parcourir en devinant des
-- chemins. L'accès passe par une URL signée, à durée courte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('factures', 'factures', false, 5 * 1024 * 1024, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
