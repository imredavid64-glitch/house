-- House: server-side side effects mirroring PocketBase hooks
-- (messages -> notifications, comments -> comment_count + notifications)
-- plus replica identity so DELETE realtime events carry full rows.

-- ---------------------------------------------------------------------------
-- messages insert -> mention + reply notifications
-- ---------------------------------------------------------------------------
create or replace function public.on_message_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m jsonb;
begin
  if new.mentions is not null then
    for m in select value from jsonb_array_elements(new.mentions) loop
      declare
        mentioned uuid := nullif(m #>> '{}', '')::uuid;
      begin
        if mentioned is not null and mentioned <> new."user" then
          insert into public.notifications ("user", type, title, body, link)
          values (
            mentioned, 'mention', 'You were mentioned',
            'You were mentioned in #' || coalesce(new.channel::text, 'chat') || '.',
            '/#/chat/' || coalesce(new.channel::text, '')
          );
        end if;
      exception when others then
        null;
      end;
    end loop;
  end if;

  if new.parent is not null then
    declare
      parent_user uuid;
    begin
      select "user" into parent_user from public.messages where id = new.parent;
      if parent_user is not null and parent_user <> new."user" then
        insert into public.notifications ("user", type, title, body, link)
        values (
          parent_user, 'reply', 'Someone replied to you',
          'A reply was posted in #' || coalesce(new.channel::text, 'chat') || '.',
          '/#/chat/' || coalesce(new.channel::text, '')
        );
      end if;
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_message_notify on public.messages;
create trigger trg_message_notify
  after insert on public.messages
  for each row execute function public.on_message_created();

-- ---------------------------------------------------------------------------
-- comments insert -> bump post.comment_count + notifications
-- ---------------------------------------------------------------------------
create or replace function public.on_comment_created()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  post_author uuid;
  post_title  text;
  parent_author uuid;
  who text;
begin
  if new.post is not null then
    select "user", title into post_author, post_title from public.posts where id = new.post;
    update public.posts set comment_count = coalesce(comment_count, 0) + 1 where id = new.post;

    if post_author is not null and post_author <> new."user" then
      begin
        select coalesce(nullif(username, ''), nullif(name, ''), 'Someone')
          into who from public.profiles where id = new."user";
      exception when others then
        who := 'Someone';
      end;
      insert into public.notifications ("user", type, title, body, link)
      values (
        post_author, 'forum', 'New comment on your post',
        coalesce(who, 'Someone') || ' commented on "' || left(coalesce(post_title, 'your post'), 80) || '".',
        '/#/forum/post/' || new.post::text
      );
    end if;
  end if;

  if new.parent is not null then
    select "user" into parent_author from public.comments where id = new.parent;
    if parent_author is not null and parent_author <> new."user" then
      insert into public.notifications ("user", type, title, body, link)
      values (
        parent_author, 'reply', 'Someone replied to your comment',
        'You got a reply in the forum.',
        '/#/forum/post/' || coalesce(new.post::text, '')
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_comment_notify on public.comments;
create trigger trg_comment_notify
  after insert on public.comments
  for each row execute function public.on_comment_created();

-- ---------------------------------------------------------------------------
-- replica identity: realtime DELETE events should carry full old rows
-- ---------------------------------------------------------------------------
alter table public.messages      replica identity full;
alter table public.notifications replica identity full;
alter table public.comments      replica identity full;
alter table public.posts         replica identity full;
