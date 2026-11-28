-- Planet moderation audit. The UPDATE policies in 0001 remain the authorization boundary.
-- Apply in the same Supabase project after 0001_community.sql.

begin;

create or replace function public.community_log_moderation_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operator_id uuid := public.community_current_profile_id();
begin
  if v_operator_id is not null and v_operator_id is distinct from old.author_id then
    -- The content table's UPDATE policy authorizes the non-owner moderator.
    insert into public.community_moderation_logs (
      operator_id, action, target_type, target_id, before_state, after_state
    ) values (
      v_operator_id, 'soft_delete', tg_argv[0], new.id,
      jsonb_build_object('status', old.status, 'deleted_at', old.deleted_at),
      jsonb_build_object('status', new.status, 'deleted_at', new.deleted_at)
    );
  end if;
  return new;
end;
$$;

revoke all on function public.community_log_moderation_soft_delete() from public, anon, authenticated;

drop trigger if exists community_posts_log_moderation_soft_delete on public.community_posts;
create trigger community_posts_log_moderation_soft_delete
  after update of status on public.community_posts
  for each row
  when (old.status is distinct from new.status and new.status = 'deleted')
  execute function public.community_log_moderation_soft_delete('post');

drop trigger if exists community_comments_log_moderation_soft_delete on public.community_comments;
create trigger community_comments_log_moderation_soft_delete
  after update of status on public.community_comments
  for each row
  when (old.status is distinct from new.status and new.status = 'deleted')
  execute function public.community_log_moderation_soft_delete('comment');

commit;
