-- Storage RLS Policies for Wave 3 (Image & File Uploads)
-- Run these in the Supabase SQL Editor (https://app.supabase.com → SQL Editor)

-- chat-images bucket: public read (needed for vision models to access)
-- authenticated users can insert their own images
CREATE POLICY "public read chat-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-images');

CREATE POLICY "users insert own chat-images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "users delete own chat-images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- chat-files bucket: private, only owner can read/write
CREATE POLICY "users manage own chat-files"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'chat-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
