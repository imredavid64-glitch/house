-- House: Supabase schema (Supabase Auth + Postgres)
-- Mirrors the PocketBase collections 1:1 + Auth integration.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (was users collection; tied to Supabase Auth)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  name        text default '',
  email       text default '',
  role        text default 'member',
  karma       integer default 0,
  bio         text default '',
  smash_main  text default '',
  roblox_id   numeric default 0,
  last_active timestamptz default now(),
  avatar      text default '',
  created     timestamptz default now()
);

create unique index if not exists profiles_username_idx on public.profiles (lower(username));
create unique index if not exists profiles_email_idx    on public.profiles (lower(email));

-- auto-create a profile when a Supabase Auth user is created
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'name', ''),
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'role', 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- invite_keys
-- ---------------------------------------------------------------------------
create table if not exists public.invite_keys (
  id          uuid primary key default gen_random_uuid(),
  key_code    text not null unique,
  created_by  uuid references public.profiles(id) on delete set null,
  is_used     boolean default false,
  used_by     uuid references public.profiles(id) on delete set null,
  used_at     timestamptz,
  expires_at  timestamptz,
  created     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- channels / messages (chat)
-- ---------------------------------------------------------------------------
create table if not exists public.channels (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  icon    text default '💬',
  created timestamptz default now()
);

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  channel     uuid references public.channels(id) on delete cascade,
  "user"      uuid references public.profiles(id) on delete cascade,
  content     text default '',
  parent      uuid references public.messages(id) on delete set null,
  mentions    jsonb default '[]',
  attachments jsonb default '[]',
  reactions   jsonb default '{}',
  is_edited   boolean default false,
  created     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- spaces / posts / comments (forum)
-- ---------------------------------------------------------------------------
create table if not exists public.spaces (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique,
  icon    text default '🗂️',
  flairs  jsonb default '[]',
  created timestamptz default now()
);

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  space         uuid references public.spaces(id) on delete cascade,
  "user"        uuid references public.profiles(id) on delete cascade,
  title         text not null,
  type          text default 'text',
  content       text default '',
  url           text default '',
  flair         text default '',
  media         jsonb default '[]',
  upvotes       integer default 0,
  downvotes     integer default 0,
  comment_count integer default 0,
  created       timestamptz default now()
);

create table if not exists public.comments (
  id        uuid primary key default gen_random_uuid(),
  post      uuid references public.posts(id) on delete cascade,
  "user"    uuid references public.profiles(id) on delete cascade,
  content   text not null,
  parent    uuid references public.comments(id) on delete set null,
  upvotes   integer default 0,
  downvotes integer default 0,
  created   timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- votes (generic post/comment voting)
-- ---------------------------------------------------------------------------
create table if not exists public.votes (
  id        uuid primary key default gen_random_uuid(),
  "user"    uuid references public.profiles(id) on delete cascade,
  category  text default '',
  post_id   uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  value     integer not null default 0,
  created   timestamptz default now()
);

create index if not exists votes_lookup_idx on public.votes ("user", category, post_id, comment_id);

-- ---------------------------------------------------------------------------
-- polls (bound to a post)
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
  id      uuid primary key default gen_random_uuid(),
  post    uuid references public.posts(id) on delete cascade,
  options jsonb default '[]',
  voters  jsonb default '[]',
  ends_at timestamptz,
  created timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id      uuid primary key default gen_random_uuid(),
  "user"  uuid references public.profiles(id) on delete cascade,
  type    text default 'generic',
  title   text default '',
  body    text default '',
  link    text default '',
  is_read boolean default false,
  created timestamptz default now()
);

create index if not exists notifications_user_idx on public.notifications ("user", created desc);

-- ---------------------------------------------------------------------------
-- storage tracking
-- ---------------------------------------------------------------------------
create table if not exists public.storage_files (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid references public.profiles(id) on delete set null,
  source        text default 'other',
  record_id     text default '',
  field         text default '',
  original_name text default '',
  stored_name   text default '',
  mime_type     text default '',
  original_size bigint default 0,
  stored_size   bigint default 0,
  algorithm     text default 'none',
  category      text default 'other',
  created       timestamptz default now()
);

create index if not exists storage_files_record_idx on public.storage_files (record_id);
create index if not exists storage_files_source_idx on public.storage_files (source, created);

-- ---------------------------------------------------------------------------
-- app_settings (key/value)
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key     text primary key,
  value   jsonb,
  created timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- deletion proposals & votes & log
-- ---------------------------------------------------------------------------
create table if not exists public.deletion_proposals (
  id                    uuid primary key default gen_random_uuid(),
  title                 text not null,
  description           text default '',
  proposed_by           uuid references public.profiles(id) on delete set null,
  type                  text default '',
  criteria              jsonb default '{}',
  estimated_freed_space bigint default 0,
  status                text default 'voting',
  votes_yes             integer default 0,
  votes_no              integer default 0,
  voting_ends_at        timestamptz,
  executed_at           timestamptz,
  executed_by           uuid references public.profiles(id) on delete set null,
  freed_space           bigint default 0,
  created               timestamptz default now()
);

create table if not exists public.deletion_votes (
  id       uuid primary key default gen_random_uuid(),
  proposal uuid references public.deletion_proposals(id) on delete cascade,
  "user"   uuid references public.profiles(id) on delete cascade,
  choice   integer default 0,
  created  timestamptz default now(),
  unique (proposal, "user")
);

create table if not exists public.deletion_log (
  id          uuid primary key default gen_random_uuid(),
  proposal    uuid references public.deletion_proposals(id) on delete cascade,
  action      text default '',
  target_id   text default '',
  target_type text default '',
  size_freed  bigint default 0,
  executed_by uuid references public.profiles(id) on delete set null,
  created     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- smash matches
-- ---------------------------------------------------------------------------
create table if not exists public.smash_matches (
  id          uuid primary key default gen_random_uuid(),
  player1     uuid references public.profiles(id) on delete set null,
  player2     uuid references public.profiles(id) on delete set null,
  winner      uuid references public.profiles(id) on delete set null,
  character1  text default '',
  character2  text default '',
  stage       text default '',
  is_ranked   boolean default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created     timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- mc status cache & roblox games
-- ---------------------------------------------------------------------------
create table if not exists public.mc_status (
  server_name    text primary key,
  host           text default '',
  status         text default 'unknown',
  player_count   integer default 0,
  max_players    integer default 0,
  version        text default '',
  motd           text default '',
  players        jsonb default '[]',
  last_checked_at timestamptz default now()
);

create table if not exists public.roblox_games (
  universe_id      bigint primary key,
  name             text default '',
  description      text default '',
  thumbnail_url    text default '',
  playing_count    integer default 0,
  creator          text default '',
  last_updated_at  timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- news
-- ---------------------------------------------------------------------------
create table if not exists public.news_items (
  id             uuid primary key default gen_random_uuid(),
  category       text default 'tech',
  title          text default '',
  summary        text default '',
  url            text default '',
  thumbnail_url  text default '',
  source_name    text default '',
  metadata       jsonb default '{}',
  published_at   timestamptz,
  fetched_at     timestamptz default now(),
  expires_at     timestamptz,
  created        timestamptz default now()
);

create index if not exists news_items_cat_idx on public.news_items (category, created desc);

-- ---------------------------------------------------------------------------
-- helpers / RLS
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns text
language sql stable security definer set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), '')
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.current_role() = 'admin'
$$;

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.invite_keys         enable row level security;
alter table public.channels            enable row level security;
alter table public.messages            enable row level security;
alter table public.spaces              enable row level security;
alter table public.posts               enable row level security;
alter table public.comments            enable row level security;
alter table public.votes               enable row level security;
alter table public.polls               enable row level security;
alter table public.notifications       enable row level security;
alter table public.storage_files       enable row level security;
alter table public.app_settings        enable row level security;
alter table public.deletion_proposals  enable row level security;
alter table public.deletion_votes      enable row level security;
alter table public.deletion_log        enable row level security;
alter table public.smash_matches       enable row level security;
alter table public.mc_status           enable row level security;
alter table public.roblox_games        enable row level security;
alter table public.news_items          enable row level security;

drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
create policy profiles_select on public.profiles for select using (auth.role() = 'authenticated');
create policy profiles_update on public.profiles for update using (auth.uid() = id);

-- read-mostly collections
drop policy if exists ch_select on public.channels;
drop policy if exists spaces_select on public.spaces;
drop policy if exists posts_select on public.posts;
drop policy if exists comments_select on public.comments;
drop policy if exists smash_select on public.smash_matches;
drop policy if exists mc_select on public.mc_status;
drop policy if exists roblox_select on public.roblox_games;
drop policy if exists news_select on public.news_items;
drop policy if exists votes_select on public.votes;
drop policy if exists polls_select on public.polls;
drop policy if exists notif_select on public.notifications;
drop policy if exists sf_select on public.storage_files;
drop policy if exists dp_select on public.deletion_proposals;
drop policy if exists dv_select on public.deletion_votes;
drop policy if exists dlog_select on public.deletion_log;
drop policy if exists ik_select on public.invite_keys;
drop policy if exists as_select on public.app_settings;

create policy ch_select on public.channels for select using (auth.role() = 'authenticated');
create policy spaces_select on public.spaces for select using (auth.role() = 'authenticated');
create policy posts_select on public.posts for select using (auth.role() = 'authenticated');
create policy comments_select on public.comments for select using (auth.role() = 'authenticated');
create policy smash_select on public.smash_matches for select using (auth.role() = 'authenticated');
create policy mc_select on public.mc_status for select using (auth.role() = 'authenticated');
create policy roblox_select on public.roblox_games for select using (auth.role() = 'authenticated');
create policy news_select on public.news_items for select using (auth.role() = 'authenticated');
create policy votes_select on public.votes for select using (auth.role() = 'authenticated');
create policy polls_select on public.polls for select using (auth.role() = 'authenticated');
create policy notif_select on public.notifications for select using (auth.uid() = "user");
create policy sf_select on public.storage_files for select using (auth.role() = 'authenticated');
create policy dp_select on public.deletion_proposals for select using (auth.role() = 'authenticated');
create policy dv_select on public.deletion_votes for select using (auth.role() = 'authenticated');
create policy dlog_select on public.deletion_log for select using (auth.role() = 'authenticated');
create policy ik_select on public.invite_keys for select using (public.is_admin());
create policy as_select on public.app_settings for select using (auth.role() = 'authenticated');

-- messages
drop policy if exists msg_insert on public.messages;
drop policy if exists msg_select on public.messages;
drop policy if exists msg_update on public.messages;
drop policy if exists msg_delete on public.messages;
create policy msg_insert on public.messages for insert with check (auth.role() = 'authenticated');
create policy msg_select on public.messages for select using (auth.role() = 'authenticated');
create policy msg_update on public.messages for update using (auth.uid() = "user");
create policy msg_delete on public.messages for delete using (auth.uid() = "user");

-- comments
drop policy if exists comments_insert on public.comments;
drop policy if exists comments_update on public.comments;
drop policy if exists comments_delete on public.comments;
create policy comments_insert on public.comments for insert with check (auth.role() = 'authenticated');
create policy comments_update on public.comments for update using (auth.uid() = "user");
create policy comments_delete on public.comments for delete using (auth.uid() = "user");

-- posts
drop policy if exists posts_insert on public.posts;
drop policy if exists posts_update on public.posts;
drop policy if exists posts_delete on public.posts;
create policy posts_insert on public.posts for insert with check (auth.role() = 'authenticated');
create policy posts_update on public.posts for update using (auth.uid() = "user");
create policy posts_delete on public.posts for delete using (auth.uid() = "user");

-- notifications: mark read
drop policy if exists notif_update on public.notifications;
create policy notif_update on public.notifications for update using (auth.uid() = "user");

-- ---------------------------------------------------------------------------
-- realtime (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['messages','notifications','channels','profiles','posts','comments'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- storage bucket (public read; authenticated upload)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('house', 'house', true, 52428800)
on conflict (id) do update set public = true;

drop policy if exists house_read on storage.objects;
create policy house_read on storage.objects for select using (bucket_id = 'house');

drop policy if exists house_write on storage.objects;
create policy house_write on storage.objects for insert to authenticated with check (bucket_id = 'house');

drop policy if exists house_update on storage.objects;
create policy house_update on storage.objects for update to authenticated using (bucket_id = 'house');

drop policy if exists house_delete on storage.objects;
create policy house_delete on storage.objects for delete to authenticated using (bucket_id = 'house');

-- ---------------------------------------------------------------------------
-- seed: default channels + spaces + admin settings
-- ---------------------------------------------------------------------------
insert into public.channels (name, icon) values
  ('general', '💬'),
  ('gaming', '🎮'),
  ('anime', '🗼'),
  ('robotics', '🤖'),
  ('smash', '🦔'),
  ('music', '🎧'),
  ('movies', '🎬'),
  ('random', '🎲'),
  ('off-topic', '🗨️')
on conflict (name) do nothing;

insert into public.spaces (name, icon) values
  ('General', '🗂️'),
  ('Gaming', '🎮'),
  ('Anime', '🗼'),
  ('Roblox', '🧱'),
  ('Smash', '🦔'),
  ('Music', '🎧'),
  ('Tech', '🖥️'),
  ('Random', '🎲')
on conflict (name) do nothing;

insert into public.app_settings (key, value) values
  ('storage_limit_bytes', '10737418240'),
  ('vote_window_hours', '72'),
  ('vote_approval_pct', '60'),
  ('vote_min_voters', '3'),
  ('auto_propose_at_bytes', '8589934592'),
  ('news_ttl_minutes', '30'),
  ('mc_server_host', '""'),
  ('roblox_watchlist', '[]')
on conflict (key) do nothing;
