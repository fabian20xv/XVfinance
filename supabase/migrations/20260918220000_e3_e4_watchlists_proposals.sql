-- XVfinance E3+E4 — watchlists, workspace focus, proposal pipeline
-- Target ONLY https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Never apply this migration to any other Supabase project.

-- ---------------------------------------------------------------------------
-- Enum extensions (PG 17: ADD VALUE is usable in the same transaction)
-- ---------------------------------------------------------------------------

alter type public.proposal_status add value if not exists 'expired';
alter type public.proposal_kind add value if not exists 'watchlist_upsert';

do $$
begin
  if not exists (select 1 from pg_type where typname = 'proposal_confirm_role') then
    create type public.proposal_confirm_role as enum ('any_member', 'manager');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- CA-4.1 proposal extras: preview, expires_at, idempotency_key, requires_role
-- ---------------------------------------------------------------------------

alter table public.proposals
  add column if not exists preview jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz,
  add column if not exists idempotency_key text,
  add column if not exists requires_role public.proposal_confirm_role not null default 'manager';

update public.proposals
set requires_role = case
  when requires_manager then 'manager'::public.proposal_confirm_role
  else 'any_member'::public.proposal_confirm_role
end
where requires_role is distinct from case
  when requires_manager then 'manager'::public.proposal_confirm_role
  else 'any_member'::public.proposal_confirm_role
end;

create unique index if not exists proposals_firm_idempotency_key_idx
  on public.proposals (firm_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists proposals_expires_at_idx
  on public.proposals (firm_id, status, expires_at);

comment on column public.proposals.preview is 'Human-readable preview for chat confirm card + workspace diff panel.';
comment on column public.proposals.expires_at is 'Pending proposals become expired after this timestamp (CA-4.1).';
comment on column public.proposals.idempotency_key is 'Firm-scoped idempotency key for propose_* tools (CA-4.1).';
comment on column public.proposals.requires_role is 'Confirm gate: any_member (analyst or manager) or manager. Notes default any_member.';

-- ---------------------------------------------------------------------------
-- CA-3.1 workspace focus (user-writable; not high-PII domain data)
-- CA-3.4 watchlists (firm-scoped; mutations via proposal apply)
-- ---------------------------------------------------------------------------

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id)
);

create index if not exists watchlists_firm_id_idx on public.watchlists (firm_id);
create index if not exists watchlists_created_by_idx on public.watchlists (created_by);

create table if not exists public.watchlist_items (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  watchlist_id uuid not null,
  instrument_id uuid,
  symbol text not null check (char_length(symbol) between 1 and 32),
  label text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  unique (watchlist_id, symbol),
  foreign key (watchlist_id, firm_id) references public.watchlists (id, firm_id) on delete cascade,
  foreign key (instrument_id, firm_id) references public.instruments (id, firm_id)
);

create index if not exists watchlist_items_firm_id_idx on public.watchlist_items (firm_id);
create index if not exists watchlist_items_watchlist_id_idx on public.watchlist_items (watchlist_id);
create index if not exists watchlist_items_watchlist_id_firm_id_idx
  on public.watchlist_items (watchlist_id, firm_id);
create index if not exists watchlist_items_instrument_id_firm_id_idx
  on public.watchlist_items (instrument_id, firm_id);

create table if not exists public.workspace_focus (
  user_id uuid not null references auth.users (id) on delete cascade,
  firm_id uuid not null references public.firms (id) on delete cascade,
  client_id uuid,
  portfolio_id uuid,
  watchlist_id uuid,
  updated_at timestamptz not null default now(),
  primary key (user_id, firm_id),
  foreign key (client_id, firm_id) references public.clients (id, firm_id) on delete set null,
  foreign key (portfolio_id, firm_id) references public.portfolios (id, firm_id) on delete set null,
  foreign key (watchlist_id, firm_id) references public.watchlists (id, firm_id) on delete set null
);

create index if not exists workspace_focus_firm_id_idx on public.workspace_focus (firm_id);
create index if not exists workspace_focus_client_id_firm_id_idx
  on public.workspace_focus (client_id, firm_id);
create index if not exists workspace_focus_portfolio_id_firm_id_idx
  on public.workspace_focus (portfolio_id, firm_id);
create index if not exists workspace_focus_watchlist_id_firm_id_idx
  on public.workspace_focus (watchlist_id, firm_id);

create trigger watchlists_set_updated_at
before update on public.watchlists
for each row execute function private.set_updated_at();

create trigger watchlist_items_set_updated_at
before update on public.watchlist_items
for each row execute function private.set_updated_at();

create trigger workspace_focus_set_updated_at
before update on public.workspace_focus
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: watchlists read-only for authenticated; workspace_focus self write
-- ---------------------------------------------------------------------------

alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.workspace_focus enable row level security;

revoke all on table public.watchlists from anon, authenticated;
revoke all on table public.watchlist_items from anon, authenticated;
revoke all on table public.workspace_focus from anon, authenticated;

grant select on table public.watchlists to authenticated;
grant select on table public.watchlist_items to authenticated;
grant select, insert, update on table public.workspace_focus to authenticated;

create policy watchlists_select_firm
on public.watchlists
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy watchlist_items_select_firm
on public.watchlist_items
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy workspace_focus_select_own
on public.workspace_focus
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_firm_member(firm_id))
);

create policy workspace_focus_insert_own
on public.workspace_focus
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select private.is_firm_member(firm_id))
);

create policy workspace_focus_update_own
on public.workspace_focus
for update
to authenticated
using (
  user_id = (select auth.uid())
  and (select private.is_firm_member(firm_id))
)
with check (
  user_id = (select auth.uid())
  and (select private.is_firm_member(firm_id))
);

-- ---------------------------------------------------------------------------
-- CA-4.2 transactional apply as the confirming user (trigger + private definer)
-- Domain tables stay blocked for authenticated; trigger owner writes them.
-- auth.uid() remains the confirming user (JWT claims).
-- ---------------------------------------------------------------------------

create or replace function private.apply_proposal_payload(p public.proposals)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payload jsonb := coalesce(p.payload, '{}'::jsonb);
  v_id uuid;
  v_client_id uuid;
  v_portfolio_id uuid;
  v_watchlist_id uuid;
  v_instrument_id uuid;
  v_change jsonb;
  v_item jsonb;
  v_symbol text;
  v_op text;
  v_replace boolean;
begin
  if p.kind = 'client_upsert'::public.proposal_kind then
    v_id := nullif(v_payload->>'id', '')::uuid;
    if v_id is null then
      insert into public.clients (firm_id, display_name, legal_name, status, external_ref)
      values (
        p.firm_id,
        v_payload->>'display_name',
        v_payload->>'legal_name',
        coalesce(nullif(v_payload->>'status', ''), 'active')::public.client_status,
        v_payload->>'external_ref'
      );
    else
      update public.clients
      set
        display_name = coalesce(nullif(v_payload->>'display_name', ''), display_name),
        legal_name = case when v_payload ? 'legal_name' then v_payload->>'legal_name' else legal_name end,
        status = case
          when v_payload ? 'status' then (v_payload->>'status')::public.client_status
          else status
        end,
        external_ref = case
          when v_payload ? 'external_ref' then v_payload->>'external_ref'
          else external_ref
        end
      where id = v_id and firm_id = p.firm_id;
      if not found then
        raise exception 'client % not found in firm', v_id;
      end if;
    end if;

  elsif p.kind = 'contact_upsert'::public.proposal_kind then
    v_id := nullif(v_payload->>'id', '')::uuid;
    v_client_id := (v_payload->>'client_id')::uuid;
    if v_client_id is null then
      raise exception 'contact_upsert requires client_id';
    end if;
    if not exists (
      select 1 from public.clients c where c.id = v_client_id and c.firm_id = p.firm_id
    ) then
      raise exception 'client % not found in firm', v_client_id;
    end if;
    if v_id is null then
      insert into public.contacts (
        firm_id, client_id, full_name, email, phone, title, is_primary
      )
      values (
        p.firm_id,
        v_client_id,
        v_payload->>'full_name',
        v_payload->>'email',
        v_payload->>'phone',
        v_payload->>'title',
        coalesce((v_payload->>'is_primary')::boolean, false)
      );
    else
      update public.contacts
      set
        client_id = v_client_id,
        full_name = coalesce(nullif(v_payload->>'full_name', ''), full_name),
        email = case when v_payload ? 'email' then v_payload->>'email' else email end,
        phone = case when v_payload ? 'phone' then v_payload->>'phone' else phone end,
        title = case when v_payload ? 'title' then v_payload->>'title' else title end,
        is_primary = case
          when v_payload ? 'is_primary' then (v_payload->>'is_primary')::boolean
          else is_primary
        end
      where id = v_id and firm_id = p.firm_id;
      if not found then
        raise exception 'contact % not found in firm', v_id;
      end if;
    end if;

  elsif p.kind = 'holding_changes'::public.proposal_kind then
    v_portfolio_id := (v_payload->>'portfolio_id')::uuid;
    if v_portfolio_id is null then
      raise exception 'holding_changes requires portfolio_id';
    end if;
    if not exists (
      select 1 from public.portfolios pf
      where pf.id = v_portfolio_id and pf.firm_id = p.firm_id
    ) then
      raise exception 'portfolio % not found in firm', v_portfolio_id;
    end if;

    for v_change in
      select value from jsonb_array_elements(coalesce(v_payload->'changes', '[]'::jsonb))
    loop
      v_op := v_change->>'op';
      if v_op = 'upsert' then
        v_instrument_id := nullif(v_change->>'instrument_id', '')::uuid;
        if v_instrument_id is null then
          v_symbol := upper(v_change->>'symbol');
          if v_symbol is null or v_symbol = '' then
            raise exception 'holding upsert requires instrument_id or symbol';
          end if;
          select i.id into v_instrument_id
          from public.instruments i
          where i.firm_id = p.firm_id and i.symbol = v_symbol;
          if v_instrument_id is null then
            insert into public.instruments (firm_id, symbol, name, currency)
            values (
              p.firm_id,
              v_symbol,
              coalesce(nullif(v_change->>'name', ''), v_symbol),
              coalesce(nullif(v_change->>'currency', ''), 'USD')
            )
            returning id into v_instrument_id;
          end if;
        elsif not exists (
          select 1 from public.instruments i
          where i.id = v_instrument_id and i.firm_id = p.firm_id
        ) then
          raise exception 'instrument % not found in firm', v_instrument_id;
        end if;

        insert into public.holdings (
          firm_id, portfolio_id, instrument_id, quantity, cost_basis, as_of
        )
        values (
          p.firm_id,
          v_portfolio_id,
          v_instrument_id,
          (v_change->>'quantity')::numeric,
          nullif(v_change->>'cost_basis', '')::numeric,
          nullif(v_change->>'as_of', '')::date
        )
        on conflict (portfolio_id, instrument_id) do update
          set quantity = excluded.quantity,
              cost_basis = coalesce(excluded.cost_basis, public.holdings.cost_basis),
              as_of = coalesce(excluded.as_of, public.holdings.as_of);

      elsif v_op = 'delete' then
        if nullif(v_change->>'holding_id', '') is not null then
          delete from public.holdings h
          where h.id = (v_change->>'holding_id')::uuid
            and h.firm_id = p.firm_id
            and h.portfolio_id = v_portfolio_id;
        else
          v_instrument_id := nullif(v_change->>'instrument_id', '')::uuid;
          if v_instrument_id is null then
            raise exception 'holding delete requires holding_id or instrument_id';
          end if;
          delete from public.holdings h
          where h.portfolio_id = v_portfolio_id
            and h.firm_id = p.firm_id
            and h.instrument_id = v_instrument_id;
        end if;
      else
        raise exception 'unknown holding op %', coalesce(v_op, '<null>');
      end if;
    end loop;

  elsif p.kind = 'watchlist_upsert'::public.proposal_kind then
    v_watchlist_id := nullif(v_payload->>'id', '')::uuid;
    if v_watchlist_id is null then
      insert into public.watchlists (firm_id, name, created_by)
      values (
        p.firm_id,
        v_payload->>'name',
        p.created_by
      )
      returning id into v_watchlist_id;
    else
      update public.watchlists w
      set name = coalesce(nullif(v_payload->>'name', ''), name)
      where w.id = v_watchlist_id and w.firm_id = p.firm_id;
      if not found then
        raise exception 'watchlist % not found in firm', v_watchlist_id;
      end if;
    end if;

    if v_payload ? 'items' then
      v_replace := coalesce((v_payload->>'replace_items')::boolean, true);
      if v_replace then
        delete from public.watchlist_items wi
        where wi.watchlist_id = v_watchlist_id
          and wi.firm_id = p.firm_id
          and not exists (
            select 1
            from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb)) item
            where upper(item->>'symbol') = wi.symbol
          );
      end if;

      for v_item in
        select value from jsonb_array_elements(coalesce(v_payload->'items', '[]'::jsonb))
      loop
        v_symbol := upper(v_item->>'symbol');
        if v_symbol is null or v_symbol = '' then
          raise exception 'watchlist item requires symbol';
        end if;
        v_instrument_id := nullif(v_item->>'instrument_id', '')::uuid;
        if v_instrument_id is not null and not exists (
          select 1 from public.instruments i
          where i.id = v_instrument_id and i.firm_id = p.firm_id
        ) then
          raise exception 'instrument % not found in firm', v_instrument_id;
        end if;
        if v_instrument_id is null then
          select i.id into v_instrument_id
          from public.instruments i
          where i.firm_id = p.firm_id and i.symbol = v_symbol;
        end if;

        insert into public.watchlist_items (
          firm_id, watchlist_id, instrument_id, symbol, label, note
        )
        values (
          p.firm_id,
          v_watchlist_id,
          v_instrument_id,
          v_symbol,
          v_item->>'label',
          v_item->>'note'
        )
        on conflict (watchlist_id, symbol) do update
          set instrument_id = coalesce(excluded.instrument_id, public.watchlist_items.instrument_id),
              label = coalesce(excluded.label, public.watchlist_items.label),
              note = coalesce(excluded.note, public.watchlist_items.note);
      end loop;
    end if;

  elsif p.kind = 'note_upsert'::public.proposal_kind then
    v_id := nullif(v_payload->>'id', '')::uuid;
    v_client_id := (v_payload->>'client_id')::uuid;
    if v_client_id is null then
      raise exception 'note_upsert requires client_id';
    end if;
    if not exists (
      select 1 from public.clients c where c.id = v_client_id and c.firm_id = p.firm_id
    ) then
      raise exception 'client % not found in firm', v_client_id;
    end if;
    if v_id is null then
      insert into public.notes (firm_id, client_id, body, created_by)
      values (p.firm_id, v_client_id, v_payload->>'body', p.created_by);
    else
      update public.notes n
      set
        body = coalesce(nullif(v_payload->>'body', ''), body),
        client_id = v_client_id
      where n.id = v_id and n.firm_id = p.firm_id;
      if not found then
        raise exception 'note % not found in firm', v_id;
      end if;
    end if;

  elsif p.kind = 'portfolio_upsert'::public.proposal_kind then
    v_id := nullif(v_payload->>'id', '')::uuid;
    v_client_id := (v_payload->>'client_id')::uuid;
    if v_id is null then
      if v_client_id is null then
        raise exception 'portfolio_upsert create requires client_id';
      end if;
      insert into public.portfolios (
        firm_id, client_id, name, base_currency,
        cash_balance, cash_currency, liquidity_available, liquidity_buffer, liquidity_updated_at
      )
      values (
        p.firm_id,
        v_client_id,
        v_payload->>'name',
        coalesce(nullif(v_payload->>'base_currency', ''), 'USD'),
        coalesce(nullif(v_payload->>'cash_balance', '')::numeric, 0),
        coalesce(nullif(v_payload->>'cash_currency', ''), 'USD'),
        coalesce(nullif(v_payload->>'liquidity_available', '')::numeric, 0),
        coalesce(nullif(v_payload->>'liquidity_buffer', '')::numeric, 0),
        now()
      );
    else
      update public.portfolios pf
      set
        name = coalesce(nullif(v_payload->>'name', ''), name),
        cash_balance = coalesce(nullif(v_payload->>'cash_balance', '')::numeric, cash_balance),
        cash_currency = coalesce(nullif(v_payload->>'cash_currency', ''), cash_currency),
        liquidity_available = coalesce(
          nullif(v_payload->>'liquidity_available', '')::numeric,
          liquidity_available
        ),
        liquidity_buffer = coalesce(
          nullif(v_payload->>'liquidity_buffer', '')::numeric,
          liquidity_buffer
        ),
        liquidity_updated_at = now()
      where pf.id = v_id and pf.firm_id = p.firm_id;
      if not found then
        raise exception 'portfolio % not found in firm', v_id;
      end if;
    end if;

  elsif p.kind = 'report_publish'::public.proposal_kind then
    raise exception 'report_publish apply is out of scope until E5';

  else
    raise exception 'unsupported proposal kind %', p.kind;
  end if;
end;
$$;

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
      if (new.requires_role = 'manager'::public.proposal_confirm_role or new.requires_manager)
         and not private.is_firm_manager(new.firm_id) then
        raise exception 'manager role required to reject this proposal'
          using errcode = '42501';
      elsif not private.is_firm_member(new.firm_id) then
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

drop trigger if exists proposals_before_write on public.proposals;
create trigger proposals_before_write
before insert or update on public.proposals
for each row execute function private.proposals_before_write();

revoke all on function private.apply_proposal_payload(public.proposals) from public, anon, authenticated;
revoke all on function private.proposals_before_write() from public, anon, authenticated;

-- Confirm/reject WITH CHECK must allow trigger-mutated applied/failed/expired.
drop policy if exists proposals_update_confirm on public.proposals;
create policy proposals_update_confirm
on public.proposals
for update
to authenticated
using (
  status = 'pending_confirm'::public.proposal_status
  and (
    case
      when requires_role = 'manager'::public.proposal_confirm_role or requires_manager
        then (select private.is_firm_manager(firm_id))
      else (select private.is_firm_member(firm_id))
    end
  )
)
with check (
  (select private.is_firm_member(firm_id))
  and status in (
    'confirmed'::public.proposal_status,
    'rejected'::public.proposal_status,
    'applied'::public.proposal_status,
    'failed'::public.proposal_status,
    'expired'::public.proposal_status
  )
);

-- Any firm member may persist expiry on a lapsed pending proposal.
drop policy if exists proposals_update_expire on public.proposals;
create policy proposals_update_expire
on public.proposals
for update
to authenticated
using (
  status = 'pending_confirm'::public.proposal_status
  and (select private.is_firm_member(firm_id))
  and expires_at is not null
  and expires_at < now()
)
with check (
  (select private.is_firm_member(firm_id))
  and status = 'expired'::public.proposal_status
);

-- ---------------------------------------------------------------------------
-- Seed extras on the locked-project smoke fixture
-- ---------------------------------------------------------------------------

create or replace function public.run_dev_seed()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  smoke_firm constant uuid := 'a0000000-0000-4000-8000-000000000001';
  smoke_manager constant uuid := 'a0000000-0000-4000-8000-0000000000aa';
  smoke_analyst constant uuid := 'a0000000-0000-4000-8000-0000000000bb';
  smoke_client constant uuid := 'a0000000-0000-4000-8000-000000000010';
  smoke_contact constant uuid := 'a0000000-0000-4000-8000-000000000011';
  smoke_portfolio constant uuid := 'a0000000-0000-4000-8000-000000000020';
  smoke_instrument constant uuid := 'a0000000-0000-4000-8000-000000000030';
  smoke_holding constant uuid := 'a0000000-0000-4000-8000-000000000040';
  smoke_note constant uuid := 'a0000000-0000-4000-8000-000000000050';
  smoke_report constant uuid := 'a0000000-0000-4000-8000-000000000060';
  smoke_proposal constant uuid := 'a0000000-0000-4000-8000-000000000070';
  smoke_note_proposal constant uuid := 'a0000000-0000-4000-8000-000000000071';
  smoke_audit constant uuid := 'a0000000-0000-4000-8000-000000000080';
  smoke_watchlist constant uuid := 'a0000000-0000-4000-8000-000000000090';
  smoke_watchlist_item constant uuid := 'a0000000-0000-4000-8000-000000000091';
  jwt_role text;
begin
  jwt_role := coalesce(auth.role(), '');
  if jwt_role in ('authenticated', 'anon') then
    raise exception 'run_dev_seed is server-only (service_role)';
  end if;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000', smoke_manager, 'authenticated', 'authenticated',
      'smoke-manager@xvfinance.invalid',
      extensions.crypt('smoke-not-a-login', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', smoke_analyst, 'authenticated', 'authenticated',
      'smoke-analyst@xvfinance.invalid',
      extensions.crypt('smoke-not-a-login', extensions.gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    )
  on conflict (id) do nothing;

  insert into public.firms (id, name)
  values (smoke_firm, 'XVfinance Smoke Firm')
  on conflict (id) do update set name = excluded.name;

  insert into public.firm_members (firm_id, user_id, role)
  values
    (smoke_firm, smoke_manager, 'manager'::public.firm_role),
    (smoke_firm, smoke_analyst, 'analyst'::public.firm_role)
  on conflict (firm_id, user_id) do update set role = excluded.role;

  insert into public.clients (id, firm_id, display_name, legal_name, status, external_ref)
  values (smoke_client, smoke_firm, 'Smoke Client', 'Smoke Client LLC', 'active', 'smoke-client')
  on conflict (id) do update set display_name = excluded.display_name;

  insert into public.contacts (id, firm_id, client_id, full_name, email, is_primary)
  values (smoke_contact, smoke_firm, smoke_client, 'Pat Smoke', 'pat.smoke@xvfinance.invalid', true)
  on conflict (id) do update set full_name = excluded.full_name;

  insert into public.portfolios (
    id, firm_id, client_id, name, base_currency,
    cash_balance, cash_currency, liquidity_available, liquidity_buffer, liquidity_updated_at
  )
  values (
    smoke_portfolio, smoke_firm, smoke_client, 'Smoke Balanced', 'USD',
    250000.0000, 'USD', 200000.0000, 50000.0000, now()
  )
  on conflict (id) do update
    set cash_balance = excluded.cash_balance,
        liquidity_available = excluded.liquidity_available,
        liquidity_buffer = excluded.liquidity_buffer,
        liquidity_updated_at = excluded.liquidity_updated_at;

  insert into public.instruments (id, firm_id, symbol, name, asset_class, currency)
  values (smoke_instrument, smoke_firm, 'SPY', 'SPDR S&P 500 ETF', 'equity', 'USD')
  on conflict (id) do update set name = excluded.name;

  insert into public.holdings (id, firm_id, portfolio_id, instrument_id, quantity, cost_basis, as_of)
  values (smoke_holding, smoke_firm, smoke_portfolio, smoke_instrument, 100, 45000.0000, current_date)
  on conflict (id) do update set quantity = excluded.quantity;

  insert into public.notes (id, firm_id, client_id, body, created_by)
  values (smoke_note, smoke_firm, smoke_client, 'Smoke note: IPS review scheduled.', smoke_analyst)
  on conflict (id) do update set body = excluded.body;

  insert into public.reports (id, firm_id, client_id, title, body, status, created_by)
  values (smoke_report, smoke_firm, smoke_client, 'Smoke quarterly draft', 'Draft body', 'draft', smoke_analyst)
  on conflict (id) do update set title = excluded.title;

  insert into public.watchlists (id, firm_id, name, created_by)
  values (smoke_watchlist, smoke_firm, 'Smoke Watch', smoke_analyst)
  on conflict (id) do update set name = excluded.name;

  insert into public.watchlist_items (id, firm_id, watchlist_id, instrument_id, symbol, label)
  values (smoke_watchlist_item, smoke_firm, smoke_watchlist, smoke_instrument, 'SPY', 'S&P 500 ETF')
  on conflict (id) do update set symbol = excluded.symbol;

  insert into public.workspace_focus (user_id, firm_id, client_id, portfolio_id, watchlist_id)
  values (smoke_manager, smoke_firm, smoke_client, smoke_portfolio, smoke_watchlist)
  on conflict (user_id, firm_id) do update
    set client_id = excluded.client_id,
        portfolio_id = excluded.portfolio_id,
        watchlist_id = excluded.watchlist_id;

  insert into public.proposals (
    id, firm_id, kind, status, payload, preview, requires_manager, requires_role,
    created_by, expires_at, idempotency_key
  )
  values (
    smoke_proposal,
    smoke_firm,
    'holding_changes'::public.proposal_kind,
    'pending_confirm'::public.proposal_status,
    jsonb_build_object(
      'portfolio_id', smoke_portfolio,
      'changes', jsonb_build_array(
        jsonb_build_object(
          'op', 'upsert',
          'instrument_id', smoke_instrument,
          'quantity', 110
        )
      )
    ),
    jsonb_build_object(
      'title', 'Holding changes',
      'summary', 'Update SPY quantity to 110',
      'diff', jsonb_build_array(jsonb_build_object('op', 'upsert', 'symbol', 'SPY', 'quantity', 110))
    ),
    true,
    'manager'::public.proposal_confirm_role,
    smoke_analyst,
    now() + interval '7 days',
    'smoke-holding-changes'
  )
  on conflict (id) do update
    set payload = excluded.payload,
        preview = excluded.preview,
        status = excluded.status,
        expires_at = excluded.expires_at,
        idempotency_key = excluded.idempotency_key,
        requires_role = excluded.requires_role,
        requires_manager = excluded.requires_manager;

  insert into public.proposals (
    id, firm_id, kind, status, payload, preview, requires_manager, requires_role,
    created_by, expires_at, idempotency_key
  )
  values (
    smoke_note_proposal,
    smoke_firm,
    'note_upsert'::public.proposal_kind,
    'pending_confirm'::public.proposal_status,
    jsonb_build_object(
      'client_id', smoke_client,
      'body', 'Follow-up after IPS review.'
    ),
    jsonb_build_object(
      'title', 'Add note',
      'summary', 'Follow-up after IPS review.'
    ),
    false,
    'any_member'::public.proposal_confirm_role,
    smoke_analyst,
    now() + interval '7 days',
    'smoke-note-upsert'
  )
  on conflict (id) do update
    set payload = excluded.payload,
        preview = excluded.preview,
        status = excluded.status,
        requires_role = 'any_member'::public.proposal_confirm_role,
        requires_manager = false;

  insert into public.audit_events (id, firm_id, actor_id, action, entity_table, entity_id, payload)
  values (
    smoke_audit, smoke_firm, smoke_manager, 'seed', 'firms', smoke_firm,
    '{"source":"run_dev_seed"}'::jsonb
  )
  on conflict (id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'firm_id', smoke_firm,
    'project_ref', 'krcwpupbdizzjyydzaqp'
  );
end;
$$;

revoke all on function public.run_dev_seed() from public, anon, authenticated;
grant execute on function public.run_dev_seed() to service_role;

comment on table public.watchlists is 'Firm-scoped watchlists (CA-3.4). Mutations via proposal apply only.';
comment on table public.watchlist_items is 'Watchlist symbols / instruments (CA-3.4 / CA-4.6).';
comment on table public.workspace_focus is 'Per-user workspace focus for chat session context (CA-3.1).';
