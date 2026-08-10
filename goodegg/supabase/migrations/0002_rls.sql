-- =============================================================================
-- Be a Good Egg — 0002_rls.sql
-- Row Level Security. This file is the security spine of the app.
--
-- Design rules (enforced HERE, never merely hidden in the frontend):
--   * The draw is a secret. NOBODY gets a blanket SELECT on `assignments`.
--     The only read path to "who is my buddy" is the SECURITY DEFINER function
--     my_buddy_profile(gid). Writes happen only via the service role / apply_draw.
--   * Participants read their own data + a names/completion view of co-members.
--   * A giver may read the buddy_profile of THEIR receiver only — resolved via a
--     definer function, without ever exposing the assignments table.
--   * Organisers manage membership, settings, exclusions and missions, but get
--     NO window into assignments and no wholesale read of buddy_profiles.
--   * Question senders stay anonymous to recipients — recipients read through a
--     column-safe view that omits sender_id, and answer through a definer RPC.
--
-- NOTE on signatures: my_assignment / my_buddy_profile take a group id (gid)
-- because a user can belong to several groups at once; the resolution must be
-- per-group. This is a deliberate, documented refinement of the "my_assignment()"
-- name in the brief.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table-level privileges.
-- RLS narrows *rows*; these GRANTs decide which roles may touch a table at all.
-- `authenticated` is the logged-in end user. `anon` gets nothing here.
-- `assignments` is deliberately granted to NO client role — only the service
-- role (which bypasses RLS) and SECURITY DEFINER functions ever touch it.
-- -----------------------------------------------------------------------------
grant select, insert, update, delete on
  public.profiles,
  public.groups,
  public.group_members,
  public.buddy_profiles,
  public.exclusions,
  public.anonymous_questions,
  public.missions,
  public.accomplices
to authenticated;

-- assignments: no client grants at all (belt-and-braces on top of RLS).
revoke all on public.assignments from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Enable RLS on EVERY table. With RLS on and no matching policy, access is
-- denied by default — which is exactly what we want for `assignments`.
-- -----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.buddy_profiles      enable row level security;
alter table public.assignments         enable row level security;
alter table public.exclusions          enable row level security;
alter table public.anonymous_questions enable row level security;
alter table public.missions            enable row level security;
alter table public.accomplices         enable row level security;

-- =============================================================================
-- Additional policy helpers (SECURITY DEFINER, so they see past the RLS of the
-- tables they read and cannot cause policy recursion).
-- =============================================================================

-- shares_group(other): does the caller share ANY group with profile `other`?
-- Used so members can read each other's display names / avatars.
create or replace function public.shares_group(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.profile_id = auth.uid()
      and b.profile_id = other
  );
$$;

-- my_assignment(gid): the caller's receiver in group gid (or NULL before the
-- draw / if the caller is not a giver). This is the ONLY sanctioned way for a
-- client to learn its own receiver id. It never exposes anyone else's pairing.
create or replace function public.my_assignment(gid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select a.receiver_id
  from public.assignments a
  where a.group_id = gid
    and a.giver_id = auth.uid();
$$;

-- my_buddy_profile(gid): the buddy_profile of the caller's receiver in group
-- gid. Returns 0 rows before the draw or when the caller has no assignment.
-- This is the single read path to "what does my buddy like?" — it bypasses the
-- buddy_profiles SELECT policy (which is own-row-only) precisely because it is
-- SECURITY DEFINER and scoped to the caller's own receiver.
create or replace function public.my_buddy_profile(gid uuid)
returns setof public.buddy_profiles
language sql
stable
security definer
set search_path = public
as $$
  select bp.*
  from public.buddy_profiles bp
  where bp.group_id = gid
    and bp.profile_id = public.my_assignment(gid);
$$;

revoke all on function public.shares_group(uuid)      from public;
revoke all on function public.my_assignment(uuid)     from public;
revoke all on function public.my_buddy_profile(uuid)  from public;
grant execute on function public.shares_group(uuid)     to authenticated;
grant execute on function public.my_assignment(uuid)    to authenticated;
grant execute on function public.my_buddy_profile(uuid) to authenticated;

-- =============================================================================
-- profiles
-- =============================================================================

-- Read your own profile, or the profile of anyone you share a group with (so the
-- members list can show names/avatars). No one else.
create policy profiles_select_self_or_comember
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_group(id));

-- You may only ever create/edit your OWN profile row. (Creation normally happens
-- automatically via the handle_new_user trigger; this covers manual upserts.)
create policy profiles_insert_self
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- =============================================================================
-- groups
-- =============================================================================

-- Members and the organiser can read the group. Non-members cannot (joining by
-- code is expected to go through a dedicated SECURITY DEFINER RPC, out of scope
-- here — see assumptions in the summary).
create policy groups_select_member_or_organiser
  on public.groups for select to authenticated
  using (organiser_id = auth.uid() or public.is_group_member(id));

-- Anyone signed in may create a group, but only as its own organiser.
create policy groups_insert_own
  on public.groups for insert to authenticated
  with check (organiser_id = auth.uid());

-- Only the organiser may change settings/status or delete the group.
create policy groups_update_organiser
  on public.groups for update to authenticated
  using (organiser_id = auth.uid())
  with check (organiser_id = auth.uid());

create policy groups_delete_organiser
  on public.groups for delete to authenticated
  using (organiser_id = auth.uid());

-- =============================================================================
-- group_members
-- =============================================================================

-- Read the member list of any group you belong to (this is the source of the
-- organiser-safe ParticipantSummary: profile_id, role, profile_complete). No
-- assignment data lives here, so this is safe to share among members.
create policy group_members_select_comember
  on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

-- A user may add themselves to a group (self-join), and an organiser may add
-- members to their group.
create policy group_members_insert_self_or_organiser
  on public.group_members for insert to authenticated
  with check (
    profile_id = auth.uid()
    or public.is_group_organiser(group_id)
  );

-- The organiser may manage any membership row in their group (role,
-- profile_complete). A participant may update only their OWN row (e.g. to flip
-- profile_complete). NOTE: group_members.role is cosmetic — organiser authority
-- is anchored to groups.organiser_id via is_group_organiser(), so a participant
-- editing their own role string grants them no real power.
create policy group_members_update_self_or_organiser
  on public.group_members for update to authenticated
  using (
    profile_id = auth.uid()
    or public.is_group_organiser(group_id)
  )
  with check (
    profile_id = auth.uid()
    or public.is_group_organiser(group_id)
  );

-- Leave a group (delete your own membership), or organiser removes a member.
create policy group_members_delete_self_or_organiser
  on public.group_members for delete to authenticated
  using (
    profile_id = auth.uid()
    or public.is_group_organiser(group_id)
  );

-- =============================================================================
-- buddy_profiles
-- =============================================================================
-- CRITICAL: the base-table SELECT policy is OWN-ROW-ONLY. A giver reads their
-- receiver's preferences exclusively through my_buddy_profile(gid). There is NO
-- policy that lets a participant read arbitrary buddy_profiles after the draw,
-- and NO policy that lets an organiser read them wholesale.

create policy buddy_profiles_select_own
  on public.buddy_profiles for select to authenticated
  using (profile_id = auth.uid());

-- Create/update/delete only your OWN buddy profile, and only in a group you are
-- actually a member of.
create policy buddy_profiles_insert_own
  on public.buddy_profiles for insert to authenticated
  with check (
    profile_id = auth.uid()
    and public.is_group_member(group_id)
  );

create policy buddy_profiles_update_own
  on public.buddy_profiles for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy buddy_profiles_delete_own
  on public.buddy_profiles for delete to authenticated
  using (profile_id = auth.uid());

-- =============================================================================
-- assignments  (THE SECRET)
-- =============================================================================
-- Intentionally NO policies. RLS is enabled, so every client SELECT/INSERT/
-- UPDATE/DELETE returns/affects zero rows. Assignments are written only by
-- apply_draw() (SECURITY DEFINER) and readable only through my_assignment(gid)
-- and my_buddy_profile(gid). The service role bypasses RLS for maintenance.
-- (No `create policy` statements here — that is the whole point.)

-- =============================================================================
-- exclusions
-- =============================================================================
-- Only the organiser sees or manages forbidden pairs. Participants must not see
-- exclusions (they could leak who is/ isn't paired with whom).
create policy exclusions_all_organiser
  on public.exclusions for all to authenticated
  using (public.is_group_organiser(group_id))
  with check (public.is_group_organiser(group_id));

-- =============================================================================
-- anonymous_questions
-- =============================================================================
-- Sender anonymity is the whole game here.
--
-- SELECT on the base table is restricted to the SENDER, so the giver can follow
-- their own question and read the answer. The RECIPIENT is deliberately NOT
-- given base-table SELECT (which would expose sender_id); they read through the
-- column-safe view `question_inbox` and answer through answer_question().
create policy questions_select_sender
  on public.anonymous_questions for select to authenticated
  using (sender_id = auth.uid());

-- A question may only be created BY the caller, TO the caller's assigned
-- receiver, within a group the caller belongs to. my_assignment(group_id)
-- resolves the real buddy without exposing the assignments table, so a giver
-- can only ever message their own buddy.
create policy questions_insert_to_own_buddy
  on public.anonymous_questions for insert to authenticated
  with check (
    sender_id = auth.uid()
    and recipient_id = public.my_assignment(group_id)
    and public.is_group_member(group_id)
  );

-- The sender may retract/edit their own question. Recipients do NOT get a base
-- UPDATE policy (answering goes through answer_question, avoiding any RETURNING
-- clause that could surface sender_id).
create policy questions_update_sender
  on public.anonymous_questions for update to authenticated
  using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

-- question_inbox: the recipient's column-safe window onto their questions.
-- Owned by the migration role (postgres), which bypasses RLS, so it can read
-- the underlying rows; the WHERE clause scopes them to the caller, and the
-- projection OMITS sender_id entirely. This is how a recipient sees questions
-- addressed to them without ever learning who asked.
create view public.question_inbox
with (security_invoker = false) as
  select
    id,
    group_id,
    recipient_id,
    question,
    answer,
    status,
    created_at,
    answered_at
  from public.anonymous_questions
  where recipient_id = auth.uid();

grant select on public.question_inbox to authenticated;

-- answer_question(qid, answer_text, decline): the recipient answers or declines
-- a question addressed to them. SECURITY DEFINER + an explicit recipient check
-- means it can update the row without granting the recipient any table access
-- (and thus never leaking sender_id). Returns nothing sensitive.
create or replace function public.answer_question(
  qid uuid,
  answer_text text default null,
  decline boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  is_recipient boolean;
begin
  select (recipient_id = auth.uid())
    into is_recipient
  from public.anonymous_questions
  where id = qid;

  if is_recipient is distinct from true then
    raise exception 'Not your question to answer' using errcode = '42501';
  end if;

  update public.anonymous_questions
     set answer      = case when decline then null else answer_text end,
         status      = case when decline then 'declined'::public.question_status
                            else 'answered'::public.question_status end,
         answered_at = now()
   where id = qid;
end;
$$;

revoke all on function public.answer_question(uuid, text, boolean) from public;
grant execute on function public.answer_question(uuid, text, boolean) to authenticated;

-- =============================================================================
-- missions
-- =============================================================================
-- Every member of a group can read its missions; only the organiser writes them.
create policy missions_select_member
  on public.missions for select to authenticated
  using (public.is_group_member(group_id));

create policy missions_write_organiser
  on public.missions for all to authenticated
  using (public.is_group_organiser(group_id))
  with check (public.is_group_organiser(group_id));

-- NOTE: `for all` also covers SELECT; the explicit member SELECT policy above is
-- OR-combined with it, so members (who are not organisers) can still read.

-- =============================================================================
-- accomplices
-- =============================================================================
-- An accomplice link is between a giver and the helper they recruited. It never
-- contains the receiver, so it leaks no pairing. Both parties can see it; the
-- giver creates/removes it; the helper can respond (accept/decline).
create policy accomplices_select_party
  on public.accomplices for select to authenticated
  using (giver_id = auth.uid() or helper_id = auth.uid());

create policy accomplices_insert_giver
  on public.accomplices for insert to authenticated
  with check (
    giver_id = auth.uid()
    and public.is_group_member(group_id)
  );

-- Either party may update: the giver manages the invite, the helper responds.
create policy accomplices_update_party
  on public.accomplices for update to authenticated
  using (giver_id = auth.uid() or helper_id = auth.uid())
  with check (giver_id = auth.uid() or helper_id = auth.uid());

create policy accomplices_delete_giver
  on public.accomplices for delete to authenticated
  using (giver_id = auth.uid());
