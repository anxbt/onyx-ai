-- Wave 1: Context Window Management
-- Rolling summaries + semantic retrieval support

-- conversation_summaries table
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_start_idx INTEGER NOT NULL,
  message_end_idx   INTEGER NOT NULL,
  summary_text      TEXT NOT NULL,
  key_facts         JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_conversation ON conversation_summaries(conversation_id, message_end_idx);

ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own summaries" ON conversation_summaries FOR ALL USING (
  EXISTS (SELECT 1 FROM conversations c WHERE c.id = conversation_summaries.conversation_id AND c.user_id = auth.uid())
);

-- RPC: semantic search over messages in a conversation (Wave 1 foundation for Wave 4)
CREATE OR REPLACE FUNCTION match_messages(
  query_embedding vector(384),
  conv_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE(id UUID, role TEXT, content TEXT, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.role,
    m.content,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM messages m
  WHERE m.conversation_id = conv_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
