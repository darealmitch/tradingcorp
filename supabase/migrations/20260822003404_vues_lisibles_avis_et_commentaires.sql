-- =============================================================================
-- TradingCorp — Vues lisibles : avis et commentaires
--
-- Complète le schéma `lisible` (20260822002051), même intention et mêmes
-- garanties : hors des schémas exposés par l'API REST, donc invisible depuis
-- l'application, et aucune donnée recopiée — que des jointures.
--
-- Ces deux tables se lisent encore plus mal que les autres : un commentaire
-- ne porte que trois identifiants (auteur, chapitre, parent), et l'écran de
-- modération ne montre que ce qui est en attente. Pour retrouver un propos
-- signalé, ou relire un fil complet, il fallait jusqu'ici jointer à la main.
--
-- À SAVOIR : ces vues renvoient zéro ligne aujourd'hui, et les tables sont
-- bien vides — aucun écran de l'application ne permet encore de DÉPOSER un
-- avis ou un commentaire (moderation.service ne fait que lire et changer le
-- statut ; la section « Avis » de la landing affiche des captures d'écran
-- servies par Cloudinary, pas des avis d'apprenants). La lecture et la
-- modération existent, l'écriture reste à construire.
-- =============================================================================

-- Avis sur la formation, note comprise --------------------------------------
create or replace view lisible.avis as
select
  p.prenom || ' ' || p.nom            as auteur,
  u.email,
  f.titre                             as formation,
  a.note,
  a.contenu,
  a.statut,
  a.date_creation,
  case when a.date_modification > a.date_creation then a.date_modification end as modifie_le
from public.avis a
join public.profils p on p.id_profil = a.id_profil
left join auth.users u on u.id = a.id_profil
join public.formations f on f.id_formation = a.id_formation;

-- Commentaires de chapitre, avec le fil de discussion ------------------------
create or replace view lisible.commentaires as
select
  p.prenom || ' ' || p.nom            as auteur,
  u.email,
  s.position                          as module,
  l.titre                             as chapitre,
  c.contenu,
  c.statut,
  -- Une réponse n'a de sens qu'avec ce à quoi elle répond : sans cette
  -- colonne, un fil se lit comme une suite de propos sans lien.
  case when c.id_parent is null then 'message' else 'réponse à ' || pp.prenom end as fil,
  parent.contenu                      as en_reponse_a,
  c.date_creation,
  case when c.date_modification > c.date_creation then c.date_modification end as modifie_le
from public.commentaires c
join public.profils p on p.id_profil = c.id_profil
left join auth.users u on u.id = c.id_profil
join public.lecons l on l.id_lecon = c.id_lecon
join public.sections s on s.id_section = l.id_section
left join public.commentaires parent on parent.id_commentaire = c.id_parent
left join public.profils pp on pp.id_profil = parent.id_profil;

-- File d'attente de modération, avis et commentaires réunis ------------------
-- Les deux tables se modèrent depuis le même écran mais vivent séparément :
-- cette vue répond à « qu'est-ce qui attend une décision, tous supports
-- confondus », sans avoir à interroger l'une puis l'autre.
create or replace view lisible.moderation_en_attente as
select 'avis' as support, auteur, email, formation as ou, contenu, note, date_creation
from lisible.avis where statut = 'en_attente'
union all
select 'commentaire', auteur, email, chapitre, contenu, null, date_creation
from lisible.commentaires where statut = 'en_attente';
