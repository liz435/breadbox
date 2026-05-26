-- ── Billing: free-credits v1 ────────────────────────────────────────────
--
-- One wallet per user (1:1 with auth.users); append-only signed-delta
-- ledger. Postgres RULEs block UPDATE/DELETE on the ledger — corrections
-- are made by posting a compensating `adjustment` row. The wallet's
-- `balance_posted` is a cached projection of SUM(delta); the service
-- layer updates both in one Supabase transaction so they can't drift
-- mid-request. Drift detection lives in a future audit endpoint.
--
-- Scope of this migration:
--   • No Stripe — purchase / auto-recharge / chargeback kinds are
--     reserved in the enum but never written until paid tiers land.
--   • No workspaces — wallet is per-user. A future migration can
--     introduce a per-workspace wallet without forcing a backfill of
--     this table (they'd be parallel surfaces, indexed differently).
--   • No holds — `balance_held_credits` isn't modeled yet; dispute
--     handling needs Stripe first.

-- ── credit_wallets ──────────────────────────────────────────────────────

create table public.credit_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance_posted integer not null default 0,
  last_verified_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.credit_wallets enable row level security;

-- Read your own wallet. No INSERT / UPDATE / DELETE policies — only the
-- service role (which bypasses RLS) writes. Direct DB tampering by a
-- compromised user account is blocked at the policy boundary.
create policy credit_wallets_owner_select on public.credit_wallets
  for select using (user_id = auth.uid());

-- ── credit_transactions (append-only ledger) ────────────────────────────

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  kind text not null,
  -- Loose foreign key. `(ref_type, ref_id)` carries the originating
  -- domain object so debits can be idempotent and traceable:
  --   ref_type = 'run'                   → ref_id = agent_runs.id
  --   ref_type = 'stripe_payment_intent' → ref_id = pi_*   (future)
  --   ref_type = 'admin_adjustment'      → ref_id = ticket id
  --   ref_type = NULL                    → system event (grant_signup)
  ref_type text,
  ref_id text,
  -- Kind-specific context. Schema by kind:
  --   debit_llm:     { model, input_tokens, output_tokens, usd, markup }
  --   grant_signup:  { backfilled?: bool }
  --   adjustment:    { reason, internal_ticket, reverses_id? }
  metadata jsonb not null default '{}'::jsonb,
  -- Attribution, not authorization. In a workspaces future this would
  -- name which member burned the credits; today it's the same UUID as
  -- user_id (or NULL for system grants).
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint credit_transactions_kind_check check (
    kind in (
      'grant_signup',
      'grant_monthly_plan',
      'purchase_pack',
      'purchase_auto_recharge',
      'debit_llm',
      'debit_tool',
      'refund',
      'chargeback',
      'adjustment'
    )
  )
);

create index credit_transactions_user_created_idx
  on public.credit_transactions (user_id, created_at desc);

-- Idempotency lookup: webhook handlers + debit writers UPSERT on the
-- (ref_type, ref_id) pair, so this index has to be cheap to probe.
create index credit_transactions_ref_idx
  on public.credit_transactions (ref_type, ref_id)
  where ref_id is not null;

-- Append-only enforcement at the database level. UPDATE/DELETE silently
-- no-op via RULEs — corrections come in as compensating rows.
-- (DROP RULE … or removing them from a future migration is a deliberate
-- escape hatch the operator can use; an SQL injection on an authed
-- endpoint can't.)
create rule credit_transactions_no_update as
  on update to public.credit_transactions do instead nothing;
create rule credit_transactions_no_delete as
  on delete to public.credit_transactions do instead nothing;

alter table public.credit_transactions enable row level security;

-- Read your own ledger entries. No INSERT/UPDATE/DELETE policies —
-- writes go through the service role only.
create policy credit_transactions_owner_select on public.credit_transactions
  for select using (user_id = auth.uid());

-- ── Atomic debit RPC ────────────────────────────────────────────────────
--
-- One round trip + one transaction for the (insert ledger row, decrement
-- wallet) pair. Idempotent on (ref_type, ref_id) — a duplicate call
-- returns `{ debited: false, balance_posted: <current> }` rather than
-- posting a second row. Used by the post-run debit path; designed so the
-- API server can call it once at completeRun without managing its own
-- transaction.
--
-- SECURITY DEFINER + restricted search_path: the function runs with
-- table-owner privileges (so it bypasses RLS to write the ledger) but
-- the search_path is pinned to `pg_catalog, public` so a hijacked
-- search_path env can't redirect the inserts to a user-owned schema.

create or replace function public.debit_credits(
  p_user_id uuid,
  p_credits integer,
  p_kind text,
  p_ref_type text,
  p_ref_id text,
  p_metadata jsonb,
  p_created_by_user_id uuid
) returns table (debited boolean, balance_posted integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing uuid;
  v_balance integer;
begin
  if p_credits <= 0 then
    select cw.balance_posted into v_balance
      from public.credit_wallets cw where cw.user_id = p_user_id;
    return query select false, coalesce(v_balance, 0);
    return;
  end if;

  -- Idempotency probe. Same (ref_type, ref_id) wins exactly once.
  if p_ref_type is not null and p_ref_id is not null then
    select id into v_existing
      from public.credit_transactions
      where ref_type = p_ref_type and ref_id = p_ref_id
      limit 1;
    if v_existing is not null then
      select cw.balance_posted into v_balance
        from public.credit_wallets cw where cw.user_id = p_user_id;
      return query select false, coalesce(v_balance, 0);
      return;
    end if;
  end if;

  insert into public.credit_transactions (
    user_id, delta, kind, ref_type, ref_id, metadata, created_by_user_id
  ) values (
    p_user_id, -p_credits, p_kind, p_ref_type, p_ref_id, p_metadata, p_created_by_user_id
  );

  update public.credit_wallets
     set balance_posted = balance_posted - p_credits,
         updated_at = now()
   where user_id = p_user_id
   returning balance_posted into v_balance;

  return query select true, coalesce(v_balance, 0);
end;
$$;

-- Allow the service-role client to invoke. Anon / authenticated users
-- can't call directly — they have to go through an API route that
-- threads a verified user_id.
revoke all on function public.debit_credits from public;
grant execute on function public.debit_credits to service_role;

-- ── Wallet seed RPC ─────────────────────────────────────────────────────
--
-- Lazy idempotent wallet creation. First authed request from a user
-- triggers this; subsequent calls return the existing balance without
-- duplicating the grant. The whole thing is one transaction so the
-- wallet + opening ledger row land together (or not at all).

create or replace function public.ensure_credit_wallet(
  p_user_id uuid,
  p_initial_credits integer
) returns table (created boolean, balance_posted integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_existing integer;
begin
  select balance_posted into v_existing
    from public.credit_wallets where user_id = p_user_id;
  if v_existing is not null then
    return query select false, v_existing;
    return;
  end if;

  insert into public.credit_wallets (user_id, balance_posted)
    values (p_user_id, p_initial_credits)
    on conflict (user_id) do nothing;

  insert into public.credit_transactions (user_id, delta, kind)
    values (p_user_id, p_initial_credits, 'grant_signup');

  return query select true, p_initial_credits;
end;
$$;

revoke all on function public.ensure_credit_wallet from public;
grant execute on function public.ensure_credit_wallet to service_role;
