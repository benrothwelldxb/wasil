-- =============================================================================
-- Be a Good Egg — 0003_apply_draw.sql
-- The transactional "commit the draw" primitive, plus a small helper to seed
-- default missions for a new group.
--
-- apply_draw() is the ONLY sanctioned writer of the assignments table. It is
-- SECURITY DEFINER and granted to service_role only, so it is reachable solely
-- from the trusted run-draw edge function (never from a participant's client).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- apply_draw(gid, pairs, seed, p_organiser)
--
-- Atomically persists a computed draw:
--   * locks the group row, refusing if it does not exist;
--   * optionally re-checks that the actor is the organiser (defence in depth on
--     top of the edge function's own check);
--   * refuses with ALREADY_DRAWN if the group is already 'drawn' or 'revealed'
--     (idempotency — running the draw twice must never silently reshuffle);
--   * replaces assignments for the group and flips status→'drawn', draw_at→now().
--
-- The body runs as a single statement inside one transaction, so it is all-or-
-- nothing: if any pair violates the one-give / one-receive unique constraints,
-- the entire operation rolls back and no partial draw is left behind.
--
-- `pairs` shape: jsonb array of { "giver_id": uuid, "receiver_id": uuid }.
-- `seed` is accepted for signature/traceability parity with the draw engine; it
-- is not persisted (types.ts has no column for it) but is logged for debugging.
-- Custom SQLSTATEs let the edge function map failures to HTTP codes:
--   GE404 → group not found · GE403 → not organiser · GE409 → already drawn.
-- -----------------------------------------------------------------------------
create or replace function public.apply_draw(
  gid uuid,
  pairs jsonb,
  seed bigint default null,
  p_organiser uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status    public.group_status;
  v_organiser uuid;
  v_count     integer;
begin
  -- Lock the group so concurrent draw attempts serialise on this row.
  select status, organiser_id
    into v_status, v_organiser
  from public.groups
  where id = gid
  for update;

  if not found then
    raise exception 'GROUP_NOT_FOUND: %', gid using errcode = 'GE404';
  end if;

  -- Defence in depth: the edge function already verified the organiser, but if
  -- an actor id is supplied we re-confirm it against the source of truth.
  if p_organiser is not null and v_organiser is distinct from p_organiser then
    raise exception 'NOT_ORGANISER' using errcode = 'GE403';
  end if;

  -- Idempotency guard: once drawn (or revealed) we never redraw silently.
  if v_status in ('drawn', 'revealed') then
    raise exception 'ALREADY_DRAWN' using errcode = 'GE409';
  end if;

  raise log 'apply_draw group=% seed=%', gid, seed;

  -- Clear any stale rows (only reachable pre-draw thanks to the guard above),
  -- then insert the full set. The (group_id, giver_id) and (group_id,
  -- receiver_id) unique constraints reject any malformed permutation, rolling
  -- back the whole function.
  delete from public.assignments where group_id = gid;

  insert into public.assignments (group_id, giver_id, receiver_id)
  select gid,
         (elem ->> 'giver_id')::uuid,
         (elem ->> 'receiver_id')::uuid
  from jsonb_array_elements(pairs) as elem;

  get diagnostics v_count = row_count;

  update public.groups
     set status  = 'drawn',
         draw_at = now()
   where id = gid;

  return v_count;
end;
$$;

-- Only the service role may commit a draw. Explicitly deny everyone else.
revoke all on function public.apply_draw(uuid, jsonb, bigint, uuid) from public, anon, authenticated;
grant execute on function public.apply_draw(uuid, jsonb, bigint, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- seed_default_missions(gid): give a fresh group a friendly starter mission if
-- it has none yet. Organiser-only, SECURITY DEFINER so it can check ownership.
-- Idempotent: does nothing if the group already has missions.
-- -----------------------------------------------------------------------------
create or replace function public.seed_default_missions(gid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_group_organiser(gid) then
    raise exception 'NOT_ORGANISER' using errcode = 'GE403';
  end if;

  if exists (select 1 from public.missions where group_id = gid) then
    return; -- already seeded
  end if;

  insert into public.missions (group_id, title, tagline, body, accent)
  values
    (gid, 'Welcome egg-stravaganza',
          'Break the ice, gently.',
          'Leave a tiny anonymous hello for your buddy this week — a sticky note, a favourite biscuit, no pressure.',
          'sage'),
    (gid, 'Something small',
          'It is the thought that counts.',
          'Surprise your buddy with one little thing they mentioned liking. Small and kind beats big and flashy.',
          'yolk');
end;
$$;

revoke all on function public.seed_default_missions(uuid) from public, anon;
grant execute on function public.seed_default_missions(uuid) to authenticated;
