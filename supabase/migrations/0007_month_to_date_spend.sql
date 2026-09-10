-- 0007: sum month-to-date spend in Postgres, not in the client.
--
-- lib/db/budgets.ts selected every spend_events.usd row since the 1st and reduced them in
-- JavaScript. PostgREST caps a response at Supabase's max-rows (1000 by default), so past a
-- thousand spend events in a month the sum silently truncated — it under-reported, and the whole
-- point of the number is to drive apply_spend_rules at $27 and $30. A budget ceiling that quietly
-- stops seeing spend as volume grows is worse than none, because it fails exactly when it matters.
--
-- One spend event is written per LLM call and per voice session, so a thousand a month is an
-- ordinary amount of traffic for this site, not a stress case.
--
-- `stable` rather than `volatile` so the planner can cache it within a statement. security definer
-- because the anon role must never read the spend ledger; the explicit revoke below matches the
-- rule that migration 0005 established and tests/guardrails/05-voice-caps.test.ts enforces.

create or replace function public.month_to_date_spend()
returns numeric
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(sum(usd), 0)::numeric
  from public.spend_events
  where created_at >= timezone('UTC', date_trunc('month', timezone('UTC', now())));
$$;

revoke execute on function public.month_to_date_spend() from public;
