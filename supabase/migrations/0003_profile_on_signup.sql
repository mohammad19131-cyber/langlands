-- Auth → profiles. docs/schema.sql has no insert policy on profiles, so a
-- client cannot create its own row. This trigger is the intended path.
-- Role defaults to member; organisers / judges are promoted with the service
-- role, never from the browser (profiles_self_update keeps role unchanged).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  chosen_name text;
begin
  chosen_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Player'
  );
  if char_length(chosen_name) < 2 then
    chosen_name := 'Player';
  end if;
  if char_length(chosen_name) > 80 then
    chosen_name := left(chosen_name, 80);
  end if;

  insert into public.profiles (id, display_name, role)
  values (new.id, chosen_name, 'member')
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public;
