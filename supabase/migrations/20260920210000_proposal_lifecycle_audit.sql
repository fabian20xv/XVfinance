-- XVfinance — proposal confirm/reject lifecycle audit (fail-closed)
-- Apply on the E0 allowlist only (both refs; refuse any third project):
--   1. Develop/staging (Tess Preview): https://bkwhqfkosxnoffpsjcug.supabase.co (ref bkwhqfkosxnoffpsjcug)
--   2. Parent/prod:                    https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Not parent-only. Tess A→G on develop Preview needs this fail-closed trigger.
--
-- BUG-2: confirm/reject used to UPDATE proposals (apply in BEFORE trigger) and
-- then write audit_events in a second HTTP step. If that insert failed, clients
-- saw HTTP 500 after holdings/notes had already mutated.
--
-- Fail-closed: write lifecycle audit_events in the SAME transaction as the
-- proposal status/apply. If the audit row cannot be inserted, the UPDATE
-- (and apply) rolls back. No silent mutate.

create or replace function private.write_proposal_lifecycle_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_actor uuid;
  v_id uuid;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.status = 'applied'::public.proposal_status then
    v_action := 'proposal.applied';
    v_actor := new.confirmed_by;
  elsif new.status = 'confirmed'::public.proposal_status then
    v_action := 'proposal.confirmed';
    v_actor := new.confirmed_by;
  elsif new.status = 'rejected'::public.proposal_status then
    v_action := 'proposal.rejected';
    v_actor := new.rejected_by;
  elsif new.status = 'failed'::public.proposal_status then
    v_action := 'proposal.failed';
    v_actor := coalesce(new.confirmed_by, auth.uid());
  else
    return new;
  end if;

  insert into public.audit_events (
    firm_id, actor_id, action, entity_table, entity_id, payload
  )
  values (
    new.firm_id,
    v_actor,
    v_action,
    'proposals',
    new.id,
    jsonb_build_object(
      'kind', new.kind,
      'status', new.status,
      'requires_role', new.requires_role,
      'tool', v_action,
      'sensitive', true
    )
  )
  returning id into v_id;

  if v_id is null then
    raise exception 'proposal lifecycle audit write failed; rolling back confirm/reject'
      using errcode = 'P0001';
  end if;

  return new;
exception
  when others then
    raise exception 'proposal lifecycle audit write failed; rolling back confirm/reject: %', sqlerrm
      using errcode = 'P0001';
end;
$$;

revoke all on function private.write_proposal_lifecycle_audit() from public, anon, authenticated;

drop trigger if exists proposals_lifecycle_audit on public.proposals;
create trigger proposals_lifecycle_audit
after update of status on public.proposals
for each row
when (
  old.status is distinct from new.status
  and new.status::text in ('confirmed', 'applied', 'rejected', 'failed')
)
execute function private.write_proposal_lifecycle_audit();
