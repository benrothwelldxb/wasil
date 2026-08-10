-- =============================================================================
-- Be a Good Egg — 0001_schema.sql
-- Core Postgres schema for the Secret Buddy workplace app.
--
-- The shapes here mirror /src/lib/types.ts exactly (field names, enums, arrays).
-- Secrecy of the draw is enforced in 0002_rls.sql; this file only defines the
-- structures, keys, indexes, and a couple of security-definer helpers that the
-- policies depend on.
-- =============================================================================

-- gen_random_uuid() lives in pgcrypto on older Postgres; Supabase ships it, but
-- we make the dependency explicit so `supabase db reset` is reproducible.
create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enum types (mirror the string unions in types.ts)
-- -----------------------------------------------------------------------------
create type public.group_status     as enum ('draft', 'open', 'ready', 'drawn', 'revealed', 'archived');
create type public.member_role      as enum ('organiser', 'participant');
create type public.question_status  as enum ('pending', 'answered', 'declined');
create type public.sweet_or_savoury as enum ('sweet', 'savoury', 'both');
create type public.accomplice_status as enum ('invited', 'active', 'declined');
create type public.mission_accent   as enum ('sage', 'lilac', 'peach', 'yolk', 'coral');

-- -----------------------------------------------------------------------------
-- profiles
-- One row per authenticated user. id references auth.users (Supabase convention)
-- so deleting an auth user cleans up all of their app data via cascades.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'A Good Egg',
  email        text,
  avatar_seed  text,
  created_at   timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- groups
-- A Secret Buddy round. organiser_id is the profile that runs it.
-- -----------------------------------------------------------------------------
create table public.groups (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  description      text,
  organiser_id     uuid not null references public.profiles(id) on delete cascade,
  status           public.group_status not null default 'draft',
  join_code        text not null unique,
  suggested_budget integer,            -- whole GBP, optional, never a requirement
  created_at       timestamptz not null default now(),
  draw_at          timestamptz,        -- set when the draw is applied
  reveal_date      date
);

create index groups_organiser_id_idx on public.groups (organiser_id);

-- -----------------------------------------------------------------------------
-- group_members
-- Membership + role + cached completion flag. The heavy buddy preferences live
-- in buddy_profiles; profile_complete is a cheap flag for organiser dashboards.
-- -----------------------------------------------------------------------------
create table public.group_members (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references public.groups(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  role             public.member_role not null default 'participant',
  joined_at        timestamptz not null default now(),
  profile_complete boolean not null default false,
  unique (group_id, profile_id)
);

create index group_members_group_id_idx   on public.group_members (group_id);
create index group_members_profile_id_idx on public.group_members (profile_id);

-- -----------------------------------------------------------------------------
-- buddy_profiles
-- The preferences a participant shares for a specific group. Lightly normalised:
-- arrays / free text instead of many small tables.
-- -----------------------------------------------------------------------------
create table public.buddy_profiles (
  id                   uuid primary key default gen_random_uuid(),
  group_id             uuid not null references public.groups(id) on delete cascade,
  profile_id           uuid not null references public.profiles(id) on delete cascade,
  preferred_name       text not null default '',
  birthday             date,
  drink                text not null default '',
  sweet_or_savoury     public.sweet_or_savoury,
  favourite_snacks     text[] not null default '{}',
  favourite_shops      text[] not null default '{}',
  interests            text[] not null default '{}',
  favourite_colours    text[] not null default '{}',
  little_things        text not null default '',
  dislikes             text[] not null default '{}',
  dietary_requirements text[] not null default '{}',
  free_text            text not null default '',
  updated_at           timestamptz not null default now(),
  unique (group_id, profile_id)
);

create index buddy_profiles_group_id_idx   on public.buddy_profiles (group_id);
create index buddy_profiles_profile_id_idx on public.buddy_profiles (profile_id);

-- -----------------------------------------------------------------------------
-- assignments  (EXTREMELY SENSITIVE)
-- giver_id → receiver_id. The unique constraints below enforce the core draw
-- invariant at the DB layer: everyone gives exactly once and receives exactly
-- once within a group. Never exposed to clients via SELECT (see 0002_rls.sql);
-- only written by the service role through apply_draw().
-- -----------------------------------------------------------------------------
create table public.assignments (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  giver_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (group_id, giver_id),    -- one give per person per group
  unique (group_id, receiver_id), -- one receive per person per group
  check (giver_id <> receiver_id) -- nobody draws themselves
);

create index assignments_group_id_idx on public.assignments (group_id);

-- -----------------------------------------------------------------------------
-- exclusions
-- Forbidden (giver → receiver) pairs the draw must avoid (e.g. couples).
-- -----------------------------------------------------------------------------
create table public.exclusions (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  giver_id    uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (group_id, giver_id, receiver_id)
);

create index exclusions_group_id_idx on public.exclusions (group_id);

-- -----------------------------------------------------------------------------
-- anonymous_questions
-- A giver asks their assigned buddy a question. The sender is NEVER revealed to
-- the recipient — enforced by RLS + the question_inbox view in 0002_rls.sql.
-- -----------------------------------------------------------------------------
create table public.anonymous_questions (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  sender_id    uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  question     text not null,
  answer       text,
  status       public.question_status not null default 'pending',
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);

create index anonymous_questions_group_id_idx     on public.anonymous_questions (group_id);
create index anonymous_questions_sender_id_idx    on public.anonymous_questions (sender_id);
create index anonymous_questions_recipient_id_idx on public.anonymous_questions (recipient_id);

-- -----------------------------------------------------------------------------
-- missions
-- Optional themed prompts the organiser sets for a group.
-- -----------------------------------------------------------------------------
create table public.missions (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  title      text not null,
  tagline    text not null default '',
  body       text not null default '',
  accent     public.mission_accent not null default 'sage',
  starts_at  timestamptz,
  ends_at    timestamptz,
  created_at timestamptz not null default now()
);

create index missions_group_id_idx on public.missions (group_id);

-- -----------------------------------------------------------------------------
-- accomplices
-- A giver recruits a colleague to help surprise their buddy. Schema now; the
-- full flow lands later.
-- -----------------------------------------------------------------------------
create table public.accomplices (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  giver_id   uuid not null references public.profiles(id) on delete cascade,
  helper_id  uuid not null references public.profiles(id) on delete cascade,
  status     public.accomplice_status not null default 'invited',
  created_at timestamptz not null default now(),
  unique (group_id, giver_id, helper_id)
);

create index accomplices_group_id_idx on public.accomplices (group_id);

-- =============================================================================
-- handle_new_user: auto-create a profiles row whenever an auth user is created.
-- Runs as the definer (postgres) so it can write to public.profiles regardless
-- of the caller. Pulls display_name / avatar_seed from the signup metadata if
-- present, otherwise falls back to sensible defaults.
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, email, avatar_seed)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'A Good Egg'),
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'avatar_seed', ''), new.id::text)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Policy helper functions.
--
-- Both are SECURITY DEFINER + STABLE so they can consult group_members without
-- being caught by that table's own RLS (which would otherwise recurse). They
-- answer two questions the policies lean on constantly:
--   is_group_member(gid)    -- is the caller a member of group gid?
--   is_group_organiser(gid) -- is the caller the organiser of group gid?
-- =============================================================================
create or replace function public.is_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members gm
    where gm.group_id = gid
      and gm.profile_id = auth.uid()
  );
$$;

create or replace function public.is_group_organiser(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Organiser identity is anchored to groups.organiser_id (the source of truth),
  -- not merely a member row with role='organiser'.
  select exists (
    select 1
    from public.groups g
    where g.id = gid
      and g.organiser_id = auth.uid()
  );
$$;

-- Lock the helpers down: callable by end users through PostgREST, but not by
-- anonymous visitors.
revoke all on function public.is_group_member(uuid)    from public;
revoke all on function public.is_group_organiser(uuid) from public;
grant execute on function public.is_group_member(uuid)    to authenticated;
grant execute on function public.is_group_organiser(uuid) to authenticated;
