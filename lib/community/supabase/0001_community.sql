-- 鲸梦社区 · Supabase 初始化迁移（V1）
--
-- 使用方式
--   1. 在 Supabase 项目的 SQL Editor 中按顺序执行本文件。
--   2. 客户端只使用 anon / publishable key，绝不把 service_role 打包进插件。
--   3. 首次注册通过邀请码：用户完成邮箱验证后调用 RPC
--      public.community_redeem_invite(code, nickname)。
--   4. 首位管理员创建资料后，在 SQL Editor 执行：
--      update public.community_profiles set role = 'super_admin'
--      where auth_user_id = '<首位管理员的 auth.users.id>';
--   5. 邀请码只保存 SHA-256 哈希。可在 SQL Editor 直接插入：
--      insert into public.community_invites (code_hash, label, max_uses, expires_at)
--      values (encode(digest('WHALE-V1', 'sha256'), 'hex'), 'V1 内测', 100,
--              now() + interval '30 days');
--      管理员登录后也可调用 public.community_create_invite(...)。
--
-- 设计边界
--   - RLS 负责行级可见性，业务规则（频率、封禁、审核）仍需 Edge Function 复核。
--   - 计数由数据库触发器维护，客户端不能直接写汇总字段。
--   - 帖子/评论删除使用软删除；物理删除仅限管理员，并由 Storage 清理流程处理媒体。
--   - 本文件可重复执行：表、索引、触发器、策略均使用 if not exists / drop if exists。

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. 数据表
-- ---------------------------------------------------------------------------

create table if not exists public.community_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  nickname text not null,
  avatar_path text,
  bio text,
  role text not null default 'member',
  status text not null default 'active',
  mute_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_profiles_nickname_len check (char_length(nickname) between 2 and 16),
  constraint community_profiles_bio_len check (bio is null or char_length(bio) <= 500),
  constraint community_profiles_role_check check (role in ('member', 'board_admin', 'community_admin', 'super_admin')),
  constraint community_profiles_status_check check (status in ('active', 'muted', 'banned', 'deleted'))
);

create table if not exists public.community_installations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  install_id text not null,
  plugin_version text,
  platform text,
  status text not null default 'active',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (profile_id, install_id),
  constraint community_installations_status_check check (status in ('active', 'revoked'))
);

create table if not exists public.community_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  label text,
  max_uses integer not null default 1,
  used_count integer not null default 0,
  expires_at timestamptz,
  status text not null default 'active',
  created_by uuid references public.community_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint community_invites_max_uses_check check (max_uses > 0),
  constraint community_invites_used_count_check check (used_count >= 0 and used_count <= max_uses),
  constraint community_invites_status_check check (status in ('active', 'disabled'))
);

create table if not exists public.community_boards (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  icon_path text,
  color text,
  status text not null default 'open',
  owner_id uuid references public.community_profiles(id) on delete set null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint community_boards_slug_check check (slug ~ '^[a-z0-9-]{2,40}$'),
  constraint community_boards_status_check check (status in ('open', 'closed'))
);

create table if not exists public.community_board_members (
  board_id uuid not null references public.community_boards(id) on delete cascade,
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (board_id, profile_id),
  constraint community_board_members_role_check check (role in ('member', 'moderator', 'owner'))
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.community_boards(id) on delete restrict,
  author_id uuid references public.community_profiles(id) on delete set null,
  title text not null,
  body text not null,
  status text not null default 'published',
  pinned boolean not null default false,
  featured boolean not null default false,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  bookmark_count integer not null default 0,
  report_count integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint community_posts_title_len check (char_length(title) between 1 and 120),
  constraint community_posts_body_len check (char_length(body) between 1 and 20000),
  constraint community_posts_status_check check (status in ('published', 'hidden', 'deleted')),
  constraint community_posts_counts_check check (
    like_count >= 0 and comment_count >= 0 and bookmark_count >= 0 and report_count >= 0
  )
);

create table if not exists public.community_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  storage_path text not null,
  thumb_path text,
  mime_type text,
  size_bytes bigint,
  width integer,
  height integer,
  thumb_width integer,
  thumb_height integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (post_id, sort_order),
  unique (storage_path),
  constraint community_post_media_size_check check (size_bytes is null or size_bytes between 1 and 5242880)
);

create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  author_id uuid references public.community_profiles(id) on delete set null,
  parent_comment_id uuid references public.community_comments(id) on delete set null,
  body text not null,
  status text not null default 'published',
  like_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint community_comments_body_len check (char_length(body) between 1 and 5000),
  constraint community_comments_status_check check (status in ('published', 'hidden', 'deleted')),
  constraint community_comments_like_count_check check (like_count >= 0)
);

create table if not exists public.community_reactions (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  target_type text not null,
  target_id uuid not null,
  reaction_type text not null default 'like',
  created_at timestamptz not null default now(),
  primary key (profile_id, target_type, target_id, reaction_type),
  constraint community_reactions_target_check check (target_type in ('post', 'comment')),
  constraint community_reactions_type_check check (reaction_type in ('like'))
);

create table if not exists public.community_bookmarks (
  profile_id uuid not null references public.community_profiles(id) on delete cascade,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, post_id)
);

create table if not exists public.community_follows (
  follower_id uuid not null references public.community_profiles(id) on delete cascade,
  followee_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  constraint community_follows_not_self check (follower_id <> followee_id)
);

create table if not exists public.community_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.community_profiles(id) on delete cascade,
  actor_id uuid references public.community_profiles(id) on delete set null,
  type text not null,
  target_type text,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint community_notifications_type_check check (
    type in ('comment', 'reply', 'like', 'follow', 'system')
  )
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references public.community_profiles(id) on delete set null,
  target_type text not null,
  target_id uuid not null,
  reason text not null,
  detail text,
  status text not null default 'open',
  handled_by uuid references public.community_profiles(id) on delete set null,
  handled_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  constraint community_reports_target_check check (target_type in ('post', 'comment', 'profile')),
  constraint community_reports_reason_check check (
    reason in ('spam', 'harassment', 'attack', 'infringement', 'malware', 'other')
  ),
  constraint community_reports_status_check check (
    status in ('open', 'reviewing', 'resolved', 'rejected')
  )
);

create table if not exists public.community_moderation_logs (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid references public.community_profiles(id) on delete set null,
  action text not null,
  target_type text,
  target_id uuid,
  reason text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.community_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now(),
  constraint community_tags_slug_check check (slug ~ '^[a-z0-9-]{1,40}$')
);

create table if not exists public.community_post_tags (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  tag_id uuid not null references public.community_tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table if not exists public.community_blocks (
  blocker_id uuid not null references public.community_profiles(id) on delete cascade,
  blocked_id uuid not null references public.community_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint community_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.community_post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  editor_id uuid references public.community_profiles(id) on delete set null,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. 索引
-- ---------------------------------------------------------------------------

create index if not exists community_posts_board_feed_idx
  on public.community_posts (board_id, created_at desc)
  where status = 'published';
create index if not exists community_posts_author_idx
  on public.community_posts (author_id, created_at desc);
create index if not exists community_posts_status_idx
  on public.community_posts (status, created_at desc);
create index if not exists community_posts_activity_idx
  on public.community_posts (last_activity_at desc)
  where status = 'published';
create index if not exists community_comments_post_idx
  on public.community_comments (post_id, created_at);
create index if not exists community_comments_parent_idx
  on public.community_comments (parent_comment_id)
  where parent_comment_id is not null;
create index if not exists community_reactions_target_idx
  on public.community_reactions (target_type, target_id);
create index if not exists community_bookmarks_post_idx
  on public.community_bookmarks (post_id);
create index if not exists community_follows_followee_idx
  on public.community_follows (followee_id);
create index if not exists community_notifications_recipient_idx
  on public.community_notifications (recipient_id, read_at, created_at desc);
create index if not exists community_reports_status_idx
  on public.community_reports (status, created_at desc);
create index if not exists community_board_members_profile_idx
  on public.community_board_members (profile_id);
create index if not exists community_post_media_post_idx
  on public.community_post_media (post_id, sort_order);
create index if not exists community_post_tags_tag_idx
  on public.community_post_tags (tag_id);
create index if not exists community_installations_profile_idx
  on public.community_installations (profile_id);
create index if not exists community_notifications_like_unique
  on public.community_notifications (recipient_id, actor_id, type, target_type, target_id)
  where type = 'like';

-- ---------------------------------------------------------------------------
-- 3. 辅助函数与业务函数
-- ---------------------------------------------------------------------------

create or replace function public.community_current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.community_profiles
  where auth_user_id = auth.uid()
    and status <> 'deleted'
  limit 1
$$;

create or replace function public.community_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_profiles
    where auth_user_id = auth.uid()
      and status = 'active'
      and role in ('community_admin', 'super_admin')
  )
$$;

create or replace function public.community_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.community_profiles
    where auth_user_id = auth.uid()
      and status = 'active'
      and (mute_until is null or mute_until <= now())
  )
$$;

create or replace function public.community_can_moderate_board(p_board_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.community_is_admin()
    or exists (
      select 1
      from public.community_board_members m
      join public.community_profiles p on p.id = m.profile_id
      where m.board_id = p_board_id
        and p.auth_user_id = auth.uid()
        and p.status = 'active'
        and m.role in ('owner', 'moderator')
    )
$$;

create or replace function public.community_can_moderate_post(p_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.community_can_moderate_board(board_id)
  from public.community_posts
  where id = p_post_id
$$;

-- 评论父级校验放在 definer 函数中，避免 RLS 策略递归查询 community_comments。
create or replace function public.community_parent_comment_matches(p_post_id uuid, p_parent_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_parent_id is null
    or exists (
      select 1
      from public.community_comments parent
      where parent.id = p_parent_id and parent.post_id = p_post_id
    )
$$;

create or replace function public.community_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.community_refresh_comment_counts(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_comment_id is null then
    return;
  end if;
  update public.community_comments
     set like_count = (
       select count(*)
       from public.community_reactions
       where target_type = 'comment'
         and target_id = p_comment_id
         and reaction_type = 'like'
     )
   where id = p_comment_id;
end;
$$;

create or replace function public.community_refresh_post_counts(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_like_count integer;
  v_comment_count integer;
  v_bookmark_count integer;
  v_report_count integer;
begin
  if p_post_id is null then
    return;
  end if;
  select count(*) into v_like_count
  from public.community_reactions
  where target_type = 'post' and target_id = p_post_id and reaction_type = 'like';
  select count(*) into v_comment_count
  from public.community_comments
  where post_id = p_post_id and status = 'published';
  select count(*) into v_bookmark_count
  from public.community_bookmarks
  where post_id = p_post_id;
  select count(*) into v_report_count
  from public.community_reports
  where target_type = 'post' and target_id = p_post_id and status in ('open', 'reviewing');
  update public.community_posts
     set like_count = v_like_count,
         comment_count = v_comment_count,
         bookmark_count = v_bookmark_count,
         report_count = v_report_count,
         last_activity_at = now()
   where id = p_post_id;
end;
$$;

-- 邀请码兑换：完成邮箱验证后调用。函数以 definer 身份创建资料并递增使用次数。
create or replace function public.community_redeem_invite(p_code text, p_nickname text)
returns public.community_profiles
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_invite public.community_invites%rowtype;
  v_profile public.community_profiles%rowtype;
  v_nickname text := trim(coalesce(p_nickname, ''));
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1 from auth.users
    where id = v_uid and email_confirmed_at is not null
  ) then
    raise exception 'email_not_confirmed' using errcode = '42501';
  end if;

  select * into v_profile
  from public.community_profiles
  where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  if char_length(v_nickname) < 2 or char_length(v_nickname) > 16 then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  select * into v_invite
  from public.community_invites
  where code_hash = encode(digest(upper(trim(p_code)), 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'invalid_invite' using errcode = '22023';
  end if;
  if v_invite.status <> 'active' then
    raise exception 'invite_disabled' using errcode = '42501';
  end if;
  if v_invite.expires_at is not null and v_invite.expires_at < now() then
    raise exception 'invite_expired' using errcode = '22023';
  end if;
  if v_invite.used_count >= v_invite.max_uses then
    raise exception 'invite_exhausted' using errcode = '22023';
  end if;

  insert into public.community_profiles (auth_user_id, nickname)
  values (v_uid, v_nickname)
  returning * into v_profile;

  update public.community_invites
     set used_count = used_count + 1
   where id = v_invite.id;

  return v_profile;
end;
$$;

-- 管理员创建邀请码：只接受明文，入库前哈希。
create or replace function public.community_create_invite(
  p_code text,
  p_max_uses integer default 1,
  p_expires_at timestamptz default null,
  p_label text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if not public.community_is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_code is null or char_length(trim(p_code)) < 6 then
    raise exception 'invalid_code' using errcode = '22023';
  end if;

  insert into public.community_invites (code_hash, label, max_uses, expires_at, created_by)
  values (
    encode(digest(upper(trim(p_code)), 'sha256'), 'hex'),
    p_label,
    greatest(coalesce(p_max_uses, 1), 1),
    p_expires_at,
    public.community_current_profile_id()
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.community_register_installation(
  p_install_id text,
  p_plugin_version text default null,
  p_platform text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := public.community_current_profile_id();
  v_id uuid;
begin
  if v_profile_id is null then
    raise exception 'profile_required' using errcode = '42501';
  end if;
  if p_install_id is null or char_length(trim(p_install_id)) = 0 then
    raise exception 'invalid_install_id' using errcode = '22023';
  end if;

  insert into public.community_installations (profile_id, install_id, plugin_version, platform, last_seen_at)
  values (v_profile_id, trim(p_install_id), p_plugin_version, p_platform, now())
  on conflict (profile_id, install_id) do update
    set plugin_version = excluded.plugin_version,
        platform = excluded.platform,
        last_seen_at = now(),
        status = 'active'
  returning id into v_id;

  return v_id;
end;
$$;

-- 媒体孤儿清单：被删除帖子的媒体，供 Edge Function 删除 Storage 对象后再清理数据库行。
create or replace function public.community_media_orphans(p_age_days integer default 7)
returns table (
  media_id uuid,
  post_id uuid,
  storage_path text,
  thumb_path text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.post_id, m.storage_path, m.thumb_path, m.created_at
  from public.community_post_media m
  left join public.community_posts p on p.id = m.post_id
  where p.id is null
     or (
       p.status = 'deleted'
       and p.deleted_at is not null
       and p.deleted_at < now() - make_interval(days => greatest(coalesce(p_age_days, 7), 0))
     )
$$;

-- ---------------------------------------------------------------------------
-- 4. 数据保护触发器
-- ---------------------------------------------------------------------------

create or replace function public.community_guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.auth_user_id <> old.auth_user_id or new.created_at <> old.created_at)
     and auth.role() <> 'service_role' then
    raise exception 'profile_immutable_fields' using errcode = '42501';
  end if;
  if auth.role() = 'service_role' or public.community_is_admin() then
    return new;
  end if;
  if new.role <> old.role
     or new.status <> old.status
     or new.mute_until is distinct from old.mute_until then
    raise exception 'profile_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.community_guard_post_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator boolean;
begin
  -- 汇总数与时间戳只允许由触发器/definer 函数维护；触发器嵌套调用时放行。
  if new.created_at <> old.created_at
     or new.like_count <> old.like_count
     or new.comment_count <> old.comment_count
     or new.bookmark_count <> old.bookmark_count
     or new.report_count <> old.report_count
     or new.last_activity_at is distinct from old.last_activity_at
     or new.edited_at is distinct from old.edited_at
     or new.updated_at is distinct from old.updated_at then
    if pg_trigger_depth() <= 1 and auth.role() <> 'service_role' then
      raise exception 'post_counters_readonly' using errcode = '42501';
    end if;
  end if;

  if new.title is not distinct from old.title
     and new.body is not distinct from old.body
     and new.board_id = old.board_id
     and new.author_id is not distinct from old.author_id
     and new.status = old.status
     and new.pinned = old.pinned
     and new.featured = old.featured
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  v_moderator := public.community_is_admin() or public.community_can_moderate_board(old.board_id);

  if new.author_id is distinct from old.author_id then
    raise exception 'post_author_readonly' using errcode = '42501';
  end if;
  if new.board_id <> old.board_id and not public.community_is_admin() then
    raise exception 'post_board_readonly' using errcode = '42501';
  end if;

  if not v_moderator then
    if new.pinned <> old.pinned or new.featured <> old.featured then
      raise exception 'post_flags_readonly' using errcode = '42501';
    end if;
    if new.status not in ('published', 'deleted') then
      raise exception 'post_status_forbidden' using errcode = '42501';
    end if;
    if old.status = 'deleted' and new.status <> 'deleted' then
      raise exception 'post_restore_forbidden' using errcode = '42501';
    end if;
  end if;

  if new.title is distinct from old.title or new.body is distinct from old.body then
    new.edited_at := now();
  end if;

  if new.status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  else
    new.deleted_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.community_guard_board_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.community_is_admin() then
    return new;
  end if;
  if new.slug <> old.slug
     or new.owner_id is distinct from old.owner_id
     or new.status <> old.status
     or new.sort_order <> old.sort_order then
    raise exception 'board_fields_readonly' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.community_guard_comment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_moderator boolean;
begin
  -- 点赞数只由触发器维护；触发器嵌套调用时放行。
  if new.created_at <> old.created_at
     or new.like_count <> old.like_count
     or new.updated_at is distinct from old.updated_at then
    if pg_trigger_depth() <= 1 and auth.role() <> 'service_role' then
      raise exception 'comment_counters_readonly' using errcode = '42501';
    end if;
  end if;

  if new.body is not distinct from old.body
     and new.status = old.status
     and new.post_id = old.post_id
     and new.author_id is not distinct from old.author_id
     and new.parent_comment_id is not distinct from old.parent_comment_id
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  v_moderator := public.community_is_admin() or public.community_can_moderate_post(old.post_id);

  if new.post_id <> old.post_id
     or new.author_id is distinct from old.author_id
     or new.parent_comment_id is distinct from old.parent_comment_id then
    raise exception 'comment_fields_readonly' using errcode = '42501';
  end if;

  if not v_moderator then
    if new.status not in ('published', 'deleted') then
      raise exception 'comment_status_forbidden' using errcode = '42501';
    end if;
    if old.status = 'deleted' and new.status <> 'deleted' then
      raise exception 'comment_restore_forbidden' using errcode = '42501';
    end if;
  end if;

  if new.status = 'deleted' then
    new.deleted_at := coalesce(new.deleted_at, now());
  else
    new.deleted_at := null;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. 计数与通知触发器
-- ---------------------------------------------------------------------------

create or replace function public.community_reaction_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.target_type = 'post' then
      perform public.community_refresh_post_counts(old.target_id);
    else
      perform public.community_refresh_comment_counts(old.target_id);
    end if;
    return old;
  end if;

  if new.target_type = 'post' then
    perform public.community_refresh_post_counts(new.target_id);
  else
    perform public.community_refresh_comment_counts(new.target_id);
  end if;
  return new;
end;
$$;

create or replace function public.community_comment_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.community_refresh_post_counts(old.post_id);
    return old;
  end if;
  perform public.community_refresh_post_counts(new.post_id);
  return new;
end;
$$;

create or replace function public.community_bookmark_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.community_refresh_post_counts(old.post_id);
    return old;
  end if;
  perform public.community_refresh_post_counts(new.post_id);
  return new;
end;
$$;

create or replace function public.community_report_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.target_type = 'post' then
      perform public.community_refresh_post_counts(old.target_id);
    end if;
    return old;
  end if;
  if new.target_type = 'post' then
    perform public.community_refresh_post_counts(new.target_id);
  end if;
  return new;
end;
$$;

create or replace function public.community_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author uuid;
  v_parent_author uuid;
begin
  select author_id into v_post_author
  from public.community_posts
  where id = new.post_id;

  if v_post_author is not null and v_post_author <> new.author_id then
    insert into public.community_notifications (recipient_id, actor_id, type, target_type, target_id, payload)
    values (
      v_post_author,
      new.author_id,
      'comment',
      'post',
      new.post_id,
      jsonb_build_object('comment_id', new.id)
    );
  end if;

  if new.parent_comment_id is not null then
    select author_id into v_parent_author
    from public.community_comments
    where id = new.parent_comment_id;

    if v_parent_author is not null
       and v_parent_author <> new.author_id
       and v_parent_author is distinct from v_post_author then
      insert into public.community_notifications (recipient_id, actor_id, type, target_type, target_id, payload)
      values (
        v_parent_author,
        new.author_id,
        'reply',
        'comment',
        new.parent_comment_id,
        jsonb_build_object('comment_id', new.id, 'post_id', new.post_id)
      );
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.community_notify_reaction()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_author uuid;
begin
  if new.reaction_type <> 'like' then
    return new;
  end if;

  if new.target_type = 'post' then
    select author_id into v_author
    from public.community_posts
    where id = new.target_id;

    if v_author is not null and v_author <> new.profile_id then
      insert into public.community_notifications (recipient_id, actor_id, type, target_type, target_id)
      values (v_author, new.profile_id, 'like', 'post', new.target_id)
      on conflict do nothing;
    end if;
  else
    select author_id into v_author
    from public.community_comments
    where id = new.target_id;

    if v_author is not null and v_author <> new.profile_id then
      insert into public.community_notifications (recipient_id, actor_id, type, target_type, target_id)
      values (v_author, new.profile_id, 'like', 'comment', new.target_id)
      on conflict do nothing;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.community_notify_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.community_notifications (recipient_id, actor_id, type, target_type, target_id)
  values (new.followee_id, new.follower_id, 'follow', 'profile', new.follower_id)
  on conflict do nothing;
  return new;
end;
$$;

-- 触发器：内容更新时间只在内容字段变化时刷新
drop trigger if exists community_profiles_touch on public.community_profiles;
create trigger community_profiles_touch
  before update of nickname, avatar_path, bio, role, status, mute_until
  on public.community_profiles
  for each row execute function public.community_touch_updated_at();

drop trigger if exists community_boards_touch on public.community_boards;
create trigger community_boards_touch
  before update of name, description, icon_path, status, sort_order
  on public.community_boards
  for each row execute function public.community_touch_updated_at();

drop trigger if exists community_posts_touch on public.community_posts;
create trigger community_posts_touch
  before update of title, body, board_id, status, pinned, featured
  on public.community_posts
  for each row execute function public.community_touch_updated_at();

drop trigger if exists community_comments_touch on public.community_comments;
create trigger community_comments_touch
  before update of body, status
  on public.community_comments
  for each row execute function public.community_touch_updated_at();

drop trigger if exists community_profiles_guard on public.community_profiles;
create trigger community_profiles_guard
  before update on public.community_profiles
  for each row execute function public.community_guard_profile_update();

drop trigger if exists community_boards_guard on public.community_boards;
create trigger community_boards_guard
  before update on public.community_boards
  for each row execute function public.community_guard_board_update();

drop trigger if exists community_posts_guard on public.community_posts;
create trigger community_posts_guard
  before update on public.community_posts
  for each row execute function public.community_guard_post_update();

drop trigger if exists community_comments_guard on public.community_comments;
create trigger community_comments_guard
  before update on public.community_comments
  for each row execute function public.community_guard_comment_update();

drop trigger if exists community_reactions_count on public.community_reactions;
create trigger community_reactions_count
  after insert or delete on public.community_reactions
  for each row execute function public.community_reaction_changed();

drop trigger if exists community_comments_count on public.community_comments;
create trigger community_comments_count
  after insert or delete or update of status on public.community_comments
  for each row execute function public.community_comment_changed();

drop trigger if exists community_bookmarks_count on public.community_bookmarks;
create trigger community_bookmarks_count
  after insert or delete on public.community_bookmarks
  for each row execute function public.community_bookmark_changed();

drop trigger if exists community_reports_count on public.community_reports;
create trigger community_reports_count
  after insert or delete or update of status on public.community_reports
  for each row execute function public.community_report_changed();

drop trigger if exists community_comments_notify on public.community_comments;
create trigger community_comments_notify
  after insert on public.community_comments
  for each row execute function public.community_notify_comment();

drop trigger if exists community_reactions_notify on public.community_reactions;
create trigger community_reactions_notify
  after insert on public.community_reactions
  for each row execute function public.community_notify_reaction();

drop trigger if exists community_follows_notify on public.community_follows;
create trigger community_follows_notify
  after insert on public.community_follows
  for each row execute function public.community_notify_follow();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------------

alter table public.community_profiles enable row level security;
alter table public.community_installations enable row level security;
alter table public.community_invites enable row level security;
alter table public.community_boards enable row level security;
alter table public.community_board_members enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_post_media enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_bookmarks enable row level security;
alter table public.community_follows enable row level security;
alter table public.community_notifications enable row level security;
alter table public.community_reports enable row level security;
alter table public.community_moderation_logs enable row level security;
alter table public.community_tags enable row level security;
alter table public.community_post_tags enable row level security;
alter table public.community_blocks enable row level security;
alter table public.community_post_revisions enable row level security;

-- profiles
drop policy if exists community_profiles_select on public.community_profiles;
create policy community_profiles_select on public.community_profiles
  for select to authenticated
  using (status <> 'deleted' or auth_user_id = auth.uid() or public.community_is_admin());

drop policy if exists community_profiles_update_self on public.community_profiles;
create policy community_profiles_update_self on public.community_profiles
  for update to authenticated
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

drop policy if exists community_profiles_update_admin on public.community_profiles;
create policy community_profiles_update_admin on public.community_profiles
  for update to authenticated
  using (public.community_is_admin())
  with check (public.community_is_admin());

-- installations
drop policy if exists community_installations_select on public.community_installations;
create policy community_installations_select on public.community_installations
  for select to authenticated
  using (profile_id = public.community_current_profile_id() or public.community_is_admin());

drop policy if exists community_installations_insert on public.community_installations;
create policy community_installations_insert on public.community_installations
  for insert to authenticated
  with check (profile_id = public.community_current_profile_id());

drop policy if exists community_installations_update on public.community_installations;
create policy community_installations_update on public.community_installations
  for update to authenticated
  using (profile_id = public.community_current_profile_id() or public.community_is_admin())
  with check (profile_id = public.community_current_profile_id() or public.community_is_admin());

-- invites：只允许管理员直接管理；普通用户走 definer 函数
drop policy if exists community_invites_admin_all on public.community_invites;
create policy community_invites_admin_all on public.community_invites
  for all to authenticated
  using (public.community_is_admin())
  with check (public.community_is_admin());

-- boards
drop policy if exists community_boards_select on public.community_boards;
create policy community_boards_select on public.community_boards
  for select to authenticated
  using (status = 'open' or public.community_is_admin() or public.community_can_moderate_board(id));

drop policy if exists community_boards_insert on public.community_boards;
create policy community_boards_insert on public.community_boards
  for insert to authenticated
  with check (public.community_is_admin());

drop policy if exists community_boards_update on public.community_boards;
create policy community_boards_update on public.community_boards
  for update to authenticated
  using (public.community_is_admin() or public.community_can_moderate_board(id))
  with check (public.community_is_admin() or public.community_can_moderate_board(id));

drop policy if exists community_boards_delete on public.community_boards;
create policy community_boards_delete on public.community_boards
  for delete to authenticated
  using (public.community_is_admin());

-- board members
drop policy if exists community_board_members_select on public.community_board_members;
create policy community_board_members_select on public.community_board_members
  for select to authenticated
  using (true);

drop policy if exists community_board_members_insert on public.community_board_members;
create policy community_board_members_insert on public.community_board_members
  for insert to authenticated
  with check (
    public.community_is_admin()
    or (
      profile_id = public.community_current_profile_id()
      and role = 'member'
      and exists (
        select 1 from public.community_boards b
        where b.id = board_id and b.status = 'open'
      )
    )
  );

-- 角色调整只允许社区管理员，避免星域版主自我提权
drop policy if exists community_board_members_update on public.community_board_members;
create policy community_board_members_update on public.community_board_members
  for update to authenticated
  using (public.community_is_admin())
  with check (public.community_is_admin());

drop policy if exists community_board_members_delete on public.community_board_members;
create policy community_board_members_delete on public.community_board_members
  for delete to authenticated
  using (
    profile_id = public.community_current_profile_id()
    or public.community_is_admin()
    or public.community_can_moderate_board(board_id)
  );

-- posts
drop policy if exists community_posts_select on public.community_posts;
create policy community_posts_select on public.community_posts
  for select to authenticated
  using (
    status = 'published'
    or author_id = public.community_current_profile_id()
    or public.community_is_admin()
    or public.community_can_moderate_board(board_id)
  );

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert on public.community_posts
  for insert to authenticated
  with check (
    author_id = public.community_current_profile_id()
    and public.community_can_write()
    and status = 'published'
    and pinned = false
    and featured = false
    and like_count = 0
    and comment_count = 0
    and bookmark_count = 0
    and report_count = 0
    and edited_at is null
    and deleted_at is null
    and last_activity_at <= now() + interval '1 minute'
    and exists (
      select 1 from public.community_boards b
      where b.id = board_id and b.status = 'open'
    )
  );

drop policy if exists community_posts_update on public.community_posts;
create policy community_posts_update on public.community_posts
  for update to authenticated
  using (
    author_id = public.community_current_profile_id()
    or public.community_is_admin()
    or public.community_can_moderate_board(board_id)
  )
  with check (
    (
      author_id = public.community_current_profile_id()
      and (public.community_can_write() or status = 'deleted')
    )
    or public.community_is_admin()
    or public.community_can_moderate_board(board_id)
  );

drop policy if exists community_posts_delete on public.community_posts;
create policy community_posts_delete on public.community_posts
  for delete to authenticated
  using (public.community_is_admin());

-- post media
drop policy if exists community_post_media_select on public.community_post_media;
create policy community_post_media_select on public.community_post_media
  for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and (
          p.status = 'published'
          or p.author_id = public.community_current_profile_id()
          or public.community_is_admin()
          or public.community_can_moderate_board(p.board_id)
        )
    )
  );

drop policy if exists community_post_media_insert on public.community_post_media;
create policy community_post_media_insert on public.community_post_media
  for insert to authenticated
  with check (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and p.author_id = public.community_current_profile_id()
    )
    and storage_path like 'posts/' || auth.uid()::text || '/%'
  );

drop policy if exists community_post_media_delete on public.community_post_media;
create policy community_post_media_delete on public.community_post_media
  for delete to authenticated
  using (
    public.community_is_admin()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.author_id = public.community_current_profile_id()
    )
  );

-- comments
drop policy if exists community_comments_select on public.community_comments;
create policy community_comments_select on public.community_comments
  for select to authenticated
  using (
    (
      status = 'published'
      and exists (
        select 1 from public.community_posts p
        where p.id = public.community_comments.post_id and p.status = 'published'
      )
    )
    or author_id = public.community_current_profile_id()
    or public.community_is_admin()
    or public.community_can_moderate_post(post_id)
  );

drop policy if exists community_comments_insert on public.community_comments;
create policy community_comments_insert on public.community_comments
  for insert to authenticated
  with check (
    author_id = public.community_current_profile_id()
    and public.community_can_write()
    and status = 'published'
    and like_count = 0
    and deleted_at is null
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.status = 'published'
    )
    and public.community_parent_comment_matches(post_id, parent_comment_id)
  );

drop policy if exists community_comments_update on public.community_comments;
create policy community_comments_update on public.community_comments
  for update to authenticated
  using (
    author_id = public.community_current_profile_id()
    or public.community_is_admin()
    or public.community_can_moderate_post(post_id)
  )
  with check (
    (
      author_id = public.community_current_profile_id()
      and (public.community_can_write() or status = 'deleted')
    )
    or public.community_is_admin()
    or public.community_can_moderate_post(post_id)
  );

drop policy if exists community_comments_delete on public.community_comments;
create policy community_comments_delete on public.community_comments
  for delete to authenticated
  using (public.community_is_admin() or public.community_can_moderate_post(post_id));

-- reactions
drop policy if exists community_reactions_select on public.community_reactions;
create policy community_reactions_select on public.community_reactions
  for select to authenticated
  using (profile_id = public.community_current_profile_id());

drop policy if exists community_reactions_insert on public.community_reactions;
create policy community_reactions_insert on public.community_reactions
  for insert to authenticated
  with check (
    profile_id = public.community_current_profile_id()
    and public.community_can_write()
    and (
      (
        target_type = 'post'
        and exists (
          select 1 from public.community_posts p
          where p.id = target_id and p.status = 'published'
        )
      )
      or (
        target_type = 'comment'
        and exists (
          select 1 from public.community_comments c
          where c.id = target_id and c.status = 'published'
        )
      )
    )
  );

drop policy if exists community_reactions_delete on public.community_reactions;
create policy community_reactions_delete on public.community_reactions
  for delete to authenticated
  using (profile_id = public.community_current_profile_id());

-- bookmarks
drop policy if exists community_bookmarks_select on public.community_bookmarks;
create policy community_bookmarks_select on public.community_bookmarks
  for select to authenticated
  using (profile_id = public.community_current_profile_id());

drop policy if exists community_bookmarks_insert on public.community_bookmarks;
create policy community_bookmarks_insert on public.community_bookmarks
  for insert to authenticated
  with check (
    profile_id = public.community_current_profile_id()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.status = 'published'
    )
  );

drop policy if exists community_bookmarks_delete on public.community_bookmarks;
create policy community_bookmarks_delete on public.community_bookmarks
  for delete to authenticated
  using (profile_id = public.community_current_profile_id());

-- follows
drop policy if exists community_follows_select on public.community_follows;
create policy community_follows_select on public.community_follows
  for select to authenticated
  using (true);

drop policy if exists community_follows_insert on public.community_follows;
create policy community_follows_insert on public.community_follows
  for insert to authenticated
  with check (follower_id = public.community_current_profile_id());

drop policy if exists community_follows_delete on public.community_follows;
create policy community_follows_delete on public.community_follows
  for delete to authenticated
  using (follower_id = public.community_current_profile_id());

-- notifications
drop policy if exists community_notifications_select on public.community_notifications;
create policy community_notifications_select on public.community_notifications
  for select to authenticated
  using (recipient_id = public.community_current_profile_id());

drop policy if exists community_notifications_update on public.community_notifications;
create policy community_notifications_update on public.community_notifications
  for update to authenticated
  using (recipient_id = public.community_current_profile_id())
  with check (recipient_id = public.community_current_profile_id());

drop policy if exists community_notifications_delete on public.community_notifications;
create policy community_notifications_delete on public.community_notifications
  for delete to authenticated
  using (recipient_id = public.community_current_profile_id());

-- reports
drop policy if exists community_reports_select on public.community_reports;
create policy community_reports_select on public.community_reports
  for select to authenticated
  using (reporter_id = public.community_current_profile_id() or public.community_is_admin());

drop policy if exists community_reports_insert on public.community_reports;
create policy community_reports_insert on public.community_reports
  for insert to authenticated
  with check (
    reporter_id = public.community_current_profile_id()
    and public.community_can_write()
    and (
      (target_type = 'post' and exists (
        select 1 from public.community_posts p where p.id = target_id
      ))
      or (target_type = 'comment' and exists (
        select 1 from public.community_comments c where c.id = target_id
      ))
      or (target_type = 'profile' and exists (
        select 1 from public.community_profiles p where p.id = target_id
      ))
    )
  );

drop policy if exists community_reports_update on public.community_reports;
create policy community_reports_update on public.community_reports
  for update to authenticated
  using (public.community_is_admin())
  with check (public.community_is_admin());

-- moderation logs
drop policy if exists community_moderation_logs_select on public.community_moderation_logs;
create policy community_moderation_logs_select on public.community_moderation_logs
  for select to authenticated
  using (public.community_is_admin());

drop policy if exists community_moderation_logs_insert on public.community_moderation_logs;
create policy community_moderation_logs_insert on public.community_moderation_logs
  for insert to authenticated
  with check (operator_id = public.community_current_profile_id() and public.community_is_admin());

-- tags
drop policy if exists community_tags_select on public.community_tags;
create policy community_tags_select on public.community_tags
  for select to authenticated
  using (true);

drop policy if exists community_tags_admin_all on public.community_tags;
create policy community_tags_admin_all on public.community_tags
  for all to authenticated
  using (public.community_is_admin())
  with check (public.community_is_admin());

-- post tags
drop policy if exists community_post_tags_select on public.community_post_tags;
create policy community_post_tags_select on public.community_post_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and (
          p.status = 'published'
          or p.author_id = public.community_current_profile_id()
          or public.community_is_admin()
          or public.community_can_moderate_board(p.board_id)
        )
    )
  );

drop policy if exists community_post_tags_insert on public.community_post_tags;
create policy community_post_tags_insert on public.community_post_tags
  for insert to authenticated
  with check (
    public.community_is_admin()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.author_id = public.community_current_profile_id()
    )
  );

drop policy if exists community_post_tags_delete on public.community_post_tags;
create policy community_post_tags_delete on public.community_post_tags
  for delete to authenticated
  using (
    public.community_is_admin()
    or exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.author_id = public.community_current_profile_id()
    )
  );

-- blocks
drop policy if exists community_blocks_select on public.community_blocks;
create policy community_blocks_select on public.community_blocks
  for select to authenticated
  using (blocker_id = public.community_current_profile_id());

drop policy if exists community_blocks_insert on public.community_blocks;
create policy community_blocks_insert on public.community_blocks
  for insert to authenticated
  with check (blocker_id = public.community_current_profile_id());

drop policy if exists community_blocks_delete on public.community_blocks;
create policy community_blocks_delete on public.community_blocks
  for delete to authenticated
  using (blocker_id = public.community_current_profile_id());

-- post revisions
drop policy if exists community_post_revisions_select on public.community_post_revisions;
create policy community_post_revisions_select on public.community_post_revisions
  for select to authenticated
  using (
    exists (
      select 1 from public.community_posts p
      where p.id = post_id
        and (
          p.status = 'published'
          or p.author_id = public.community_current_profile_id()
          or public.community_is_admin()
          or public.community_can_moderate_board(p.board_id)
        )
    )
  );

drop policy if exists community_post_revisions_insert on public.community_post_revisions;
create policy community_post_revisions_insert on public.community_post_revisions
  for insert to authenticated
  with check (
    editor_id = public.community_current_profile_id()
    and exists (
      select 1 from public.community_posts p
      where p.id = post_id and p.author_id = public.community_current_profile_id()
    )
  );

-- ---------------------------------------------------------------------------
-- 7. 权限
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.community_profiles,
  public.community_installations,
  public.community_invites,
  public.community_boards,
  public.community_board_members,
  public.community_posts,
  public.community_post_media,
  public.community_comments,
  public.community_reactions,
  public.community_bookmarks,
  public.community_follows,
  public.community_notifications,
  public.community_reports,
  public.community_moderation_logs,
  public.community_tags,
  public.community_post_tags,
  public.community_blocks,
  public.community_post_revisions
to authenticated;

grant execute on function public.community_current_profile_id() to authenticated;
grant execute on function public.community_is_admin() to authenticated;
grant execute on function public.community_can_write() to authenticated;
grant execute on function public.community_can_moderate_board(uuid) to authenticated;
grant execute on function public.community_can_moderate_post(uuid) to authenticated;
grant execute on function public.community_parent_comment_matches(uuid, uuid) to authenticated;

revoke all on function public.community_redeem_invite(text, text) from public, anon;
grant execute on function public.community_redeem_invite(text, text) to authenticated;

revoke all on function public.community_register_installation(text, text, text) from public, anon;
grant execute on function public.community_register_installation(text, text, text) to authenticated;

revoke all on function public.community_create_invite(text, integer, timestamptz, text) from public, anon;
grant execute on function public.community_create_invite(text, integer, timestamptz, text) to authenticated;

revoke all on function public.community_refresh_post_counts(uuid) from public, anon, authenticated;
revoke all on function public.community_refresh_comment_counts(uuid) from public, anon, authenticated;
revoke all on function public.community_media_orphans(integer) from public, anon, authenticated;
grant execute on function public.community_media_orphans(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    alter publication supabase_realtime add table public.community_notifications;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.community_comments;
  exception when duplicate_object then null;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'community-media',
  'community-media',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists community_media_objects_read on storage.objects;
create policy community_media_objects_read on storage.objects
  for select to authenticated
  using (bucket_id = 'community-media');

drop policy if exists community_media_objects_insert on storage.objects;
create policy community_media_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in ('posts', 'avatars')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists community_media_objects_update on storage.objects;
create policy community_media_objects_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in ('posts', 'avatars')
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in ('posts', 'avatars')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists community_media_objects_delete on storage.objects;
create policy community_media_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'community-media'
    and (storage.foldername(name))[1] in ('posts', 'avatars')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- 10. 官方星域与基础标签
-- ---------------------------------------------------------------------------

insert into public.community_boards (slug, name, description, color, sort_order)
values
  ('whale-talk', '鲸梦交流', '产品使用、体验、建议与反馈', '#7fb6ff', 10),
  ('plugins', '插件分享', '插件推荐、发布、更新与体验', '#a78bfa', 20),
  ('themes', '主题创作', '头像框、动态背景、主题作品', '#f472b6', 30),
  ('desktop', '桌面美化', '桌面布局、视觉方案、个性化设置', '#38bdf8', 40),
  ('dev', '开发交流', '插件开发、代码、接口和技术经验', '#34d399', 50),
  ('tools', '效率工具', 'Skills、自动化、工作流和效率方法', '#fbbf24', 60),
  ('resources', '资源分享', '模板、素材、设计资源和教程', '#fb7185', 70),
  ('lounge', '闲聊广场', '日常交流、轻量话题和兴趣互动', '#94a3b8', 80)
on conflict (slug) do nothing;

insert into public.community_tags (name, slug)
values
  ('使用技巧', 'tips'),
  ('问题求助', 'help'),
  ('作品展示', 'showcase'),
  ('教程', 'tutorial'),
  ('资源', 'resource')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 11. 上线前检查
-- ---------------------------------------------------------------------------
-- 1) Authentication → URL Configuration 中配置站点地址与邮件跳转地址。
-- 2) 开启 Supabase 邮箱验证；community_redeem_invite 会拒绝 email_confirmed_at 为空的账号。
-- 3) 发帖、评论、举报的频率限制放在 Edge Function，先校验 community_can_write()。
-- 4) 管理操作写入 community_moderation_logs；service_role 密钥只放在 Edge Function 环境变量。
-- 5) 媒体清理：Edge Function 调用 community_media_orphans(7)，先删除 Storage 对象，
--    再按 media_id 删除 community_post_media 行。
-- 6) 用户注销：先将 profile.status 置为 deleted 并匿名化展示字段，是否保留历史内容由运营规则决定。
