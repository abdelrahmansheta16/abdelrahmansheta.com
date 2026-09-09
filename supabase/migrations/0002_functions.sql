-- 0002_functions.sql — the cap, settle, email and housekeeping functions.
-- The caps live here, not in application code (docs/PLAN.md 4.9): they are counted from rows and
-- serialised by SELECT ... FOR UPDATE on today's daily_budgets row.

-- ---------------------------------------------------------------------------
-- reserve_voice_session: one transaction. Returns (session_id, reason).
-- reason is null on success, otherwise one of killed | capped_global | capped_visitor.
-- ---------------------------------------------------------------------------
create or replace function public.reserve_voice_session(
  p_ip_hash      text,
  p_visitor_hash text,
  p_locale       text,
  p_reserve      integer default 240
)
returns table (session_id uuid, reason text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day      date := (now() at time zone 'utc')::date;
  v_budget   public.daily_budgets%rowtype;
  v_settings public.settings%rowtype;
  v_cap      integer;
  v_today    integer;
  v_new_id   uuid;
begin
  insert into public.daily_budgets (day) values (v_day) on conflict (day) do nothing;
  select * into v_budget from public.daily_budgets where day = v_day for update;
  select * into v_settings from public.settings where id = 1;

  if coalesce(v_settings.kill_switch, false)
     or coalesce(v_settings.voice_off_until, '-infinity'::timestamptz) > now() then
    return query select null::uuid, 'killed'::text;
    return;
  end if;

  v_cap := coalesce(v_settings.voice_seconds_cap_override, v_budget.voice_seconds_cap);
  if v_budget.voice_seconds_reserved + p_reserve > v_cap then
    return query select null::uuid, 'capped_global'::text;
    return;
  end if;

  select count(*) into v_today
  from public.sessions s
  where s.channel = 'voice'
    and (s.started_at at time zone 'utc')::date = v_day
    and (s.ip_hash = p_ip_hash
         or (p_visitor_hash is not null and s.visitor_hash = p_visitor_hash));

  if v_today >= 2 then
    return query select null::uuid, 'capped_visitor'::text;
    return;
  end if;

  insert into public.sessions
    (channel, ip_hash, visitor_hash, locale_initial, provider, reserved_seconds, consent_at)
  values
    ('voice', p_ip_hash, p_visitor_hash, coalesce(nullif(p_locale, ''), 'en'), 'elevenlabs', p_reserve, now())
  returning id into v_new_id;

  update public.daily_budgets
     set voice_seconds_reserved = voice_seconds_reserved + p_reserve
   where day = v_day;

  return query select v_new_id, null::text;
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_voice_session: idempotent. Returns the number of seconds handed back.
-- ---------------------------------------------------------------------------
create or replace function public.settle_voice_session(
  p_session_id uuid,
  p_duration   integer,
  p_cost       numeric
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer;
  v_day      date;
  v_unused   integer;
begin
  update public.sessions
     set ended_at     = coalesce(ended_at, now()),
         duration_secs = greatest(0, coalesce(p_duration, 0)),
         cost_usd      = coalesce(p_cost, 0),
         ended_reason  = coalesce(ended_reason, 'settled')
   where id = p_session_id
     and duration_secs is null
  returning reserved_seconds, (started_at at time zone 'utc')::date
       into v_reserved, v_day;

  if v_reserved is null then
    return 0;  -- unknown session, or already settled
  end if;

  v_unused := greatest(0, v_reserved - greatest(0, coalesce(p_duration, 0)));

  insert into public.daily_budgets (day) values (v_day) on conflict (day) do nothing;
  update public.daily_budgets
     set voice_seconds_used     = voice_seconds_used + greatest(0, coalesce(p_duration, 0)),
         voice_seconds_reserved = greatest(0, voice_seconds_reserved - v_unused)
   where day = v_day;

  return v_unused;
end;
$$;

-- ---------------------------------------------------------------------------
-- can_send_email: consumes one unit of today's email budget. False = do not send.
-- ---------------------------------------------------------------------------
create or replace function public.can_send_email(p_kind text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day      date := (now() at time zone 'utc')::date;
  v_budget   public.daily_budgets%rowtype;
  v_settings public.settings%rowtype;
begin
  if p_kind is null or p_kind not in ('message', 'lead', 'summary', 'digest', 'alert') then
    return false;
  end if;

  insert into public.daily_budgets (day) values (v_day) on conflict (day) do nothing;
  select * into v_budget from public.daily_budgets where day = v_day for update;
  select * into v_settings from public.settings where id = 1;

  if coalesce(v_settings.kill_switch, false) then
    return false;
  end if;
  if v_budget.emails_sent >= v_budget.emails_cap then
    return false;
  end if;

  update public.daily_budgets set emails_sent = emails_sent + 1 where day = v_day;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- close_stale_sessions: a voice session with no webhook after 6 minutes is dead.
-- Its unused reservation goes back to the day budget. Returns the row count.
-- ---------------------------------------------------------------------------
create or replace function public.close_stale_sessions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r       record;
  v_count integer := 0;
begin
  for r in
    select id, reserved_seconds, (started_at at time zone 'utc')::date as day
    from public.sessions
    where channel = 'voice'
      and ended_at is null
      and started_at < now() - interval '6 minutes'
    for update skip locked
  loop
    update public.sessions
       set ended_at = now(), ended_reason = 'stale', duration_secs = coalesce(duration_secs, 0)
     where id = r.id;

    insert into public.daily_budgets (day) values (r.day) on conflict (day) do nothing;
    update public.daily_budgets
       set voice_seconds_reserved = greatest(0, voice_seconds_reserved - r.reserved_seconds)
     where day = r.day;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- purge_expired: retention. Returns the total number of rows deleted.
-- ---------------------------------------------------------------------------
create or replace function public.purge_expired()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_n     integer;
begin
  delete from public.transcript_turns where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.guard_events where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.llm_calls where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.messages_in where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.summaries_out where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.leads where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.probe_events where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.rate_events where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  delete from public.sessions where delete_after < now();
  get diagnostics v_n = row_count; v_total := v_total + v_n;

  return v_total;
end;
$$;

-- ---------------------------------------------------------------------------
-- apply_spend_rules: the "under $30 a month" property, enforced in SQL.
--   >= 30  -> voice off until the end of the month
--   >= 27  -> daily voice cap drops to 540 s (9 minutes)
--   else   -> clear both overrides (this also resets on the 1st of a month)
-- ---------------------------------------------------------------------------
create or replace function public.apply_spend_rules(p_month_to_date numeric)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mtd numeric := coalesce(p_month_to_date, 0);
begin
  if v_mtd >= 30 then
    update public.settings
       set voice_off_until            = date_trunc('month', now()) + interval '1 month',
           voice_seconds_cap_override = 540,
           updated_at                 = now()
     where id = 1;
    return 'voice_off';
  elsif v_mtd >= 27 then
    update public.settings
       set voice_seconds_cap_override = 540,
           updated_at                 = now()
     where id = 1;
    return 'capped_540';
  else
    update public.settings
       set voice_seconds_cap_override = null,
           voice_off_until            = null,
           updated_at                 = now()
     where id = 1;
    return 'normal';
  end if;
end;
$$;
