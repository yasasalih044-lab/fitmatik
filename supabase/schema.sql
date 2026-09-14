-- Fit-matik account-scoped persistence and Fitcoin billing.
--
-- This migration is intentionally additive: it does NOT delete or read the
-- legacy public.entries table or the old public Storage bucket. Deploy this
-- migration before switching application code to these tables.

create extension if not exists "pgcrypto";

-- -------------------------------------------------------------------------
-- Accounts and meal entries
-- -------------------------------------------------------------------------

create table if not exists public.app_accounts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique check (phone ~ E'^\\+[0-9]{10,15}$'),
  password_salt text not null,
  password_hash text not null,
  name text not null check (char_length(name) between 2 and 60),
  age smallint not null check (age between 10 and 100),
  height_cm smallint not null check (height_cm between 100 and 250),
  weight_kg numeric(5,1) not null check (weight_kg between 25 and 350),
  gender text not null check (gender in ('kadin', 'erkek', 'belirtmek-istemiyorum')),
  theme text not null default 'siyah' check (theme in ('siyah', 'kirmizi', 'mor', 'pembe')),
  target_kcal integer not null default 2400 check (target_kcal between 1 and 10000),
  target_protein_g integer not null default 150 check (target_protein_g between 1 and 500),
  target_carbs_g integer not null default 250 check (target_carbs_g between 1 and 1000),
  target_fat_g integer not null default 80 check (target_fat_g between 1 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The app submits HMACed subject keys, never raw IP addresses. These durable
-- limits protect the one-time 5,000 FC grant and bound online password
-- guessing before scrypt is invoked.
create table if not exists public.signup_rate_limits (
  subject_type text not null check (subject_type in (
    'signup_ip', 'signup_phone', 'signin_ip', 'signin_phone'
  )),
  subject_hash text not null check (char_length(subject_hash) between 32 and 128),
  attempts integer not null check (attempts >= 0),
  window_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (subject_type, subject_hash)
);

create table if not exists public.app_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  eaten_at timestamptz not null default now(),
  source text not null check (source in ('text', 'image')),
  raw_input text,
  -- A private Storage object path, never a public URL.
  image_path text,
  title text not null,
  items jsonb not null default '[]'::jsonb,
  kcal_min integer not null default 0,
  kcal_max integer not null default 0,
  kcal_best integer not null default 0,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  confidence text not null default 'low',
  verdict text not null default '',
  sources jsonb not null default '[]'::jsonb,
  model text,
  tokens integer,
  constraint app_entries_image_source_check check (
    (source = 'image' and image_path is not null) or (source = 'text')
  )
);

create index if not exists app_entries_account_eaten_at_idx
  on public.app_entries (account_id, eaten_at desc);

-- -------------------------------------------------------------------------
-- Fitcoin wallet, immutable ledger, and provider-cost evidence
-- -------------------------------------------------------------------------

create table if not exists public.fitcoin_wallets (
  account_id uuid primary key references public.app_accounts(id) on delete cascade,
  available_fitcoin bigint not null default 5000 check (available_fitcoin >= 0),
  reserved_fitcoin bigint not null default 0 check (reserved_fitcoin >= 0),
  lifetime_spent_fitcoin bigint not null default 0 check (lifetime_spent_fitcoin >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.analysis_runs (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 200),
  request_digest text not null check (char_length(request_digest) between 16 and 200),
  status text not null default 'reserved' check (status in (
    'reserved', 'processing', 'succeeded', 'failed', 'rejected'
  )),
  reserved_fitcoin bigint not null default 0 check (reserved_fitcoin >= 0),
  charged_fitcoin bigint not null default 0 check (charged_fitcoin >= 0),
  entry_id uuid references public.app_entries(id) on delete set null,
  result_json jsonb,
  error text,
  provider_started_at timestamptz,
  provider_cost_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, idempotency_key)
);

create index if not exists analysis_runs_account_created_at_idx
  on public.analysis_runs (account_id, created_at desc);

create table if not exists public.fitcoin_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.app_accounts(id) on delete cascade,
  analysis_run_id uuid references public.analysis_runs(id) on delete set null,
  kind text not null check (kind in (
    'initial_grant', 'reservation', 'settlement', 'release', 'adjustment'
  )),
  available_delta_fitcoin bigint not null,
  reserved_delta_fitcoin bigint not null,
  available_balance_fitcoin bigint not null check (available_balance_fitcoin >= 0),
  reserved_balance_fitcoin bigint not null check (reserved_balance_fitcoin >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists fitcoin_ledger_account_created_at_idx
  on public.fitcoin_ledger (account_id, created_at desc);
create index if not exists fitcoin_ledger_analysis_run_idx
  on public.fitcoin_ledger (analysis_run_id);

-- The rate-card snapshot is data, rather than an implicit deployment detail.
-- Amounts are nano-USD per one million tokens/tool calls as appropriate.
create table if not exists public.fitcoin_rate_cards (
  version text primary key,
  model text not null,
  input_nano_usd_per_million bigint not null check (input_nano_usd_per_million >= 0),
  cached_input_nano_usd_per_million bigint not null check (cached_input_nano_usd_per_million >= 0),
  output_nano_usd_per_million bigint not null check (output_nano_usd_per_million >= 0),
  web_search_nano_usd_per_call bigint not null default 0 check (web_search_nano_usd_per_call >= 0),
  effective_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- OpenAI published gpt-5-mini pricing on 2026-09-14: $0.25/M input,
-- $0.025/M cached input, $2.00/M output and $10/1k web-search calls.
-- Image input is billed in the input-token field at the model input rate.
insert into public.fitcoin_rate_cards (
  version, model, input_nano_usd_per_million,
  cached_input_nano_usd_per_million, output_nano_usd_per_million,
  web_search_nano_usd_per_call
) values (
  'openai-gpt-5-mini-standard-2025-08-07', 'gpt-5-mini', 250000000,
  25000000, 2000000000, 10000000
) on conflict (version) do nothing;

create table if not exists public.ai_usage_receipts (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  stage text not null check (stage in ('parse', 'research')),
  provider text not null default 'openai',
  response_id text,
  requested_model text not null,
  model text not null,
  tool_type text,
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  cached_input_tokens bigint not null default 0 check (cached_input_tokens >= 0),
  cache_write_input_tokens bigint not null default 0 check (cache_write_input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  reasoning_tokens bigint not null default 0 check (reasoning_tokens >= 0),
  total_tokens bigint not null default 0 check (total_tokens >= 0),
  web_search_calls integer not null default 0 check (web_search_calls >= 0),
  cost_nano_usd bigint not null default 0 check (cost_nano_usd >= 0),
  fitcoin_units bigint not null default 0 check (fitcoin_units >= 0),
  rate_card_version text not null references public.fitcoin_rate_cards(version),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analysis_run_id, stage, response_id)
);

create unique index if not exists ai_usage_receipts_run_stage_without_response_idx
  on public.ai_usage_receipts (analysis_run_id, stage)
  where response_id is null;
create index if not exists ai_usage_receipts_run_created_at_idx
  on public.ai_usage_receipts (analysis_run_id, created_at);

-- -------------------------------------------------------------------------
-- Common safety triggers
-- -------------------------------------------------------------------------

create or replace function public.fitmatik_touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_accounts_touch_updated_at on public.app_accounts;
create trigger app_accounts_touch_updated_at
before update on public.app_accounts
for each row execute function public.fitmatik_touch_updated_at();

drop trigger if exists signup_rate_limits_touch_updated_at on public.signup_rate_limits;
create trigger signup_rate_limits_touch_updated_at
before update on public.signup_rate_limits
for each row execute function public.fitmatik_touch_updated_at();

drop trigger if exists fitcoin_wallets_touch_updated_at on public.fitcoin_wallets;
create trigger fitcoin_wallets_touch_updated_at
before update on public.fitcoin_wallets
for each row execute function public.fitmatik_touch_updated_at();

drop trigger if exists analysis_runs_touch_updated_at on public.analysis_runs;
create trigger analysis_runs_touch_updated_at
before update on public.analysis_runs
for each row execute function public.fitmatik_touch_updated_at();

create or replace function public.fitmatik_prevent_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% rows are immutable', tg_table_name using errcode = '55000';
end;
$$;

drop trigger if exists fitcoin_ledger_immutable on public.fitcoin_ledger;
create trigger fitcoin_ledger_immutable
before update or delete on public.fitcoin_ledger
for each row execute function public.fitmatik_prevent_mutation();

drop trigger if exists ai_usage_receipts_immutable on public.ai_usage_receipts;
create trigger ai_usage_receipts_immutable
before update or delete on public.ai_usage_receipts
for each row execute function public.fitmatik_prevent_mutation();

-- Rate cards are versioned snapshots: append a new version instead of editing
-- history used by existing receipts.
drop trigger if exists fitcoin_rate_cards_immutable on public.fitcoin_rate_cards;
create trigger fitcoin_rate_cards_immutable
before update or delete on public.fitcoin_rate_cards
for each row execute function public.fitmatik_prevent_mutation();

-- -------------------------------------------------------------------------
-- Atomic account creation and Fitcoin state transitions
-- -------------------------------------------------------------------------

create or replace function public.consume_signup_rate_limit(
  p_subject_type text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
begin
  if p_subject_type not in ('signup_ip', 'signup_phone', 'signin_ip', 'signin_phone')
    or char_length(coalesce(p_subject_hash, '')) < 32
    or p_max_attempts < 1
    or p_window <= interval '0 seconds' then
    raise exception 'invalid signup rate-limit arguments' using errcode = '22023';
  end if;

  insert into public.signup_rate_limits as rate (
    subject_type, subject_hash, attempts, window_started_at
  ) values (
    p_subject_type, p_subject_hash, 1, now()
  ) on conflict (subject_type, subject_hash) do update
  set attempts = case
        when rate.window_started_at <= now() - p_window then 1
        else rate.attempts + 1
      end,
      window_started_at = case
        when rate.window_started_at <= now() - p_window then now()
        else rate.window_started_at
      end
  returning attempts into v_attempts;

  if v_attempts > p_max_attempts then
    raise exception 'signup_rate_limited' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.create_app_account(
  p_phone text,
  p_password_salt text,
  p_password_hash text,
  p_name text,
  p_age smallint,
  p_height_cm smallint,
  p_weight_kg numeric,
  p_gender text,
  p_theme text,
  p_target_kcal integer,
  p_target_protein_g integer,
  p_target_carbs_g integer,
  p_target_fat_g integer,
  p_signup_ip_hash text,
  p_phone_rate_hash text
)
returns public.app_accounts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account public.app_accounts;
begin
  perform public.consume_signup_rate_limit('signup_ip', p_signup_ip_hash, 3, interval '24 hours');
  perform public.consume_signup_rate_limit('signup_phone', p_phone_rate_hash, 3, interval '24 hours');

  insert into public.app_accounts (
    phone, password_salt, password_hash, name, age, height_cm, weight_kg,
    gender, theme, target_kcal, target_protein_g, target_carbs_g, target_fat_g
  ) values (
    p_phone, p_password_salt, p_password_hash, p_name, p_age, p_height_cm,
    p_weight_kg, p_gender, coalesce(nullif(p_theme, ''), 'siyah'), p_target_kcal,
    p_target_protein_g, p_target_carbs_g, p_target_fat_g
  ) returning * into v_account;

  insert into public.fitcoin_wallets (account_id, available_fitcoin)
  values (v_account.id, 5000);

  insert into public.fitcoin_ledger (
    account_id, kind, available_delta_fitcoin, reserved_delta_fitcoin,
    available_balance_fitcoin, reserved_balance_fitcoin, metadata
  ) values (
    v_account.id, 'initial_grant', 5000, 0, 5000, 0,
    jsonb_build_object('reason', 'new_account_bonus')
  );

  return v_account;
end;
$$;

-- This runs in its own short RPC before account lookup/password verification.
-- Successful logins count too: that avoids an unbounded scrypt workload while
-- keeping the limits generous for normal device changes.
create or replace function public.consume_signin_rate_limit(
  p_ip_hash text,
  p_phone_hash text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.consume_signup_rate_limit('signin_ip', p_ip_hash, 30, interval '15 minutes');
  perform public.consume_signup_rate_limit('signin_phone', p_phone_hash, 10, interval '15 minutes');
exception
  when others then
    if sqlerrm like '%signup_rate_limited%' then
      raise exception 'signin_rate_limited' using errcode = 'P0001';
    end if;
    raise;
end;
$$;

create or replace function public.fitcoin_begin_analysis(
  p_account_id uuid,
  p_idempotency_key text,
  p_request_digest text,
  p_reserve_fitcoin bigint
)
returns table (
  analysis_run_id uuid,
  run_status text,
  sufficient boolean,
  replayed boolean,
  available_fitcoin bigint,
  reserved_fitcoin bigint,
  reserved_amount_fitcoin bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.analysis_runs;
  v_wallet public.fitcoin_wallets;
  v_stale public.analysis_runs%rowtype;
  v_inserted boolean := false;
begin
  if p_reserve_fitcoin < 0 then
    raise exception 'reserve amount cannot be negative' using errcode = '22023';
  end if;
  if char_length(trim(coalesce(p_idempotency_key, ''))) < 8 then
    raise exception 'invalid idempotency key' using errcode = '22023';
  end if;

  insert into public.analysis_runs (
    account_id, idempotency_key, request_digest, status, reserved_fitcoin
  ) values (
    p_account_id, p_idempotency_key, p_request_digest, 'reserved', p_reserve_fitcoin
  ) on conflict (account_id, idempotency_key) do nothing
  returning * into v_run;
  v_inserted := found;

  -- Serialize wallet mutations. A stale run is older than the maximum API
  -- duration plus a generous recovery margin; release it before considering a
  -- new reservation. SKIP LOCKED avoids a lock cycle with a finalizer that is
  -- already completing that run.
  select * into v_wallet
  from public.fitcoin_wallets
  where account_id = p_account_id
  for update;

  if not found then
    raise exception 'wallet not found for account' using errcode = '23503';
  end if;

  for v_stale in
    select * from public.analysis_runs
    where account_id = p_account_id
      and status in ('reserved', 'processing')
      and updated_at < now() - interval '15 minutes'
    for update skip locked
  loop
    update public.fitcoin_wallets
    set available_fitcoin = available_fitcoin + v_stale.reserved_fitcoin,
        reserved_fitcoin = reserved_fitcoin - v_stale.reserved_fitcoin
    where account_id = p_account_id
    returning * into v_wallet;

    update public.analysis_runs
    set status = 'failed', error = 'stale_analysis_released',
        provider_cost_status = 'expired'
    where id = v_stale.id;

    insert into public.fitcoin_ledger (
      account_id, analysis_run_id, kind, available_delta_fitcoin,
      reserved_delta_fitcoin, available_balance_fitcoin, reserved_balance_fitcoin,
      metadata
    ) values (
      p_account_id, v_stale.id, 'release', v_stale.reserved_fitcoin,
      -v_stale.reserved_fitcoin, v_wallet.available_fitcoin, v_wallet.reserved_fitcoin,
      jsonb_build_object('reason', 'stale_analysis_released')
    );
  end loop;

  if not v_inserted then
    select * into v_run
    from public.analysis_runs
    where account_id = p_account_id and idempotency_key = p_idempotency_key;

    if v_run.request_digest is distinct from p_request_digest then
      raise exception 'idempotency key was reused for a different request' using errcode = '22023';
    end if;

    return query select
      v_run.id, v_run.status,
      (v_run.status in ('reserved', 'processing', 'succeeded')), true,
      v_wallet.available_fitcoin, v_wallet.reserved_fitcoin,
      v_run.reserved_fitcoin;
    return;
  end if;

  if v_wallet.available_fitcoin < p_reserve_fitcoin then
    update public.analysis_runs
    set status = 'rejected', error = 'insufficient_fitcoin', reserved_fitcoin = 0
    where id = v_run.id;
    return query select
      v_run.id, 'rejected'::text, false, false,
      v_wallet.available_fitcoin, v_wallet.reserved_fitcoin, 0::bigint;
    return;
  end if;

  update public.fitcoin_wallets
  set available_fitcoin = available_fitcoin - p_reserve_fitcoin,
      reserved_fitcoin = reserved_fitcoin + p_reserve_fitcoin
  where account_id = p_account_id
  returning * into v_wallet;

  insert into public.fitcoin_ledger (
    account_id, analysis_run_id, kind, available_delta_fitcoin,
    reserved_delta_fitcoin, available_balance_fitcoin, reserved_balance_fitcoin,
    metadata
  ) values (
    p_account_id, v_run.id, 'reservation', -p_reserve_fitcoin, p_reserve_fitcoin,
    v_wallet.available_fitcoin, v_wallet.reserved_fitcoin,
    jsonb_build_object('idempotency_key', p_idempotency_key)
  );

  return query select
    v_run.id, 'reserved'::text, true, false,
    v_wallet.available_fitcoin, v_wallet.reserved_fitcoin, p_reserve_fitcoin;
end;
$$;

create or replace function public.fitcoin_claim_analysis(
  p_account_id uuid,
  p_analysis_run_id uuid
)
returns table (claimed boolean, run_status text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.analysis_runs;
begin
  update public.analysis_runs
  set status = 'processing', provider_started_at = coalesce(provider_started_at, now())
  where id = p_analysis_run_id and account_id = p_account_id and status = 'reserved'
  returning * into v_run;

  if found then
    return query select true, v_run.status;
    return;
  end if;

  select * into v_run from public.analysis_runs
  where id = p_analysis_run_id and account_id = p_account_id;
  if not found then
    raise exception 'analysis run not found' using errcode = 'P0002';
  end if;
  return query select false, v_run.status;
end;
$$;

create or replace function public.fitcoin_fail_analysis(
  p_account_id uuid,
  p_analysis_run_id uuid,
  p_error text,
  p_provider_cost_status text default 'not_charged'
)
returns table (
  run_status text,
  available_fitcoin bigint,
  reserved_fitcoin bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.analysis_runs;
  v_wallet public.fitcoin_wallets;
begin
  select * into v_run from public.analysis_runs
  where id = p_analysis_run_id and account_id = p_account_id
  for update;
  if not found then
    raise exception 'analysis run not found' using errcode = 'P0002';
  end if;

  select * into v_wallet from public.fitcoin_wallets
  where account_id = p_account_id
  for update;

  if v_run.status in ('failed', 'rejected') then
    return query select v_run.status, v_wallet.available_fitcoin, v_wallet.reserved_fitcoin;
    return;
  end if;
  if v_run.status = 'succeeded' then
    raise exception 'a successful analysis cannot be failed' using errcode = '55000';
  end if;

  update public.fitcoin_wallets
  set available_fitcoin = available_fitcoin + v_run.reserved_fitcoin,
      reserved_fitcoin = reserved_fitcoin - v_run.reserved_fitcoin
  where account_id = p_account_id
  returning * into v_wallet;

  update public.analysis_runs
  set status = 'failed', error = left(coalesce(p_error, 'analysis_failed'), 1000),
      provider_cost_status = p_provider_cost_status
  where id = p_analysis_run_id
  returning * into v_run;

  insert into public.fitcoin_ledger (
    account_id, analysis_run_id, kind, available_delta_fitcoin,
    reserved_delta_fitcoin, available_balance_fitcoin, reserved_balance_fitcoin,
    metadata
  ) values (
    p_account_id, p_analysis_run_id, 'release', v_run.reserved_fitcoin,
    -v_run.reserved_fitcoin, v_wallet.available_fitcoin, v_wallet.reserved_fitcoin,
    jsonb_build_object('reason', left(coalesce(p_error, 'analysis_failed'), 250))
  );

  return query select v_run.status, v_wallet.available_fitcoin, v_wallet.reserved_fitcoin;
end;
$$;

-- The normal success path. Keeping entry insertion, immutable cost evidence,
-- and wallet settlement in one transaction means a server restart can never
-- leave a charged analysis without its receipt (or vice versa).
create or replace function public.fitcoin_finalize_analysis(
  p_account_id uuid,
  p_analysis_run_id uuid,
  p_charged_fitcoin bigint,
  p_entry jsonb,
  p_receipts jsonb,
  p_result_json jsonb,
  p_provider_cost_status text default 'recorded'
)
returns table (
  entry_id uuid,
  run_status text,
  charged_fitcoin bigint,
  available_fitcoin bigint,
  reserved_fitcoin bigint
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_run public.analysis_runs;
  v_wallet public.fitcoin_wallets;
  v_entry_id uuid;
  v_release_fitcoin bigint;
  v_source text;
  v_image_path text;
  v_parse_receipts integer;
  v_research_receipts integer;
  v_receipt_fitcoin bigint;
begin
  if p_charged_fitcoin < 0 then
    raise exception 'charged amount cannot be negative' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_receipts, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(p_receipts, '[]'::jsonb)) <> 2 then
    raise exception 'a successful analysis requires exactly parse and research receipts' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_receipts) as receipt
    where jsonb_typeof(receipt) <> 'object'
      or coalesce(nullif(receipt ->> 'response_id', ''), '') = ''
      or coalesce(nullif(receipt ->> 'requested_model', ''), '') = ''
      or coalesce(nullif(receipt ->> 'model', ''), '') = ''
      or coalesce(nullif(receipt ->> 'rate_card_version', ''), '') = ''
      or coalesce(nullif(receipt ->> 'fitcoin_units', ''), '') !~ '^[0-9]+$'
      or coalesce(nullif(receipt ->> 'cost_nano_usd', ''), '') !~ '^[0-9]+$'
  ) then
    raise exception 'analysis usage receipts are incomplete or malformed' using errcode = '22023';
  end if;
  select
    count(*) filter (where receipt ->> 'stage' = 'parse'),
    count(*) filter (where receipt ->> 'stage' = 'research'),
    coalesce(sum((receipt ->> 'fitcoin_units')::bigint), 0)
  into v_parse_receipts, v_research_receipts, v_receipt_fitcoin
  from jsonb_array_elements(p_receipts) as receipt;
  if v_parse_receipts <> 1 or v_research_receipts <> 1
    or v_receipt_fitcoin <> p_charged_fitcoin then
    raise exception 'analysis receipt stages or Fitcoin total do not match settlement' using errcode = '22023';
  end if;

  select * into v_run from public.analysis_runs
  where id = p_analysis_run_id and account_id = p_account_id
  for update;
  if not found then
    raise exception 'analysis run not found' using errcode = 'P0002';
  end if;

  select * into v_wallet from public.fitcoin_wallets
  where account_id = p_account_id
  for update;

  -- A retry after a completed response never writes a second entry, receipt,
  -- or ledger row. The caller can hydrate `entry_id` separately.
  if v_run.status = 'succeeded' then
    return query select v_run.entry_id, v_run.status, v_run.charged_fitcoin,
      v_wallet.available_fitcoin, v_wallet.reserved_fitcoin;
    return;
  end if;
  if v_run.status not in ('reserved', 'processing') then
    raise exception 'analysis run cannot be finalized from status %', v_run.status using errcode = '55000';
  end if;
  if p_charged_fitcoin > v_run.reserved_fitcoin then
    raise exception 'actual charge exceeds reserved Fitcoin' using errcode = '22023';
  end if;

  if p_entry is not null then
    v_source := p_entry ->> 'source';
    v_image_path := nullif(p_entry ->> 'image_path', '');
    if v_source not in ('text', 'image') then
      raise exception 'invalid entry source' using errcode = '22023';
    end if;
    if v_source = 'image' and (
      v_image_path is null or left(v_image_path, char_length(p_account_id::text) + 1) <> p_account_id::text || '/'
    ) then
      raise exception 'entry image is outside account scope' using errcode = '22023';
    end if;
    if v_source = 'text' then
      v_image_path := null;
    end if;

    insert into public.app_entries (
      account_id, eaten_at, source, raw_input, image_path, title, items,
      kcal_min, kcal_max, kcal_best, protein_g, carbs_g, fat_g, confidence,
      verdict, sources, model, tokens
    ) values (
      p_account_id,
      coalesce(nullif(p_entry ->> 'eaten_at', '')::timestamptz, now()),
      v_source,
      nullif(p_entry ->> 'raw_input', ''),
      v_image_path,
      coalesce(nullif(p_entry ->> 'title', ''), 'Öğün'),
      coalesce(p_entry -> 'items', '[]'::jsonb),
      coalesce(nullif(p_entry ->> 'kcal_min', '')::integer, 0),
      coalesce(nullif(p_entry ->> 'kcal_max', '')::integer, 0),
      coalesce(nullif(p_entry ->> 'kcal_best', '')::integer, 0),
      nullif(p_entry ->> 'protein_g', '')::numeric,
      nullif(p_entry ->> 'carbs_g', '')::numeric,
      nullif(p_entry ->> 'fat_g', '')::numeric,
      coalesce(nullif(p_entry ->> 'confidence', ''), 'low'),
      coalesce(nullif(p_entry ->> 'verdict', ''), ''),
      coalesce(p_entry -> 'sources', '[]'::jsonb),
      nullif(p_entry ->> 'model', ''),
      nullif(p_entry ->> 'tokens', '')::integer
    ) returning id into v_entry_id;
  end if;

  insert into public.ai_usage_receipts (
    analysis_run_id, stage, provider, response_id, requested_model, model,
    tool_type, input_tokens, cached_input_tokens, cache_write_input_tokens,
    output_tokens, reasoning_tokens, total_tokens, web_search_calls,
    cost_nano_usd, fitcoin_units, rate_card_version, metadata
  )
  select
    p_analysis_run_id,
    receipt ->> 'stage',
    coalesce(nullif(receipt ->> 'provider', ''), 'openai'),
    nullif(receipt ->> 'response_id', ''),
    receipt ->> 'requested_model',
    receipt ->> 'model',
    nullif(receipt ->> 'tool_type', ''),
    coalesce(nullif(receipt ->> 'input_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'cached_input_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'cache_write_input_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'output_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'reasoning_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'total_tokens', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'web_search_calls', '')::integer, 0),
    coalesce(nullif(receipt ->> 'cost_nano_usd', '')::bigint, 0),
    coalesce(nullif(receipt ->> 'fitcoin_units', '')::bigint, 0),
    receipt ->> 'rate_card_version',
    coalesce(receipt -> 'metadata', '{}'::jsonb)
  from jsonb_array_elements(coalesce(p_receipts, '[]'::jsonb)) as receipt;

  v_release_fitcoin := v_run.reserved_fitcoin - p_charged_fitcoin;
  update public.fitcoin_wallets
  set available_fitcoin = available_fitcoin + v_release_fitcoin,
      reserved_fitcoin = reserved_fitcoin - v_run.reserved_fitcoin,
      lifetime_spent_fitcoin = lifetime_spent_fitcoin + p_charged_fitcoin
  where account_id = p_account_id
  returning * into v_wallet;

  update public.analysis_runs
  set status = 'succeeded', charged_fitcoin = p_charged_fitcoin,
      entry_id = v_entry_id, result_json = p_result_json,
      provider_cost_status = p_provider_cost_status
  where id = p_analysis_run_id
  returning * into v_run;

  insert into public.fitcoin_ledger (
    account_id, analysis_run_id, kind, available_delta_fitcoin,
    reserved_delta_fitcoin, available_balance_fitcoin, reserved_balance_fitcoin,
    metadata
  ) values (
    p_account_id, p_analysis_run_id, 'settlement', v_release_fitcoin,
    -v_run.reserved_fitcoin, v_wallet.available_fitcoin, v_wallet.reserved_fitcoin,
    jsonb_build_object('charged_fitcoin', p_charged_fitcoin)
  );

  return query select v_run.entry_id, v_run.status, v_run.charged_fitcoin,
    v_wallet.available_fitcoin, v_wallet.reserved_fitcoin;
end;
$$;

-- -------------------------------------------------------------------------
-- Private image bucket and direct-client lockout
-- -------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('fitmatik-private', 'fitmatik-private', false)
on conflict (id) do update set public = false;

alter table public.app_accounts enable row level security;
alter table public.signup_rate_limits enable row level security;
alter table public.app_entries enable row level security;
alter table public.fitcoin_wallets enable row level security;
alter table public.fitcoin_ledger enable row level security;
alter table public.analysis_runs enable row level security;
alter table public.ai_usage_receipts enable row level security;
alter table public.fitcoin_rate_cards enable row level security;

revoke all on table public.app_accounts, public.signup_rate_limits, public.app_entries, public.fitcoin_wallets,
  public.fitcoin_ledger, public.analysis_runs, public.ai_usage_receipts,
  public.fitcoin_rate_cards from anon, authenticated;
grant usage on schema public to service_role;
grant select, insert, update, delete on table public.app_accounts, public.signup_rate_limits,
  public.app_entries, public.fitcoin_wallets, public.fitcoin_ledger,
  public.analysis_runs, public.ai_usage_receipts, public.fitcoin_rate_cards to service_role;
revoke all on function public.consume_signup_rate_limit(text, text, integer, interval) from public, anon, authenticated;
revoke all on function public.consume_signin_rate_limit(text, text) from public, anon, authenticated;
revoke all on function public.create_app_account(text, text, text, text, smallint, smallint, numeric, text, text, integer, integer, integer, integer, text, text) from public, anon, authenticated;
revoke all on function public.fitcoin_begin_analysis(uuid, text, text, bigint) from public, anon, authenticated;
revoke all on function public.fitcoin_claim_analysis(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fitcoin_fail_analysis(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.fitcoin_finalize_analysis(uuid, uuid, bigint, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.create_app_account(text, text, text, text, smallint, smallint, numeric, text, text, integer, integer, integer, integer, text, text) to service_role;
grant execute on function public.consume_signin_rate_limit(text, text) to service_role;
grant execute on function public.fitcoin_begin_analysis(uuid, text, text, bigint) to service_role;
grant execute on function public.fitcoin_claim_analysis(uuid, uuid) to service_role;
grant execute on function public.fitcoin_fail_analysis(uuid, uuid, text, text) to service_role;
grant execute on function public.fitcoin_finalize_analysis(uuid, uuid, bigint, jsonb, jsonb, jsonb, text) to service_role;
