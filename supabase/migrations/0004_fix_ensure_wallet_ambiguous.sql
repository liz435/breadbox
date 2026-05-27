-- ── Fix ambiguous column reference in ensure_credit_wallet ─────────────
--
-- The 0002 version of this function declared `RETURNS TABLE (created
-- boolean, balance_posted integer)` and then referenced `balance_posted`
-- in an unqualified SELECT. Postgres couldn't disambiguate the
-- return-table column from `credit_wallets.balance_posted`, raising:
--
--   column reference "balance_posted" is ambiguous
--
-- at every call (including the very first authed request from any
-- hosted user → 500 on /api/billing/wallet and /api/chat).
--
-- The PL/pgSQL planner only catches this at execution time, not at
-- CREATE FUNCTION time, so the migration applied cleanly but every
-- runtime call failed. Re-create the function with the table aliased
-- as `cw` so the column reference is unambiguous (matches the pattern
-- in `debit_credits` and `credit_credits`).

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
  select cw.balance_posted into v_existing
    from public.credit_wallets cw where cw.user_id = p_user_id;
  if v_existing is not null then
    return query select false, v_existing;
    return;
  end if;

  begin
    insert into public.credit_wallets (user_id, balance_posted)
      values (p_user_id, p_initial_credits)
      on conflict (user_id) do nothing;

    insert into public.credit_transactions (user_id, delta, kind)
      values (p_user_id, p_initial_credits, 'grant_signup');

    return query select true, p_initial_credits;
  exception
    -- Lost the race against a concurrent first-call. The other writer
    -- already posted the grant_signup row + seeded the wallet. Treat
    -- this as a "wallet existed" path and return the current balance.
    when unique_violation then
      select cw.balance_posted into v_existing
        from public.credit_wallets cw where cw.user_id = p_user_id;
      return query select false, coalesce(v_existing, p_initial_credits);
  end;
end;
$$;

revoke all on function public.ensure_credit_wallet from public;
grant execute on function public.ensure_credit_wallet to service_role;
