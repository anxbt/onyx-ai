-- Wave 3: Image & File Uploads
-- Creates the uploads table for tracking uploaded files/images
-- Storage buckets (chat-images, chat-files) must be created via Supabase Dashboard or CLI:
--   npx supabase storage create chat-images --public
--   npx supabase storage create chat-files

CREATE TABLE IF NOT EXISTS uploads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  storage_path      TEXT NOT NULL,
  filename          TEXT NOT NULL,
  mime_type         TEXT NOT NULL,
  size_bytes        INTEGER,
  content_type      TEXT, -- 'text', 'diagram', 'photo', 'screenshot', 'whiteboard', 'pdf', 'code'
  description       TEXT, -- AI-generated description
  transcribed_text  TEXT, -- extracted text if applicable
  embedding         VECTOR(384), -- for semantic search of uploads
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at DESC);

ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own uploads" ON uploads FOR ALL USING (auth.uid() = user_id);

-- Storage bucket RLS: allow authenticated users to read/write their own files
-- Run these via Supabase SQL Editor or include in storage bucket policies:
--
-- chat-images bucket (public read for vision model access):
--   CREATE POLICY "public read chat-images" ON storage.objects FOR SELECT USING (bucket_id = 'chat-images');
--   CREATE POLICY "users insert own chat-images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);
--
-- chat-files bucket (private):
--   CREATE POLICY "users manage own chat-files" ON storage.objects FOR ALL USING (bucket_id = 'chat-files' AND auth.uid()::text = (storage.foldername(name))[1]);
