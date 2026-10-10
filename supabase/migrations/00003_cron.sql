-- House: background jobs via pg_cron + pg_net.
-- Calls the `house` Edge Function's guarded /cron/* routes. The shared secret
-- and function base URL live in a private schema that is revoked from the API
-- roles, so the secret is never stored inside cron.job definitions.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;

create table if not exists private.config (
  key   text primary key,
  value text not null
);

-- Values (functions_url, cron_secret) are inserted by the deploy step, e.g.
--   insert into private.config(key,value) values
--     ('functions_url','https://<ref>.supabase.co/functions/v1/house'),
--     ('cron_secret','<random>')
--   on conflict (key) do update set value = excluded.value;

create or replace function private.run_cron(job text)
returns void
language plpgsql
security definer set search_path = private, extensions, public
as $$
declare
  base_url text;
  secret   text;
begin
  select value into base_url from private.config where key = 'functions_url';
  select value into secret   from private.config where key = 'cron_secret';
  if base_url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url     := base_url || '/api/house/cron/' || job,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body    := '{}'::jsonb
  );
end;
$$;

-- refresh news every 20 minutes
select cron.schedule('house-news', '*/20 * * * *', $$select private.run_cron('news')$$);
-- settle/execute expired deletion votes hourly
select cron.schedule('house-deletions', '0 * * * *', $$select private.run_cron('deletions')$$);
-- storage auto-propose check every 6 hours
select cron.schedule('house-storage', '15 */6 * * *', $$select private.run_cron('storage')$$);
