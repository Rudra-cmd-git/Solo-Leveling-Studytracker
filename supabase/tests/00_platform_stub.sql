-- ============================================================================
-- LOCAL TEST HARNESS - emulates the Supabase platform objects
-- ----------------------------------------------------------------------------
-- Supabase projects already provide: roles anon/authenticated/service_role,
-- schema auth, table auth.users and function auth.uid(). When testing on a
-- bare PostgreSQL instance this file recreates just enough of that platform
-- for the migrations to run unmodified.
--
-- NEVER run this against a real Supabase project.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin;
  end if;
end;
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

-- Supabase reads the verified JWT claims from this setting.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid;
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Storage: just enough of the Supabase Storage schema for 0008 (avatars bucket)
-- to run and be tested locally. No real objects, no file bytes.
-- ----------------------------------------------------------------------------
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets (id),
  name       text not null,
  owner      uuid,
  metadata   jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

-- Supabase's helper: every folder segment of an object name except the file.
create or replace function storage.foldername(p_name text)
returns text[]
language sql
immutable
as $$
  select case
    when array_length(string_to_array(p_name, '/'), 1) is null then array[]::text[]
    else (string_to_array(p_name, '/'))[1 : array_length(string_to_array(p_name, '/'), 1) - 1]
  end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated, service_role;
