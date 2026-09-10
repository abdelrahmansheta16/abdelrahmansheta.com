-- 0005_revoke_execute_from_public.sql — actually close what 0004 only appeared to close.
--
-- 0004 revoked EXECUTE from `anon` and `authenticated` and changed nothing, which an external probe
-- caught: an anonymous PostgREST call to reserve_voice_session still succeeded and burned 240
-- seconds of the daily voice budget.
--
-- The reason is in the ACL. Postgres grants EXECUTE on every new function to PUBLIC, and the entry
-- reads `=X/postgres` — an empty grantee means PUBLIC. `anon` never held a grant of its own; it
-- inherited PUBLIC's. Revoking from a role that was never granted anything is a successful no-op,
-- which is why the migration reported success while the hole stayed open.
--
-- REVOKE ... FROM PUBLIC is the line that does the work. The service_role grant is explicit
-- (`service_role=X/postgres`) and survives, so the application is unaffected.
--
-- The lesson worth keeping: "the migration applied" and "the privilege changed" are different
-- claims, and only a call from outside distinguishes them.

revoke execute on function public.reserve_voice_session(text, text, text, integer) from public;
revoke execute on function public.settle_voice_session(uuid, integer, numeric)      from public;
revoke execute on function public.can_send_email(text)                              from public;
revoke execute on function public.close_stale_sessions()                            from public;
revoke execute on function public.purge_expired()                                   from public;
revoke execute on function public.apply_spend_rules(numeric)                        from public;
revoke execute on function public.increment_guard_hits(uuid)                        from public;

revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;
