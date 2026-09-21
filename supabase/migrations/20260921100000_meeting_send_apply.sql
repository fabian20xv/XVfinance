-- XVfinance — wire meeting_send into proposal confirm/apply (fail-closed)
-- Apply on the E0 allowlist only (both refs; refuse any third project):
--   1. Develop/staging (Tess Preview): https://bkwhqfkosxnoffpsjcug.supabase.co (ref bkwhqfkosxnoffpsjcug)
--   2. Parent/prod:                    https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Not parent-only. Tess A→G on develop Preview needs meeting_send apply on confirm.
--
-- BUG-F5: confirm_proposal returned 200 with status=failed and
--   unsupported proposal kind meeting_send
-- because private.apply_proposal_payload on develop still raised in the else
-- branch. Apply meeting_send in the same transactional/fail-closed confirm path
-- as other kinds (proposals_before_write → apply → applied, else failed).

alter type public.proposal_kind add value if not exists 'meeting_send';

create or replace function private.apply_meeting_send(p public.proposals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p.payload, '{}'::jsonb);
  v_id uuid;
  v_channel text;
  v_receipts jsonb;
begin
  v_id := nullif(v_payload->>'report_id', '')::uuid;
  if v_id is null then
    raise exception 'meeting_send requires report_id';
  end if;
  v_channel := coalesce(nullif(v_payload->>'channel', ''), 'export');
  if v_channel not in ('email', 'export') then
    raise exception 'meeting_send channel must be email or export';
  end if;
  v_receipts := coalesce(v_payload->'receipts', '[]'::jsonb);
  if jsonb_typeof(v_receipts) <> 'array' or jsonb_array_length(v_receipts) < 1 then
    raise exception 'meeting_send requires at least one receipt';
  end if;

  update public.reports r
  set
    status = 'published'::public.report_status,
    published_at = coalesce(r.published_at, now()),
    sent_at = now(),
    send_channel = v_channel
  where r.id = v_id
    and r.firm_id = p.firm_id
    and r.purpose = 'meeting_one_pager'
    and r.status = 'draft'::public.report_status
    and coalesce(jsonb_array_length(r.receipts), 0) > 0;
  if not found then
    raise exception 'draft meeting 1-pager % not found or missing receipts', v_id;
  end if;
  -- Never create an anonymous public URL.
end;
$$;

revoke all on function private.apply_meeting_send(public.proposals) from public, anon, authenticated;

-- Keep the existing dispatcher for every other kind. Rename once so this
-- wrapper can handle meeting_send without copying the full E5–E9 body.
-- Lookup by proname so a composite-type to_regprocedure miss cannot replace
-- the live dispatcher with a wrapper that calls a missing function.
do $$
declare
  v_except oid;
  v_current oid;
begin
  select p.oid into v_except
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'apply_proposal_payload_except_meeting_send';

  if v_except is not null then
    return;
  end if;

  select p.oid into v_current
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'apply_proposal_payload';

  if v_current is null then
    raise exception 'private.apply_proposal_payload is missing; apply E3–E9 first';
  end if;

  alter function private.apply_proposal_payload(public.proposals)
    rename to apply_proposal_payload_except_meeting_send;
end
$$;

create or replace function private.apply_proposal_payload(p public.proposals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- kind::text so a just-added enum value is usable in this transaction.
  if p.kind::text = 'meeting_send' then
    perform private.apply_meeting_send(p);
    return;
  end if;

  perform private.apply_proposal_payload_except_meeting_send(p);
end;
$$;

revoke all on function private.apply_proposal_payload(public.proposals) from public, anon, authenticated;

do $$
declare
  v_except oid;
begin
  select p.oid into v_except
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'apply_proposal_payload_except_meeting_send';

  if v_except is not null then
    execute 'revoke all on function private.apply_proposal_payload_except_meeting_send(public.proposals) from public, anon, authenticated';
  end if;
end
$$;
