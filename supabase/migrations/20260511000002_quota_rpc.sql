-- Returns true and increments count if under limit, false if at limit.
-- Uses SELECT FOR UPDATE to be safe under concurrent requests.
create or replace function public.check_and_increment_free_quota(
  p_user_id  uuid,
  p_jst_date date
) returns boolean
language plpgsql security definer as $$
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

  if v_count >= 3 then
    return false;
  end if;

  update public.daily_usage
  set count = count + 1
  where user_id = p_user_id and date = p_jst_date;

  return true;
end;
$$;

-- Releases a free quota reservation on failure (floors at 0).
create or replace function public.decrement_free_quota(
  p_user_id  uuid,
  p_jst_date date
) returns void
language plpgsql security definer as $$
begin
  update public.daily_usage
  set count = greatest(0, count - 1)
  where user_id = p_user_id and date = p_jst_date;
end;
$$;

-- Releases a pro quota reservation on failure (floors at 0).
create or replace function public.decrement_pro_quota(
  p_user_id uuid
) returns void
language plpgsql security definer as $$
begin
  update public.subscription_status
  set monthly_count = greatest(0, monthly_count - 1)
  where user_id = p_user_id;
end;
$$;
