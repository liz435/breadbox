-- ── Billing admin: credit_credits RPC ──────────────────────────────────
--
-- Mirror of `debit_credits` from 0002 but inverted — writes positive
-- deltas. Used for admin grants, refunds, and (future) Stripe purchase
-- credits. Same idempotency + transaction shape so a retry of the same
-- (ref_type, ref_id) doesn't double-credit.
--
-- Auth model: SECURITY DEFINER + restricted search_path; granted to
-- service_role only. The API server's `/api/admin/grant-credits` route
-- checks `ADMIN_GITHUB_LOGINS` before calling this RPC — RPCs are not
-- callable from authenticated user JWTs.

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

  -- Idempotency probe — same (ref_type, ref_id) wins exactly once.
  -- Lets a webhook retry / "redo grant" button stay safe.
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

  -- Ensure a wallet row exists. We don't seed grant_signup here — that
  -- belongs to `ensure_credit_wallet`. A grant against a brand-new user
  -- creates an empty wallet first, then adds the credits.
  insert into public.credit_wallets (user_id, balance_posted)
    values (p_user_id, 0)
    on conflict (user_id) do nothing;

  insert into public.credit_transactions (
    user_id, delta, kind, ref_type, ref_id, metadata, created_by_user_id
  ) values (
    p_user_id, p_credits, p_kind, p_ref_type, p_ref_id, p_metadata, p_created_by_user_id
  );

  -- Alias the table to disambiguate from the RETURNS TABLE column of
  -- the same name (see 0006 + 0004 for full rationale).
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
