-- =============================================================================
-- Be a Good Egg — seed.sql
-- Demo dataset for local development (`supabase db reset` runs this after all
-- migrations). Fixed UUIDs make the data stable across resets.
--
-- IMPORTANT: profiles.id references auth.users(id). In a REAL project those auth
-- users are created by Supabase Auth (sign-up), and the handle_new_user trigger
-- then creates the matching profiles row automatically. Here — purely for a
-- self-contained local reset — we insert the auth.users rows ourselves first,
-- then upsert the profiles with friendly names. Do NOT run this against a
-- production database.
-- =============================================================================

-- Deterministic demo identities.
--   organiser  0000...0001  Priya Patel
--   member     0000...0002  Ben Carter
--   member     0000...0003  Sarah Okafor
--   member     0000...0004  Tom Nguyen
--   member     0000...0005  Aisha Rahman
--   member     0000...0006  Leo Marchetti
--   member     0000...0007  Mei Tanaka
-- group        0000...00a1  The Good Eggs 2026

-- -----------------------------------------------------------------------------
-- auth.users (local only). Minimal columns needed for a valid Supabase auth row.
-- The on_auth_user_created trigger will fire and pre-create profiles rows; we
-- refine those below with ON CONFLICT DO UPDATE.
-- -----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'priya@goodeggs.test', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Priya Patel","avatar_seed":"priya"}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ben@goodeggs.test',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Ben Carter","avatar_seed":"ben"}',     false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'sarah@goodeggs.test', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Sarah Okafor","avatar_seed":"sarah"}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'tom@goodeggs.test',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Tom Nguyen","avatar_seed":"tom"}',     false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'aisha@goodeggs.test', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Aisha Rahman","avatar_seed":"aisha"}', false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'leo@goodeggs.test',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Leo Marchetti","avatar_seed":"leo"}',  false, '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'mei@goodeggs.test',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Mei Tanaka","avatar_seed":"mei"}',     false, '', '', '', '')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- profiles (upsert — refine whatever the trigger created).
-- -----------------------------------------------------------------------------
insert into public.profiles (id, display_name, email, avatar_seed) values
  ('00000000-0000-0000-0000-000000000001', 'Priya Patel',    'priya@goodeggs.test', 'priya'),
  ('00000000-0000-0000-0000-000000000002', 'Ben Carter',     'ben@goodeggs.test',   'ben'),
  ('00000000-0000-0000-0000-000000000003', 'Sarah Okafor',   'sarah@goodeggs.test', 'sarah'),
  ('00000000-0000-0000-0000-000000000004', 'Tom Nguyen',     'tom@goodeggs.test',   'tom'),
  ('00000000-0000-0000-0000-000000000005', 'Aisha Rahman',   'aisha@goodeggs.test', 'aisha'),
  ('00000000-0000-0000-0000-000000000006', 'Leo Marchetti',  'leo@goodeggs.test',   'leo'),
  ('00000000-0000-0000-0000-000000000007', 'Mei Tanaka',     'mei@goodeggs.test',   'mei')
on conflict (id) do update
  set display_name = excluded.display_name,
      email        = excluded.email,
      avatar_seed  = excluded.avatar_seed;

-- -----------------------------------------------------------------------------
-- The group. Status 'open' (pre-draw) so the run-draw function can be demoed.
-- -----------------------------------------------------------------------------
insert into public.groups (id, name, description, organiser_id, status, join_code, suggested_budget, reveal_date) values
  ('00000000-0000-0000-0000-0000000000a1',
   'The Good Eggs 2026',
   'Our little office Secret Buddy for 2026. Kindness over cost — be a good egg!',
   '00000000-0000-0000-0000-000000000001',
   'open',
   'GOODEGG26',
   10,
   '2026-12-18')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Membership. The organiser participates too. profile_complete flags mirror who
-- has filled in their buddy profile.
-- -----------------------------------------------------------------------------
insert into public.group_members (id, group_id, profile_id, role, profile_complete) values
  ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001', 'organiser',   true),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', 'participant', false),
  ('00000000-0000-0000-0000-0000000000b3', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000003', 'participant', true),
  ('00000000-0000-0000-0000-0000000000b4', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000004', 'participant', false),
  ('00000000-0000-0000-0000-0000000000b5', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000005', 'participant', true),
  ('00000000-0000-0000-0000-0000000000b6', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000006', 'participant', false),
  ('00000000-0000-0000-0000-0000000000b7', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000007', 'participant', false)
on conflict (group_id, profile_id) do nothing;

-- -----------------------------------------------------------------------------
-- Sarah's buddy profile — the worked example from the brief.
-- -----------------------------------------------------------------------------
insert into public.buddy_profiles (
  id, group_id, profile_id, preferred_name, drink, sweet_or_savoury,
  favourite_snacks, favourite_shops, interests, favourite_colours,
  little_things, dislikes, dietary_requirements, free_text
) values (
  '00000000-0000-0000-0000-0000000000c3',
  '00000000-0000-0000-0000-0000000000a1',
  '00000000-0000-0000-0000-000000000003',
  'Sarah',
  'Flat white, oat milk',
  'sweet',
  array['Cadbury chocolate (loves it all)'],
  array['M&S', 'Amazon'],
  array['Houseplants', 'Arsenal'],
  array['green', 'orange'],
  'Nice pens, pretty notebooks, surprise coffees, and silly desk decorations.',
  array['Turkish Delight'],
  array[]::text[],
  'Anything green and growing makes my desk happier. COYG!'
)
on conflict (group_id, profile_id) do nothing;

-- -----------------------------------------------------------------------------
-- An illustrative exclusion (organiser-managed; never shown to participants).
-- -----------------------------------------------------------------------------
insert into public.exclusions (id, group_id, giver_id, receiver_id, reason) values
  ('00000000-0000-0000-0000-0000000000d1',
   '00000000-0000-0000-0000-0000000000a1',
   '00000000-0000-0000-0000-000000000002',  -- Ben
   '00000000-0000-0000-0000-000000000003',  -- must not be given Sarah
   'They sit side by side — keep the surprise coming from further afield.')
on conflict (group_id, giver_id, receiver_id) do nothing;

-- -----------------------------------------------------------------------------
-- One October mission.
-- -----------------------------------------------------------------------------
insert into public.missions (id, group_id, title, tagline, body, accent, starts_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000e1',
   '00000000-0000-0000-0000-0000000000a1',
   'Something spooky!',
   'A little Halloween treat.',
   'It is spooky season — leave your buddy a small, silly Halloween surprise. A pumpkin sticker, a bag of sweets, a googly-eyed desk gremlin. Keep it light and anonymous!',
   'peach',
   '2026-10-01T00:00:00Z',
   '2026-10-31T23:59:59Z')
on conflict (id) do nothing;
