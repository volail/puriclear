-- Drop the previous storage policies (they used storage.foldername which may behave unexpectedly)
drop policy if exists "upscaled_select_own" on storage.objects;
drop policy if exists "originals_select_own" on storage.objects;

-- Re-create using split_part which is reliable pure SQL.
-- Object paths inside the bucket are: {user_id}/{upload_id}/upscaled.jpg
-- split_part(name, '/', 1) extracts the first segment = user_id
create policy "upscaled_select_own"
  on storage.objects for select
  using (
    bucket_id = 'upscaled'
    AND split_part(name, '/', 1) = auth.uid()::text
  );

create policy "originals_select_own"
  on storage.objects for select
  using (
    bucket_id = 'originals'
    AND split_part(name, '/', 1) = auth.uid()::text
  );
