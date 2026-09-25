-- =============================================================================
-- Présences : lecture réservée aux administrateurs, déclarée par une policy
--
-- La migration précédente laissait `presences` sous RLS sans aucune policy,
-- fermée au client faute de privilège. Le socle de sécurité refuse cette forme
-- (`00_socle_securite` : « toute table protégée déclare au moins une policy ») :
-- une table hermétique ne se distingue pas, à la relecture, d'une table dont
-- on a oublié les droits. La CI l'a rappelé au premier push.
--
-- On reprend donc la forme de `journal_admin`, l'autre table que seule
-- l'administration consulte : SELECT accordé aux comptes connectés, filtré par
-- une policy `is_admin()`. Un élève obtient zéro ligne, pas même la sienne
-- (son export la lui rend). L'écriture reste fermée à tous — aucun privilège
-- INSERT, UPDATE ni DELETE : seul `signaler_presence()` écrit.
--
-- L'écran continue de passer par `eleves_connectes()`, qui calcule côté
-- serveur l'ancienneté du signal : cette lecture directe n'est qu'une
-- possibilité offerte à l'administration, pas le chemin de l'application.
-- =============================================================================

grant select on public.presences to authenticated;

create policy presences_select_admin
  on public.presences
  for select
  to authenticated
  using ((select is_admin()));

comment on table public.presences is
  'Dernier signe de présence de chaque élève, écrasé à chaque signal. Écrite par signaler_presence() seule ; lue par eleves_connectes(), ou directement par les administrateurs.';
