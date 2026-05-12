create or replace function public.check_and_increment_free_quota(
  p_user_id  uuid,
  p_jst_date date
) returns boolean
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  insert into public.daily_usage (user_id, date, count)
  values (p_user_id, p_jst_date, 0)
  on conflict (user_id, date) do nothing;

  select count into v_count
  from public.daily_usage
  where user_id = p_user_id and date = p_jst_date
  for update;

  if v_count >= 300 then
    return false;
  end if;

  update public.daily_usage
  set count = count + 1
  where user_id = p_user_id and date = p_jst_date;

  return true;
end;
$$;
