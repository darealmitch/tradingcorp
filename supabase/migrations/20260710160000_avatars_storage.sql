-- =============================================================================
-- TradingCorp — Stockage des avatars de profil
--
-- Bucket public `avatars` : lecture ouverte (photos affichées dans l'app),
-- mais écriture strictement limitée au propriétaire — chaque fichier vit dans
-- un dossier nommé d'après l'UID (avatars/{uid}/avatar.webp), et les policies
-- comparent ce dossier à auth.uid(). L'image est redimensionnée côté client
-- (WebP ~400px) : pas de transformation serveur, fichiers légers.
--
-- profils.avatar_url pointe vers l'URL publique (grant update déjà accordé sur
-- cette colonne à `authenticated` dans 20260710150000).
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/webp'])
on conflict (id) do nothing;

drop policy if exists "avatars_lecture_publique" on storage.objects;
create policy "avatars_lecture_publique" on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "avatars_insert_proprietaire" on storage.objects;
create policy "avatars_insert_proprietaire" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_proprietaire" on storage.objects;
create policy "avatars_update_proprietaire" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_proprietaire" on storage.objects;
create policy "avatars_delete_proprietaire" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
