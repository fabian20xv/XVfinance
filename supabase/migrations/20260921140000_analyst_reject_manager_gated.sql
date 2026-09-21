-- XVfinance — analyst may dismiss/reject manager-gated proposals
-- Apply on the E0 allowlist only (both refs; refuse any third project):
--   1. Develop/staging (Tess Preview): https://bkwhqfkosxnoffpsjcug.supabase.co (ref bkwhqfkosxnoffpsjcug)
--   2. Parent/prod:                    https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Matching migration for BOTH allowlisted refs. Not parent-only.
--
-- Tess Composer P1: analyst Confirm stays blocked; Dismiss/reject must succeed
-- without applying holdings/notes (confirm-on-write / manager-only apply).
-- Confirm/apply still raise 'manager role required to confirm this proposal'.

create or replace function private.proposals_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    -- Notes confirm default: any_member (analyst or manager). Do not force manager-only.
    if new.kind = 'note_upsert'::public.proposal_kind then
      new.requires_role := 'any_member'::public.proposal_confirm_role;
      new.requires_manager := false;
    else
      new.requires_manager := (
        new.requires_role = 'manager'::public.proposal_confirm_role
      );
    end if;
    if new.expires_at is null
       and new.status = 'pending_confirm'::public.proposal_status then
      new.expires_at := now() + interval '24 hours';
    end if;
    return new;
  end if;

  if new.requires_role is distinct from old.requires_role then
    new.requires_manager := (new.requires_role = 'manager'::public.proposal_confirm_role);
  elsif new.requires_manager is distinct from old.requires_manager then
    new.requires_role := case
      when new.requires_manager then 'manager'::public.proposal_confirm_role
      else 'any_member'::public.proposal_confirm_role
    end;
  end if;

  if old.status = 'pending_confirm'::public.proposal_status then
    if old.expires_at is not null
       and old.expires_at < now()
       and new.status in (
         'confirmed'::public.proposal_status,
         'rejected'::public.proposal_status,
         'expired'::public.proposal_status
       ) then
      new.status := 'expired'::public.proposal_status;
      new.error := coalesce(new.error, 'proposal expired');
      return new;
    end if;

    if new.status = 'confirmed'::public.proposal_status then
      if (new.requires_role = 'manager'::public.proposal_confirm_role or new.requires_manager)
         and not private.is_firm_manager(new.firm_id) then
        raise exception 'manager role required to confirm this proposal'
          using errcode = '42501';
      elsif not private.is_firm_member(new.firm_id) then
        raise exception 'firm membership required to confirm this proposal'
          using errcode = '42501';
      end if;
      -- Unmatched CSV symbols abort confirm (not swallowed as failed).
      if new.kind = 'holdings_import'::public.proposal_kind
         and coalesce(jsonb_typeof(new.payload->'unmatched'), 'null') = 'array'
         and jsonb_array_length(new.payload->'unmatched') > 0 then
        raise exception 'unmatched symbols block confirm'
          using errcode = 'P0001';
      end if;
      new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
      new.confirmed_at := coalesce(new.confirmed_at, now());
      begin
        perform private.apply_proposal_payload(new);
        new.status := 'applied'::public.proposal_status;
        new.applied_at := now();
        new.error := null;
      exception when others then
        new.status := 'failed'::public.proposal_status;
        new.error := sqlerrm;
      end;
    elsif new.status = 'rejected'::public.proposal_status then
      -- Dismiss/reject: any firm member (analyst or manager). Confirm/apply stay manager-gated.
      if not private.is_firm_member(new.firm_id) then
        raise exception 'firm membership required to reject this proposal'
          using errcode = '42501';
      end if;
      new.rejected_by := coalesce(new.rejected_by, auth.uid());
      new.rejected_at := coalesce(new.rejected_at, now());
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.proposals_before_write() from public, anon, authenticated;

drop trigger if exists proposals_before_write on public.proposals;
create trigger proposals_before_write
before insert or update on public.proposals
for each row execute function private.proposals_before_write();

-- Analysts could not UPDATE manager-gated pending rows (confirm policy USING).
-- Separate reject policy: any member may set status=rejected. Confirm/apply
-- still require the existing manager USING clause.
drop policy if exists proposals_update_reject on public.proposals;
create policy proposals_update_reject
on public.proposals
for update
to authenticated
using (
  status = 'pending_confirm'::public.proposal_status
  and (select private.is_firm_member(firm_id))
)
with check (
  (select private.is_firm_member(firm_id))
  and status = 'rejected'::public.proposal_status
);
