ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS title_manually_edited BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS title_generated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS conversations_user_pinned_updated_idx
  ON conversations (user_id, is_pinned DESC, pinned_at DESC, updated_at DESC);
