-- 0004_revoke_public_execute.sql — take the cap functions off the public PostgREST API.
--
-- Found by Supabase's security advisor immediately after 0002 landed, and it is a real hole rather
-- than a lint nit. Every function in 0002 is SECURITY DEFINER, because it has to write rows the
-- caller could not write itself. Supabase exposes every function in `public` over PostgREST at
-- /rest/v1/rpc/<name>, and grants EXECUTE to `anon` and `authenticated` by default. SECURITY DEFINER
-- also means RLS does not apply — so "RLS on, no policies" protected the tables and protected
-- nothing here.
--
-- With the project's anon key, which is designed to be public and shipped to browsers, anyone could:
--   * apply_spend_rules(0)        -> clear the $27/$30 caps, removing the spend ceiling entirely
--   * reserve_voice_session(...)  -> burn the whole 720s daily voice budget in three calls
--   * can_send_email('message')   -> exhaust the 20/day e-mail budget and silence the site
--   * settle_voice_session(...)   -> corrupt the accounting the spend rules read
--   * purge_expired()             -> force retention deletes early
--   * close_stale_sessions() / increment_guard_hits(...) -> end live sessions
--
-- The application connects as the service role, which is unaffected by these revokes: it bypasses
-- both RLS and the PostgREST grants. Nothing in the app changes.
--
-- The default-privileges line is the durable half. Without it the next function added to `public`
-- arrives with the same grant and the same hole, and the advisor would have to catch it again.

revoke execute on function public.reserve_voice_session(text, text, text, integer) from anon, authenticated;
revoke execute on function public.settle_voice_session(uuid, integer, numeric)      from anon, authenticated;
revoke execute on function public.can_send_email(text)                              from anon, authenticated;
revoke execute on function public.close_stale_sessions()                            from anon, authenticated;
revoke execute on function public.purge_expired()                                   from anon, authenticated;
revoke execute on function public.apply_spend_rules(numeric)                        from anon, authenticated;
revoke execute on function public.increment_guard_hits(uuid)                        from anon, authenticated;

-- Belt and braces for anything added later.
revoke execute on all functions in schema public from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
