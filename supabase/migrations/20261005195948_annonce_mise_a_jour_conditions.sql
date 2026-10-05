-- Annonce d'une mise à jour des conditions (CGU, CGV, politique de confidentialité).
--
-- L'article 14 des CGU promet aux Utilisateurs d'être prévenus de toute
-- modification substantielle par une notification dans leur espace. Cette
-- fonction pose cette notification, pour tous les comptes ou pour les seuls
-- comptes de test — l'essai, qui montre l'annonce telle qu'un élève la reçoit.
-- L'e-mail qui la double part de la fonction Edge `informer-conditions`, la
-- seule à l'appeler.
--
-- IDEMPOTENTE. La clé d'événement est unique par personne
-- (idx_notifications_evenement_unique) : rappelée avec la même clé, la fonction
-- ne notifie personne une seconde fois. Elle ne rend QUE les personnes
-- notifiées à l'instant, et c'est à cette liste, et à elle seule, que l'e-mail
-- part. Un double clic ou une reprise après une coupure ne double donc ni la
-- notification ni l'e-mail ; un compte créé entre deux envois reçoit, lui, les
-- deux au second.
--
-- Réservée au rôle de service : l'écran d'administration passe par la fonction
-- Edge, qui vérifie d'abord que l'appelant est administrateur.

create or replace function public.annoncer_mise_a_jour_conditions(
  p_cle       text,
  p_titre     text,
  p_message   text,
  p_lien      text,
  p_essai     boolean default false
)
returns table (id_destinataire uuid, prenom_destinataire text, courriel text)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Sans clé, l'index d'unicité ne s'applique pas (il ignore les clés nulles) :
  -- chaque appel notifierait de nouveau tout le monde.
  if coalesce(btrim(p_cle), '') = '' or coalesce(btrim(p_titre), '') = '' then
    raise exception 'Une clé d''événement et un titre sont requis'
      using errcode = '22023';
  end if;

  return query
  with destinataires as (
    select p.id_profil, p.prenom, u.email::text as email
      from profils p
      join auth.users u on u.id = p.id_profil
     where (not p_essai or p.est_test)
       and u.email is not null
  ),
  notifies as (
    insert into notifications (id_profil, titre, message, type, lien, cle_evenement, priorite)
    select d.id_profil, btrim(p_titre), nullif(btrim(p_message), ''), 'info', p_lien, p_cle,
           'information'
      from destinataires d
    on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing
    returning notifications.id_profil
  )
  select d.id_profil, d.prenom, d.email
    from destinataires d
    join notifies n on n.id_profil = d.id_profil;
end;
$$;

revoke execute on function public.annoncer_mise_a_jour_conditions(text, text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.annoncer_mise_a_jour_conditions(text, text, text, text, boolean)
  to service_role;

comment on function public.annoncer_mise_a_jour_conditions(text, text, text, text, boolean) is
  'Notifie une mise à jour des conditions (art. 14 des CGU). Idempotente par clé ; rend les seules personnes notifiées à l''instant, que la fonction Edge informer-conditions prévient ensuite par e-mail.';
