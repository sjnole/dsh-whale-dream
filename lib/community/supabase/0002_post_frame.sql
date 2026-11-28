-- Snapshot the author's theme frame at publication. Null represents legacy posts or no frame.
begin;

alter table public.community_posts
  add column if not exists author_frame_id text
    check (author_frame_id is null or author_frame_id ~ '^[a-z0-9][a-z0-9-]{0,47}$');

create or replace function public.community_preserve_post_frame()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.author_frame_id is distinct from old.author_frame_id then
    raise exception 'post_frame_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists community_posts_preserve_frame on public.community_posts;
create trigger community_posts_preserve_frame
  before update of author_frame_id on public.community_posts
  for each row execute function public.community_preserve_post_frame();

notify pgrst, 'reload schema';
commit;
