-- ============================================================================
-- 0008_avatar_storage.sql - Hunter avatars stored in Supabase Storage
-- ----------------------------------------------------------------------------
-- Until now a hunter could only paste a remote image URL into Settings. That
-- meant an arbitrary third-party origin could:
--   * log every visitor who viewed a public profile (tracking pixel),
--   * serve different content per viewer,
--   * disappear and leave a broken profile forever.
--
-- This migration makes avatars first-class project data:
--   1. a public-read `avatars` bucket, 2 MB cap, png/jpeg/webp only;
--   2. storage RLS so a hunter may only write inside `avatars/<own user id>/`;
--   3. a profiles trigger that rejects any avatar_url outside that folder, so
--      the rule holds for every write path (RPC, SQL editor, future code);
--   4. set_my_avatar(), the single RPC the app uses to persist the result.
--
-- The bucket block is skipped on a bare PostgreSQL instance (the local test
-- harness has no `storage` schema); the URL rules still apply there.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. URL rules
-- ----------------------------------------------------------------------------
-- A valid avatar URL is exactly:
--   https://<project>.supabase.<tld>/storage/v1/object/public/avatars/<uid>/<file>
-- where <uid> is the owner. NULL means "no avatar" (generated glyph).
create or replace function public.avatar_url_allowed(p_url text, p_owner uuid)
returns boolean
language sql
immutable
set search_path = ''
as $fn$
  select case
    when p_url is null then true
    when p_owner is null then false
    when char_length(p_url) > 512 then false
    when p_url !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?/storage/v1/object/public/avatars/[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$'
      then false
    else substring(p_url from '/storage/v1/object/public/avatars/([^/]+)/[^/]+$') = p_owner::text
  end;
$fn$;

comment on function public.avatar_url_allowed(text, uuid) is
  'True when the URL is a public object in the avatars bucket under the owner''s own folder.';

-- ----------------------------------------------------------------------------
-- 2. Bucket + storage policies
-- ----------------------------------------------------------------------------
do $storage$
begin
  if to_regclass('storage.objects') is null or to_regclass('storage.buckets') is null then
    raise notice 'storage schema not found - skipping avatar bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
     set public             = excluded.public,
         file_size_limit    = excluded.file_size_limit,
         allowed_mime_types = excluded.allowed_mime_types;

  -- Anyone may read an avatar; it is shown on public profiles and leaderboards.
  execute 'drop policy if exists avatars_read on storage.objects';
  execute $p$create policy avatars_read on storage.objects
              for select to anon, authenticated
              using (bucket_id = 'avatars')$p$;

  -- Writes are restricted to the hunter's own folder: avatars/<auth.uid()>/...
  execute 'drop policy if exists avatars_insert on storage.objects';
  execute $p$create policy avatars_insert on storage.objects
              for insert to authenticated
              with check (
                bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text
              )$p$;

  execute 'drop policy if exists avatars_update on storage.objects';
  execute $p$create policy avatars_update on storage.objects
              for update to authenticated
              using (
                bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text
              )
              with check (
                bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text
              )$p$;

  execute 'drop policy if exists avatars_delete on storage.objects';
  execute $p$create policy avatars_delete on storage.objects
              for delete to authenticated
              using (
                bucket_id = 'avatars'
                and (storage.foldername(name))[1] = auth.uid()::text
              )$p$;
end;
$storage$;

-- ----------------------------------------------------------------------------
-- 3. Enforce the URL rule on every write to profiles
-- ----------------------------------------------------------------------------
create or replace function public.enforce_avatar_url()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.avatar_url is not null and btrim(new.avatar_url) = '' then
    new.avatar_url := null;
  end if;

  if not public.avatar_url_allowed(new.avatar_url, new.id) then
    raise exception 'AVATAR_URL_NOT_ALLOWED' using
      errcode = '22023',
      hint    = 'Avatars must be uploaded to the avatars bucket by their owner.';
  end if;

  return new;
end;
$fn$;

-- Clear any pre-existing external URLs before the rule becomes mandatory.
update public.profiles
   set avatar_url = null
 where avatar_url is not null
   and not public.avatar_url_allowed(avatar_url, id);

drop trigger if exists profiles_avatar_url_guard on public.profiles;
create trigger profiles_avatar_url_guard
  before insert or update of avatar_url on public.profiles
  for each row execute function public.enforce_avatar_url();

-- ----------------------------------------------------------------------------
-- 4. The one RPC the app calls after an upload finishes
-- ----------------------------------------------------------------------------
-- Passing NULL clears the avatar and returns the hunter to the generated glyph.
create or replace function public.set_my_avatar(p_avatar_url text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_user uuid := auth.uid();
  v_url  text := nullif(btrim(coalesce(p_avatar_url, '')), '');
begin
  if v_user is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  if not public.check_rate_limit('set_avatar', 20, 3600) then
    raise exception 'RATE_LIMITED' using errcode = '53400';
  end if;

  if not public.avatar_url_allowed(v_url, v_user) then
    raise exception 'INVALID_AVATAR_URL' using errcode = '22023';
  end if;

  update public.profiles
     set avatar_url = v_url
   where id = v_user;

  return jsonb_build_object('avatar_url', v_url);
end;
$fn$;

revoke all on function public.avatar_url_allowed(text, uuid) from public;
revoke all on function public.set_my_avatar(text) from public;

grant execute on function public.avatar_url_allowed(text, uuid) to anon, authenticated;
grant execute on function public.set_my_avatar(text) to authenticated;
