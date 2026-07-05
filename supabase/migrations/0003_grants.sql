-- NOT part of the Task 2 brief's literal SQL. Added because tables created via
-- raw SQL migrations (as opposed to the Supabase Dashboard) do not automatically
-- receive GRANT privileges for the anon/authenticated/service_role API roles in
-- this Supabase CLI/Postgres image. Without these grants, every query from the
-- API (including the service_role-authenticated verify-schema.mjs script) fails
-- with "permission denied for table ..." (Postgres error 42501), even though RLS
-- policies are correctly defined. This is standard, documented Supabase
-- guidance (see https://supabase.com/docs/guides/troubleshooting/database-api-42501-errors),
-- not a change to the schema/columns/policies specified in the brief.
grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines in schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines to anon, authenticated, service_role;
