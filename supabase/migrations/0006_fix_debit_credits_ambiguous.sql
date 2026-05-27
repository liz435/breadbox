-- ── Fix ambiguous column reference in debit_credits + credit_credits ───
--
-- Same PL/pgSQL bug as 0004 fixed for `ensure_credit_wallet`: both
-- `debit_credits` (0002) and `credit_credits` (0003) declare
-- `RETURNS TABLE (… balance_posted integer)` and then reference
-- `balance_posted` unqualified inside an UPDATE … SET. Postgres can't
-- disambiguate the return-table column from `credit_wallets.balance_posted`
-- and raises:
--
--   column reference "balance_posted" is ambiguous
--
-- at every call. PL/pgSQL validates lazily so CREATE FUNCTION succeeded
-- and the test suite (gated on local Supabase) didn't catch it. Effect
-- in prod: `/api/chat` calls `debitForLlmRun` post-stream → RPC errors
-- → caught by .catch in chat.ts → logged as `warn` → no ledger row
-- written → wallet never decrements. User sees 300 credits forever.
--
-- The fix is the same alias pattern 0004 already established for
-- `ensure_credit_wallet`: alias the table as `cw` and qualify both the
-- SET right-hand-side and the RETURNING target.

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

  update public.credit_wallets cw
     set balance_posted = cw.balance_posted - p_credits,
         updated_at = now()
   where cw.user_id = p_user_id
   returning cw.balance_posted into v_balance;

  return query select true, coalesce(v_balance, 0);
end;
$$;

revoke all on function public.debit_credits from public;
grant execute on function public.debit_credits to service_role;

create or replace function public.credit_credits(
  p_user_id uuid,
  p_credits integer,
  p_kind text,
  p_ref_type text,
  p_ref_id text,
  p_metadata jsonb,
  p_created_by_user_id uuid
) returns table (credited boolean, balance_posted integer)
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

  insert into public.credit_wallets (user_id, balance_posted)
    values (p_user_id, 0)
    on conflict (user_id) do nothing;

  insert into public.credit_transactions (
    user_id, delta, kind, ref_type, ref_id, metadata, created_by_user_id
  ) values (
    p_user_id, p_credits, p_kind, p_ref_type, p_ref_id, p_metadata, p_created_by_user_id
  );

  update public.credit_wallets cw
     set balance_posted = cw.balance_posted + p_credits,
         updated_at = now()
   where cw.user_id = p_user_id
   returning cw.balance_posted into v_balance;

  return query select true, coalesce(v_balance, 0);
end;
$$;

revoke all on function public.credit_credits from public;
grant execute on function public.credit_credits to service_role;
