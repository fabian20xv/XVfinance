-- XVfinance E1 — schema + RLS
-- Target ONLY https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Never apply this migration to any other Supabase project.

create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.firm_role as enum ('manager', 'analyst');
create type public.client_status as enum ('active', 'inactive');
create type public.report_status as enum ('draft', 'published');
create type public.proposal_status as enum (
  'draft',
  'pending_confirm',
  'confirmed',
  'rejected',
  'applied',
  'failed'
);
create type public.proposal_kind as enum (
  'client_upsert',
  'contact_upsert',
  'holding_changes',
  'portfolio_upsert',
  'note_upsert',
  'report_publish'
);

-- ---------------------------------------------------------------------------
-- Helpers (private schema — not exposed on the Data API)
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- CA-1.1 Core tenancy
-- ---------------------------------------------------------------------------

create table public.firms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.firm_members (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.firm_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (firm_id, user_id)
);

create index firm_members_firm_id_idx on public.firm_members (firm_id);
create index firm_members_user_id_idx on public.firm_members (user_id);

create trigger firms_set_updated_at
before update on public.firms
for each row execute function private.set_updated_at();

create trigger firm_members_set_updated_at
before update on public.firm_members
for each row execute function private.set_updated_at();

create or replace function private.is_firm_member(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.firm_members as fm
    where fm.firm_id = p_firm_id
      and fm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_firm_manager(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.firm_members as fm
    where fm.firm_id = p_firm_id
      and fm.user_id = (select auth.uid())
      and fm.role = 'manager'::public.firm_role
  );
$$;

create or replace function private.firm_role(p_firm_id uuid)
returns public.firm_role
language sql
stable
security definer
set search_path = ''
as $$
  select fm.role
  from public.firm_members as fm
  where fm.firm_id = p_firm_id
    and fm.user_id = (select auth.uid())
  limit 1;
$$;

revoke all on function private.is_firm_member(uuid) from public, anon;
revoke all on function private.is_firm_manager(uuid) from public, anon;
revoke all on function private.firm_role(uuid) from public, anon;

grant execute on function private.is_firm_member(uuid) to authenticated, service_role;
grant execute on function private.is_firm_manager(uuid) to authenticated, service_role;
grant execute on function private.firm_role(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- CA-1.2 Domain tables (all with firm_id) + CA-1.5 cash/liquidity
-- ---------------------------------------------------------------------------

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 200),
  legal_name text,
  status public.client_status not null default 'active',
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id)
);

create index clients_firm_id_idx on public.clients (firm_id);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  client_id uuid not null,
  full_name text not null check (char_length(full_name) between 1 and 200),
  email text,
  phone text,
  title text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  foreign key (client_id, firm_id) references public.clients (id, firm_id) on delete cascade
);

create index contacts_firm_id_idx on public.contacts (firm_id);
create index contacts_client_id_idx on public.contacts (client_id);
create index contacts_client_id_firm_id_idx on public.contacts (client_id, firm_id);

create table public.portfolios (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(name) between 1 and 200),
  base_currency text not null default 'USD' check (char_length(base_currency) = 3),
  -- CA-1.5 cash & liquidity (firm-scoped on portfolio)
  cash_balance numeric(20, 4) not null default 0,
  cash_currency text not null default 'USD' check (char_length(cash_currency) = 3),
  liquidity_available numeric(20, 4) not null default 0,
  liquidity_buffer numeric(20, 4) not null default 0 check (liquidity_buffer >= 0),
  liquidity_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  foreign key (client_id, firm_id) references public.clients (id, firm_id) on delete cascade
);

create index portfolios_firm_id_idx on public.portfolios (firm_id);
create index portfolios_client_id_idx on public.portfolios (client_id);
create index portfolios_client_id_firm_id_idx on public.portfolios (client_id, firm_id);

create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  symbol text not null check (char_length(symbol) between 1 and 32),
  name text not null check (char_length(name) between 1 and 200),
  isin text,
  asset_class text,
  currency text check (currency is null or char_length(currency) = 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  unique (firm_id, symbol)
);

create index instruments_firm_id_idx on public.instruments (firm_id);

create table public.holdings (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  portfolio_id uuid not null,
  instrument_id uuid not null,
  quantity numeric(28, 8) not null,
  cost_basis numeric(20, 4),
  as_of date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  unique (portfolio_id, instrument_id),
  foreign key (portfolio_id, firm_id) references public.portfolios (id, firm_id) on delete cascade,
  foreign key (instrument_id, firm_id) references public.instruments (id, firm_id)
);

create index holdings_firm_id_idx on public.holdings (firm_id);
create index holdings_portfolio_id_idx on public.holdings (portfolio_id);
create index holdings_instrument_id_idx on public.holdings (instrument_id);
create index holdings_portfolio_id_firm_id_idx on public.holdings (portfolio_id, firm_id);
create index holdings_instrument_id_firm_id_idx on public.holdings (instrument_id, firm_id);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  client_id uuid not null,
  body text not null check (char_length(body) >= 1),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  foreign key (client_id, firm_id) references public.clients (id, firm_id) on delete cascade
);

create index notes_firm_id_idx on public.notes (firm_id);
create index notes_client_id_idx on public.notes (client_id);
create index notes_client_id_firm_id_idx on public.notes (client_id, firm_id);
create index notes_created_by_idx on public.notes (created_by);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  client_id uuid,
  title text not null check (char_length(title) between 1 and 200),
  body text not null default '',
  status public.report_status not null default 'draft',
  created_by uuid references auth.users (id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, firm_id),
  foreign key (client_id, firm_id) references public.clients (id, firm_id) on delete set null
);

create index reports_firm_id_idx on public.reports (firm_id);
create index reports_client_id_idx on public.reports (client_id);
create index reports_client_id_firm_id_idx on public.reports (client_id, firm_id);
create index reports_created_by_idx on public.reports (created_by);

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  kind public.proposal_kind not null,
  status public.proposal_status not null default 'draft',
  payload jsonb not null default '{}'::jsonb,
  requires_manager boolean not null default true,
  created_by uuid not null references auth.users (id),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  rejected_by uuid references auth.users (id),
  rejected_at timestamptz,
  applied_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index proposals_firm_id_idx on public.proposals (firm_id);
create index proposals_status_idx on public.proposals (firm_id, status);
create index proposals_created_by_idx on public.proposals (created_by);
create index proposals_confirmed_by_idx on public.proposals (confirmed_by);
create index proposals_rejected_by_idx on public.proposals (rejected_by);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  firm_id uuid not null references public.firms (id) on delete cascade,
  actor_id uuid references auth.users (id),
  action text not null check (char_length(action) between 1 and 80),
  entity_table text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_firm_id_idx on public.audit_events (firm_id);
create index audit_events_created_at_idx on public.audit_events (firm_id, created_at desc);
create index audit_events_actor_id_idx on public.audit_events (actor_id);

create trigger clients_set_updated_at
before update on public.clients
for each row execute function private.set_updated_at();

create trigger contacts_set_updated_at
before update on public.contacts
for each row execute function private.set_updated_at();

create trigger portfolios_set_updated_at
before update on public.portfolios
for each row execute function private.set_updated_at();

create trigger instruments_set_updated_at
before update on public.instruments
for each row execute function private.set_updated_at();

create trigger holdings_set_updated_at
before update on public.holdings
for each row execute function private.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function private.set_updated_at();

create trigger reports_set_updated_at
before update on public.reports
for each row execute function private.set_updated_at();

create trigger proposals_set_updated_at
before update on public.proposals
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- CA-1.3 RLS + grants
-- Firm-scoped select. High-PII / holdings / notes: no direct client writes
-- (mutations go through proposal apply via service-role in E4).
-- Report drafts: members may insert/update. Confirm is manager-gated.
-- ---------------------------------------------------------------------------

alter table public.firms enable row level security;
alter table public.firm_members enable row level security;
alter table public.clients enable row level security;
alter table public.contacts enable row level security;
alter table public.portfolios enable row level security;
alter table public.instruments enable row level security;
alter table public.holdings enable row level security;
alter table public.notes enable row level security;
alter table public.reports enable row level security;
alter table public.proposals enable row level security;
alter table public.audit_events enable row level security;

revoke all on table public.firms from anon, authenticated;
revoke all on table public.firm_members from anon, authenticated;
revoke all on table public.clients from anon, authenticated;
revoke all on table public.contacts from anon, authenticated;
revoke all on table public.portfolios from anon, authenticated;
revoke all on table public.instruments from anon, authenticated;
revoke all on table public.holdings from anon, authenticated;
revoke all on table public.notes from anon, authenticated;
revoke all on table public.reports from anon, authenticated;
revoke all on table public.proposals from anon, authenticated;
revoke all on table public.audit_events from anon, authenticated;

-- Reads: every firm member (MVP: all members read all firm clients).
grant select on table public.firms to authenticated;
grant select on table public.firm_members to authenticated;
grant select on table public.clients to authenticated;
grant select on table public.contacts to authenticated;
grant select on table public.portfolios to authenticated;
grant select on table public.instruments to authenticated;
grant select on table public.holdings to authenticated;
grant select on table public.notes to authenticated;
grant select on table public.reports to authenticated;
grant select on table public.proposals to authenticated;
grant select on table public.audit_events to authenticated;

-- Direct writes only where the product allows them.
-- High-PII (clients, contacts), holdings, notes, portfolios, instruments,
-- firms, members, audit: service-role / proposal-apply only.
grant insert, update on table public.proposals to authenticated;
grant insert, update on table public.reports to authenticated;

create policy firms_select_member
on public.firms
for select
to authenticated
using ((select private.is_firm_member(id)));

create policy firm_members_select_member
on public.firm_members
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy clients_select_firm
on public.clients
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy contacts_select_firm
on public.contacts
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy portfolios_select_firm
on public.portfolios
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy instruments_select_firm
on public.instruments
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy holdings_select_firm
on public.holdings
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy notes_select_firm
on public.notes
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy reports_select_firm
on public.reports
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy proposals_select_firm
on public.proposals
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

create policy audit_events_select_firm
on public.audit_events
for select
to authenticated
using ((select private.is_firm_member(firm_id)));

-- Proposals: any member may open a draft / submit for confirm.
create policy proposals_insert_member
on public.proposals
for insert
to authenticated
with check (
  (select private.is_firm_member(firm_id))
  and created_by = (select auth.uid())
  and status in ('draft'::public.proposal_status, 'pending_confirm'::public.proposal_status)
);

-- Author may edit their own draft and submit it.
create policy proposals_update_author_draft
on public.proposals
for update
to authenticated
using (
  (select private.is_firm_member(firm_id))
  and created_by = (select auth.uid())
  and status = 'draft'::public.proposal_status
)
with check (
  (select private.is_firm_member(firm_id))
  and created_by = (select auth.uid())
  and status in ('draft'::public.proposal_status, 'pending_confirm'::public.proposal_status)
);

-- Confirm / reject: managers when requires_manager; otherwise any member.
create policy proposals_update_confirm
on public.proposals
for update
to authenticated
using (
  status = 'pending_confirm'::public.proposal_status
  and (
    case
      when requires_manager then (select private.is_firm_manager(firm_id))
      else (select private.is_firm_member(firm_id))
    end
  )
)
with check (
  (select private.is_firm_member(firm_id))
  and status in ('confirmed'::public.proposal_status, 'rejected'::public.proposal_status)
);

-- Report drafts (publish goes through proposal + manager confirm in E5).
create policy reports_insert_draft
on public.reports
for insert
to authenticated
with check (
  (select private.is_firm_member(firm_id))
  and created_by = (select auth.uid())
  and status = 'draft'::public.report_status
);

create policy reports_update_draft
on public.reports
for update
to authenticated
using (
  (select private.is_firm_member(firm_id))
  and status = 'draft'::public.report_status
)
with check (
  (select private.is_firm_member(firm_id))
  and status = 'draft'::public.report_status
  and published_at is null
);

-- ---------------------------------------------------------------------------
-- CA-1.4 Dev seed + smoke RPCs (service-role only; Data API hidden from clients)
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
  smoke_audit constant uuid := 'a0000000-0000-4000-8000-000000000080';
  jwt_role text;
begin
  jwt_role := coalesce(auth.role(), '');
  if jwt_role in ('authenticated', 'anon') then
    raise exception 'run_dev_seed is server-only (service_role)';
  end if;

  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      smoke_manager,
      'authenticated',
      'authenticated',
      'smoke-manager@xvfinance.invalid',
      extensions.crypt('smoke-not-a-login', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      smoke_analyst,
      'authenticated',
      'authenticated',
      'smoke-analyst@xvfinance.invalid',
      extensions.crypt('smoke-not-a-login', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
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

  insert into public.proposals (
    id, firm_id, kind, status, payload, requires_manager, created_by
  )
  values (
    smoke_proposal,
    smoke_firm,
    'holding_changes'::public.proposal_kind,
    'pending_confirm'::public.proposal_status,
    '{"instrument":"SPY","quantity":110}'::jsonb,
    true,
    smoke_analyst
  )
  on conflict (id) do update set payload = excluded.payload, status = excluded.status;

  insert into public.audit_events (id, firm_id, actor_id, action, entity_table, entity_id, payload)
  values (
    smoke_audit,
    smoke_firm,
    smoke_manager,
    'seed',
    'firms',
    smoke_firm,
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

create or replace function public.smoke_e1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jwt_role text;
  missing text[] := '{}';
  tbl text;
  rls_off text[] := '{}';
  result jsonb;
begin
  jwt_role := coalesce(auth.role(), '');
  if jwt_role in ('authenticated', 'anon') then
    raise exception 'smoke_e1 is server-only (service_role)';
  end if;

  foreach tbl in array array[
    'firms', 'firm_members', 'clients', 'contacts', 'portfolios',
    'instruments', 'holdings', 'notes', 'reports', 'proposals', 'audit_events'
  ]
  loop
    if to_regclass('public.' || tbl) is null then
      missing := missing || tbl;
    elsif not coalesce(
      (select c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = tbl),
      false
    ) then
      rls_off := rls_off || tbl;
    end if;
  end loop;

  select jsonb_build_object(
    'ok', missing = '{}' and rls_off = '{}' and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'portfolios'
        and column_name in ('cash_balance', 'liquidity_available', 'liquidity_buffer')
      group by table_name
      having count(*) = 3
    ) and exists (
      select 1 from public.firm_members
      where firm_id = 'a0000000-0000-4000-8000-000000000001'
        and role = 'manager'
    ) and exists (
      select 1 from public.firm_members
      where firm_id = 'a0000000-0000-4000-8000-000000000001'
        and role = 'analyst'
    ) and exists (
      select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'private' and p.proname = 'is_firm_member'
    ),
    'project_ref', 'krcwpupbdizzjyydzaqp',
    'missing_tables', to_jsonb(missing),
    'rls_disabled', to_jsonb(rls_off),
    'firm_roles', (
      select coalesce(jsonb_agg(role order by role), '[]'::jsonb)
      from public.firm_members
      where firm_id = 'a0000000-0000-4000-8000-000000000001'
    ),
    'portfolio_cash', (
      select jsonb_build_object(
        'cash_balance', cash_balance,
        'liquidity_available', liquidity_available,
        'liquidity_buffer', liquidity_buffer
      )
      from public.portfolios
      where id = 'a0000000-0000-4000-8000-000000000020'
    )
  )
  into result;

  return result;
end;
$$;

revoke all on function public.run_dev_seed() from public, anon, authenticated;
revoke all on function public.smoke_e1() from public, anon, authenticated;
grant execute on function public.run_dev_seed() to service_role;
grant execute on function public.smoke_e1() to service_role;

comment on table public.firms is 'XVfinance tenancy root. Locked project krcwpupbdizzjyydzaqp only.';
comment on table public.firm_members is 'Firm membership with roles manager | analyst.';
comment on table public.portfolios is 'Includes CA-1.5 cash_balance and liquidity_* fields.';
comment on column public.portfolios.cash_balance is 'Portfolio cash (CA-1.5).';
comment on column public.portfolios.liquidity_available is 'Deployable liquidity (CA-1.5).';
comment on column public.portfolios.liquidity_buffer is 'Reserved liquidity buffer (CA-1.5).';
