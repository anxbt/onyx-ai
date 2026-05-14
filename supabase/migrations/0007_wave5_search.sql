-- Wave 5: Brave Search & Internet Access
-- Search memory: persists every search query + results + topics for cross-conversation recall

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS search_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS search_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id   UUID REFERENCES conversations(id) ON DELETE SET NULL,
  query             TEXT NOT NULL,
  results           JSONB NOT NULL,
  summary           TEXT,
  topics            JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_results_user ON search_results(user_id, created_at DESC);

ALTER TABLE search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own search results" ON search_results FOR ALL USING (auth.uid() = user_id);
