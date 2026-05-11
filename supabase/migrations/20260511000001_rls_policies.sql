-- users: read and update own row only
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);
create policy "users_update_own" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- uploads: read own rows only (writes go through edge functions)
create policy "uploads_select_own" on public.uploads
  for select using (auth.uid() = user_id);

-- folders: read own rows only
create policy "folders_select_own" on public.folders
  for select using (auth.uid() = user_id);

-- daily_usage: read own rows only
create policy "daily_usage_select_own" on public.daily_usage
  for select using (auth.uid() = user_id);

-- subscription_status: read own row only
create policy "subscription_status_select_own" on public.subscription_status
  for select using (auth.uid() = user_id);
