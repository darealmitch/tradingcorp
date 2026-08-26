-- =============================================================================
-- TradingCorp — Un paiement remboursé ferme l'accès qu'il avait ouvert
--
-- Audit du 31/07/2026, P-17. La table `paiements` définit quatre statuts —
-- `en_attente`, `reussi`, `rembourse`, `echoue` — et un seul était jamais
-- écrit. Un remboursement effectué dans Stripe ne laissait aucune trace ici :
-- l'argent repartait, l'accès à vie restait ouvert, et le chiffre d'affaires
-- continuait de compter la vente.
--
-- Le traitement vit dans une fonction plutôt que dans le webhook, pour une
-- raison précise : révoquer met à jour deux tables et notifie l'apprenant.
-- Fait en trois appels REST successifs, un échec au milieu laisse un paiement
-- remboursé avec une inscription encore active — exactement l'incohérence qu'on
-- cherche à supprimer. Ici tout tient dans une transaction, ou rien n'est écrit.
--
-- La fonction est idempotente : Stripe relance ses événements, et un
-- remboursement déjà enregistré doit rester sans effet plutôt que d'empiler des
-- notifications. Elle sert aussi au back-office, d'où le paramètre `p_auteur`.
-- =============================================================================

create or replace function public.revoquer_pour_remboursement(
  p_reference text,
  p_motif     text default 'remboursement'
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_paiement    paiements%rowtype;
  v_id_formation uuid;
  v_titre       text;
begin
  select * into v_paiement
  from paiements
  where reference_transaction = p_reference;

  if not found then
    return false;
  end if;

  -- Déjà remboursé : une relance de Stripe ne doit rien rejouer.
  if v_paiement.statut = 'rembourse' then
    return false;
  end if;

  update paiements
     set statut = 'rembourse'
   where id_paiement = v_paiement.id_paiement;

  update inscriptions
     set statut = 'revoquee'
   where id_paiement = v_paiement.id_paiement
     and statut = 'active'
  returning id_formation into v_id_formation;

  if v_id_formation is not null then
    select titre into v_titre from formations where id_formation = v_id_formation;

    insert into notifications (id_profil, titre, message, type, priorite, cle_evenement)
    values (
      v_paiement.id_profil,
      'Accès clôturé',
      coalesce(
        'Ton accès à « ' || v_titre || ' » a été clôturé suite au remboursement de ton paiement.',
        'Ton accès a été clôturé suite au remboursement de ton paiement.'
      ),
      'info',
      'urgente',
      -- `idx_notifications_evenement_unique` porte sur (id_profil, cle_evenement) :
      -- seconde barrière d'idempotence, indépendante du statut du paiement. Le
      -- `do nothing` est ce qui la rend inoffensive — sans lui, un doublon
      -- lèverait une violation d'unicité et annulerait tout le remboursement.
      'remboursement:' || v_paiement.id_paiement::text
    )
    on conflict (id_profil, cle_evenement) where cle_evenement is not null do nothing;
  end if;

  insert into journal_admin (id_profil, action, cible, meta, auteur)
  values (
    auth.uid(),
    'remboursement',
    (select u.email from auth.users u where u.id = v_paiement.id_profil),
    jsonb_build_object(
      'id_paiement', v_paiement.id_paiement,
      'reference',   p_reference,
      'montant_centimes', v_paiement.montant_centimes,
      'motif',       p_motif,
      'inscription_revoquee', v_id_formation is not null
    ),
    coalesce(nullif(p_motif, ''), 'stripe')
  );

  return true;
end;
$function$;

comment on function public.revoquer_pour_remboursement(text, text) is
  'Passe un paiement à rembourse, révoque l''inscription qu''il finançait, notifie l''apprenant et journalise — le tout en une transaction. Idempotente. Appelée par le webhook Stripe en rôle de service (P-17).';

-- Aucun client ne l'appelle : ni `anon`, ni `authenticated`. Le webhook agit en
-- rôle de service, qui n'est pas soumis à ces révocations.
revoke execute on function public.revoquer_pour_remboursement(text, text) from public, anon, authenticated;
