-- Be a Good Egg — Railway Postgres schema.
--
-- This is the self-hosted counterpart to the Supabase migrations. There is no
-- Supabase Auth here, so `profiles` is standalone (email-based) and there are
-- NO row-level-security policies: the secrecy model is enforced in the API layer
-- (see server/repo.ts). The one rule that still lives in the database is the
-- draw invariant — one give / one receive — enforced by unique constraints.
--
-- Primary keys are application-generated text ids (e.g. "grp-…") so the schema
-- is portable across real Postgres and the PGlite test harness (no uuid/pgcrypto
-- extension required).

create table if not exists profiles (
  id           text primary key,
  display_name text not null,
  email        text unique,
  avatar_seed  text,
  created_at   timestamptz not null default now()
);

-- Short-lived passwordless sign-in codes (6 digits). One active row per email.
create table if not exists login_codes (
  email        text primary key,
  code_hash    text not null,
  display_name text,
  attempts     integer not null default 0,
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create table if not exists groups (
  id               text primary key,
  name             text not null,
  description      text,
  organiser_id     text not null references profiles(id) on delete cascade,
  status           text not null default 'open'
                     check (status in ('draft','open','ready','drawn','revealed','archived')),
  join_code        text not null unique,
  suggested_budget integer,
  created_at       timestamptz not null default now(),
  draw_at          timestamptz,
  reveal_date      text
);

create table if not exists group_members (
  id               text primary key,
  group_id         text not null references groups(id) on delete cascade,
  profile_id       text not null references profiles(id) on delete cascade,
  role             text not null default 'participant' check (role in ('organiser','participant')),
  profile_complete boolean not null default false,
  revealed_at      timestamptz,
  joined_at        timestamptz not null default now(),
  unique (group_id, profile_id)
);
create index if not exists idx_group_members_group on group_members(group_id);

create table if not exists buddy_profiles (
  id                   text primary key,
  group_id             text not null references groups(id) on delete cascade,
  profile_id           text not null references profiles(id) on delete cascade,
  preferred_name       text not null default '',
  birthday             text,
  drink                text not null default '',
  sweet_or_savoury     text check (sweet_or_savoury in ('sweet','savoury','both')),
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
create index if not exists idx_buddy_profiles_group on buddy_profiles(group_id);

-- The secret. Never returned to a client; only the caller's own row is ever read,
-- and only through the API's getMyBuddy path.
create table if not exists assignments (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  giver_id    text not null references profiles(id) on delete cascade,
  receiver_id text not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  check (giver_id <> receiver_id),
  unique (group_id, giver_id),
  unique (group_id, receiver_id)
);

create table if not exists exclusions (
  id          text primary key,
  group_id    text not null references groups(id) on delete cascade,
  giver_id    text not null references profiles(id) on delete cascade,
  receiver_id text not null references profiles(id) on delete cascade,
  reason      text,
  created_at  timestamptz not null default now(),
  unique (group_id, giver_id, receiver_id)
);

create table if not exists anonymous_questions (
  id           text primary key,
  group_id     text not null references groups(id) on delete cascade,
  sender_id    text not null references profiles(id) on delete cascade,
  recipient_id text not null references profiles(id) on delete cascade,
  question     text not null,
  answer       text,
  status       text not null default 'pending' check (status in ('pending','answered','declined')),
  created_at   timestamptz not null default now(),
  answered_at  timestamptz
);
create index if not exists idx_questions_group on anonymous_questions(group_id);

create table if not exists missions (
  id         text primary key,
  group_id   text not null references groups(id) on delete cascade,
  title      text not null,
  tagline    text not null,
  body       text not null,
  accent     text not null default 'sage' check (accent in ('sage','lilac','peach','yolk','coral')),
  starts_at  text,
  ends_at    text,
  created_at timestamptz not null default now()
);
create index if not exists idx_missions_group on missions(group_id);

create table if not exists accomplices (
  id         text primary key,
  group_id   text not null references groups(id) on delete cascade,
  giver_id   text not null references profiles(id) on delete cascade,
  helper_id  text not null references profiles(id) on delete cascade,
  status     text not null default 'invited' check (status in ('invited','active','declined')),
  created_at timestamptz not null default now()
);

create table if not exists inbox_reads (
  profile_id text not null references profiles(id) on delete cascade,
  group_id   text not null references groups(id) on delete cascade,
  item_id    text not null,
  primary key (profile_id, item_id)
);
