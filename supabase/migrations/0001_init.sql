-- 0001_init.sql — base schema for the portfolio voice/text agent (docs/PLAN.md 4.6).
-- Append-only: never edit an applied migration, add a new numbered one.
-- Every table has RLS enabled and NO policies: only the service role (which bypasses RLS) may read.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id                          uuid primary key default gen_random_uuid(),
  channel                     text not null check (channel in ('voice', 'text')),
  started_at                  timestamptz not null default now(),
  ended_at                    timestamptz,
  ip_hash                     text not null,
  visitor_hash                text,
  country                     text,
  ua_class                    text,
  mic_outcome                 text,
  locale_initial              text not null default 'en' check (locale_initial in ('en', 'ar')),
  locale_final                text check (locale_final in ('en', 'ar')),
  provider                    text,
  elevenlabs_conversation_id  text unique,
  corpus_version              text,
  llm_provider                text,
  reserved_seconds            integer not null default 0,
  duration_secs               integer,
  cost_usd                    numeric(10, 4) not null default 0,
  ended_reason                text,
  consent_at                  timestamptz not null default now(),
  lead_captured               boolean not null default false,
  summary_sent                boolean not null default false,
  message_left                boolean not null default false,
  guard_hits                  integer not null default 0,
  flags                       jsonb not null default '{}'::jsonb,
  delete_after                timestamptz generated always as (started_at + interval '30 days') stored
);

create index if not exists sessions_ip_hash_started_at_idx      on public.sessions (ip_hash, started_at);
create index if not exists sessions_visitor_hash_started_at_idx on public.sessions (visitor_hash, started_at);
create index if not exists sessions_delete_after_idx            on public.sessions (delete_after);

-- ---------------------------------------------------------------------------
-- transcript_turns (pseudonymised, 30 days)
-- ---------------------------------------------------------------------------
create table if not exists public.transcript_turns (
  id           bigint generated always as identity primary key,
  session_id   uuid not null references public.sessions (id) on delete cascade,
  idx          integer not null,
  role         text not null check (role in ('user', 'agent', 'system', 'tool')),
  lang         text,
  content      text,
  tool_name    text,
  tool_args    jsonb,
  interrupted  boolean not null default false,
  ttft_ms      integer,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '30 days') stored,
  unique (session_id, idx)
);

create index if not exists transcript_turns_delete_after_idx on public.transcript_turns (delete_after);

-- ---------------------------------------------------------------------------
-- llm_calls
-- ---------------------------------------------------------------------------
create table if not exists public.llm_calls (
  id                bigint generated always as identity primary key,
  session_id        uuid references public.sessions (id) on delete set null,
  provider          text not null,
  model             text not null,
  channel           text check (channel in ('voice', 'text')),
  ttft_ms           integer,
  cache_hit_tokens  integer not null default 0,
  cache_miss_tokens integer not null default 0,
  output_tokens     integer not null default 0,
  failover          boolean not null default false,
  finish_reason     text,
  usd               numeric(10, 6) not null default 0,
  corpus_version    text,
  created_at        timestamptz not null default now(),
  delete_after      timestamptz generated always as (created_at + interval '30 days') stored
);

create index if not exists llm_calls_delete_after_idx on public.llm_calls (delete_after);

-- ---------------------------------------------------------------------------
-- guard_events (never store the blocked text, only its digest)
-- ---------------------------------------------------------------------------
create table if not exists public.guard_events (
  id             bigint generated always as identity primary key,
  session_id     uuid references public.sessions (id) on delete cascade,
  rule           text not null,
  blocked_sha256 text,
  channel        text check (channel in ('voice', 'text')),
  created_at     timestamptz not null default now(),
  delete_after   timestamptz generated always as (created_at + interval '30 days') stored
);

create index if not exists guard_events_delete_after_idx on public.guard_events (delete_after);

-- ---------------------------------------------------------------------------
-- spend_events (written BEFORE the external call, settled after)
-- ---------------------------------------------------------------------------
create table if not exists public.spend_events (
  id              bigint generated always as identity primary key,
  session_id      uuid references public.sessions (id) on delete set null,
  vendor          text not null,
  kind            text not null,
  units           numeric(12, 4) not null default 0,
  usd             numeric(10, 6) not null default 0,
  idempotency_key text unique,
  settled_at      timestamptz,
  created_at      timestamptz not null default now(),
  delete_after    timestamptz generated always as (created_at + interval '400 days') stored
);

create index if not exists spend_events_created_at_idx   on public.spend_events (created_at);
create index if not exists spend_events_delete_after_idx on public.spend_events (delete_after);

-- ---------------------------------------------------------------------------
-- daily_budgets / settings
-- ---------------------------------------------------------------------------
create table if not exists public.daily_budgets (
  day                     date primary key,
  voice_seconds_reserved  integer not null default 0,
  voice_seconds_used      integer not null default 0,
  voice_seconds_cap       integer not null default 720,
  text_messages           integer not null default 0,
  llm_usd                 numeric(10, 6) not null default 0,
  llm_usd_cap             numeric(10, 6) not null default 1.00,
  emails_sent             integer not null default 0,
  emails_cap              integer not null default 20
);

create table if not exists public.settings (
  id                        integer primary key default 1 check (id = 1),
  kill_switch               boolean not null default false,
  voice_seconds_cap_override integer,
  voice_off_until           timestamptz,
  updated_at                timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- visitor-facing side effects — one per session, by construction
-- ---------------------------------------------------------------------------
create table if not exists public.leads (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null unique references public.sessions (id) on delete cascade,
  name         text not null,
  company      text,
  email        text not null,
  note         text,
  consent_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '180 days') stored
);

create index if not exists leads_delete_after_idx on public.leads (delete_after);

create table if not exists public.messages_in (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null unique references public.sessions (id) on delete cascade,
  name         text not null,
  email        text not null,
  body         text not null,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '30 days') stored
);

create index if not exists messages_in_delete_after_idx on public.messages_in (delete_after);

-- summaries_out stores sha256(email) only; the address itself is never persisted.
create table if not exists public.summaries_out (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null unique references public.sessions (id) on delete cascade,
  email_sha256 text not null,
  consent_at   timestamptz not null,
  sent_at      timestamptz,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '30 days') stored
);

create index if not exists summaries_out_delete_after_idx on public.summaries_out (delete_after);

-- ---------------------------------------------------------------------------
-- telemetry / bookkeeping
-- ---------------------------------------------------------------------------
create table if not exists public.probe_events (
  id           bigint generated always as identity primary key,
  ua_class     text not null,
  os_version   text,
  outcome      text not null,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '90 days') stored
);

create index if not exists probe_events_delete_after_idx on public.probe_events (delete_after);

-- Generic per-ip_hash rate counter (text messages, CV downloads). Cheap to purge.
create table if not exists public.rate_events (
  id           bigint generated always as identity primary key,
  kind         text not null,
  ip_hash      text not null,
  created_at   timestamptz not null default now(),
  delete_after timestamptz generated always as (created_at + interval '2 days') stored
);

create index if not exists rate_events_kind_ip_hash_created_at_idx on public.rate_events (kind, ip_hash, created_at);
create index if not exists rate_events_delete_after_idx            on public.rate_events (delete_after);

create table if not exists public.corpus_versions (
  version        text primary key,
  built_at       timestamptz not null,
  token_estimate integer not null default 0,
  notes          text,
  created_at     timestamptz not null default now()
);

create table if not exists public.eval_runs (
  id         bigint generated always as identity primary key,
  suite      text not null,
  git_ref    text,
  provider   text,
  passed     integer not null default 0,
  total      integer not null default 0,
  score      numeric(6, 4),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: on everywhere, no policies anywhere. Only the service role gets through.
-- ---------------------------------------------------------------------------
alter table public.sessions         enable row level security;
alter table public.transcript_turns enable row level security;
alter table public.llm_calls        enable row level security;
alter table public.guard_events     enable row level security;
alter table public.spend_events     enable row level security;
alter table public.daily_budgets    enable row level security;
alter table public.settings         enable row level security;
alter table public.leads            enable row level security;
alter table public.messages_in      enable row level security;
alter table public.summaries_out    enable row level security;
alter table public.probe_events     enable row level security;
alter table public.rate_events      enable row level security;
alter table public.corpus_versions  enable row level security;
alter table public.eval_runs        enable row level security;
