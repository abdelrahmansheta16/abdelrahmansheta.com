-- 0003_cron.sql — pg_cron schedules, but only where pg_cron actually exists.
-- Supabase Free has the extension available but not always enabled, and a local
-- `docker run postgres:17` never has it. Every block is a no-op without it, so the
-- same migration file applies cleanly everywhere. Vercel Cron (/api/cron/daily) is
-- the primary schedule; these are the belt to its braces.

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule('portfolio-close-stale', '*/10 * * * *',
                           $job$select public.close_stale_sessions();$job$)
    $cron$;
  end if;
exception when others then
  raise notice 'pg_cron close-stale schedule skipped: %', sqlerrm;
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule('portfolio-purge', '0 3 * * *',
                           $job$select public.purge_expired();$job$)
    $cron$;
  end if;
exception when others then
  raise notice 'pg_cron purge schedule skipped: %', sqlerrm;
end;
$$;

-- Supabase Free pauses a project after 7 idle days. One tiny write every 6 hours
-- keeps it awake even if Vercel Cron is down.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute $cron$
      select cron.schedule('portfolio-keepalive', '0 */6 * * *',
                           $job$update public.settings set updated_at = now() where id = 1;$job$)
    $cron$;
  end if;
exception when others then
  raise notice 'pg_cron keep-alive schedule skipped: %', sqlerrm;
end;
$$;
