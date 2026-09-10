-- 0006: a lead must outlive the session that produced it.
--
-- leads.delete_after is created_at + 180 days: a recruiter's contact details are the actual output
-- of this whole system, and 180 days is the deliberate retention for them. But the row also carried
--
--     session_id uuid not null unique references public.sessions (id) on delete cascade
--
-- and sessions.delete_after is started_at + 30 days. purge_expired() deletes expired sessions on a
-- schedule, so every lead was destroyed at day 30 — 150 days early — and the 180-day column never
-- had any effect. Nothing warned: the delete is a cascade, so the purge counter did not even
-- attribute the rows to leads.
--
-- This was a one-off slip rather than a pattern. Every other table that outlives its session
-- already uses `on delete set null`: spend_events (400 days) and llm_calls both do. leads is the
-- single table that mixed a longer retention with a cascade.
--
-- Making session_id nullable is safe for the unique constraint: Postgres permits any number of
-- NULLs in a unique index, so several orphaned leads can coexist. insertLead() always supplies a
-- session_id, so nothing on the write path changes.

alter table public.leads drop constraint if exists leads_session_id_fkey;

alter table public.leads alter column session_id drop not null;

alter table public.leads
  add constraint leads_session_id_fkey
  foreign key (session_id) references public.sessions (id) on delete set null;
