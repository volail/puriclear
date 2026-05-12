-- Allow authenticated users to read (and create signed URLs for) their own upscaled images.
-- Path structure: upscaled/{user_id}/{upload_id}/upscaled.jpg
-- storage.foldername(name) returns an array; index 1 is the first path segment.
create policy "upscaled_select_own"
  on storage.objects for select
  using (
    bucket_id = 'upscaled'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Allow authenticated users to read their own original images (needed for signed URLs during processing).
-- Path structure: originals/{user_id}/{upload_id}/original.ext
create policy "originals_select_own"
  on storage.objects for select
  using (
    bucket_id = 'originals'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
