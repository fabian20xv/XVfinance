-- XVfinance E9 — Meeting Ghostwriter + Receipts
-- Target ONLY https://krcwpupbdizzjyydzaqp.supabase.co (ref krcwpupbdizzjyydzaqp)
-- Never apply this migration to any other Supabase project.

alter type public.proposal_kind add value if not exists 'meeting_send';

alter table public.reports
  add column if not exists purpose text not null default 'general',
  add column if not exists receipts jsonb not null default '[]'::jsonb,
  add column if not exists sent_at timestamptz,
  add column if not exists send_channel text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_purpose_check'
  ) then
    alter table public.reports
      add constraint reports_purpose_check
      check (purpose in ('general', 'meeting_one_pager'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'reports_send_channel_check'
  ) then
    alter table public.reports
      add constraint reports_send_channel_check
      check (send_channel is null or send_channel in ('email', 'export'));
  end if;
end
$$;

comment on column public.reports.purpose is 'general | meeting_one_pager (CA-9 ghostwriter drafts).';
comment on column public.reports.receipts is 'Firm-scoped citation receipts for meeting 1-pagers (CA-9.2).';
comment on column public.reports.sent_at is 'Set on manager-confirmed meeting send/export (CA-9.3). Never a public URL.';
comment on column public.reports.send_channel is 'email | export after meeting_send confirm.';

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
  v_item jsonb;
  v_symbol text;
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
    perform private.apply_holding_change_list(
      p.firm_id,
      (v_payload->>'portfolio_id')::uuid,
      v_payload->'changes',
      true
    );

  elsif p.kind = 'holdings_import'::public.proposal_kind then
    if coalesce(jsonb_typeof(v_payload->'unmatched'), 'null') = 'array'
       and jsonb_array_length(v_payload->'unmatched') > 0 then
      raise exception 'unmatched symbols block confirm';
    end if;
    perform private.apply_holding_change_list(
      p.firm_id,
      (v_payload->>'portfolio_id')::uuid,
      coalesce(v_payload->'changes', v_payload->'matched'),
      false
    );

  elsif p.kind = 'scratchpad_promote'::public.proposal_kind then
    perform private.apply_holding_change_list(
      p.firm_id,
      (v_payload->>'portfolio_id')::uuid,
      v_payload->'changes',
      false
    );

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
    v_id := nullif(v_payload->>'report_id', '')::uuid;
    if v_id is null then
      raise exception 'report_publish requires report_id';
    end if;
    update public.reports r
    set
      status = 'published'::public.report_status,
      published_at = coalesce(r.published_at, now())
    where r.id = v_id
      and r.firm_id = p.firm_id
      and r.status = 'draft'::public.report_status;
    if not found then
      raise exception 'draft report % not found in firm', v_id;
    end if;
    -- Never create an anonymous public URL.

  elsif p.kind = 'meeting_send'::public.proposal_kind then
    perform private.apply_meeting_send(p);

  else
    raise exception 'unsupported proposal kind %', p.kind;
  end if;
end;
$$;

revoke all on function private.apply_proposal_payload(public.proposals) from public, anon, authenticated;

insert into public.reports (
  id, firm_id, client_id, title, body, sections, receipts, purpose, status, created_by, published_at, sent_at
)
values (
  'a0000000-0000-4000-8000-000000000093',
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000010',
  'Smoke meeting 1-pager',
  'Draft meeting 1-pager with receipts.',
  jsonb_build_array(
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000094',
      'heading', 'Purpose',
      'body', 'Internal draft until manager confirm.',
      'ordinal', 0
    )
  ),
  jsonb_build_array(
    jsonb_build_object(
      'id', 'a0000000-0000-4000-8000-000000000095',
      'citation', 'R1',
      'source_table', 'notes',
      'source_id', 'a0000000-0000-4000-8000-000000000050',
      'firm_id', 'a0000000-0000-4000-8000-000000000001',
      'label', 'Client note',
      'excerpt', 'Smoke note: IPS review scheduled.',
      'path', '/v1/notes/a0000000-0000-4000-8000-000000000050',
      'auditable', true,
      'public_url', null
    )
  ),
  'meeting_one_pager',
  'draft',
  'a0000000-0000-4000-8000-0000000000bb',
  null,
  null
)
on conflict (id) do update
  set purpose = 'meeting_one_pager',
      receipts = excluded.receipts,
      status = 'draft',
      published_at = null,
      sent_at = null,
      send_channel = null;

create or replace function public.smoke_e9()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  jwt_role text;
begin
  jwt_role := coalesce(auth.role(), '');
  if jwt_role in ('authenticated', 'anon') then
    raise exception 'smoke_e9 is server-only (service_role)';
  end if;

  return jsonb_build_object(
    'ok',
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'reports' and column_name = 'receipts'
      )
      and exists (
        select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'proposal_kind' and e.enumlabel = 'meeting_send'
      )
      and exists (
        select 1 from public.reports
        where id = 'a0000000-0000-4000-8000-000000000093'
          and purpose = 'meeting_one_pager'
          and coalesce(jsonb_array_length(receipts), 0) > 0
          and sent_at is null
      )
      and exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'private' and p.proname = 'apply_meeting_send'
      ),
    'project_ref', 'krcwpupbdizzjyydzaqp',
    'meeting_purpose', (
      select purpose from public.reports
      where id = 'a0000000-0000-4000-8000-000000000093'
    ),
    'receipt_count', (
      select jsonb_array_length(receipts) from public.reports
      where id = 'a0000000-0000-4000-8000-000000000093'
    )
  );
end;
$$;

revoke all on function public.smoke_e9() from public, anon, authenticated;
grant execute on function public.smoke_e9() to service_role;
