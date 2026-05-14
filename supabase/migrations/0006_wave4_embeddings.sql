-- Wave 4: Semantic Memory & Retrieval
-- Adds embedding columns, indexes, and match_memory_facts RPC

-- Messages: add embedding column
ALTER TABLE messages ADD COLUMN IF NOT EXISTS embedding VECTOR(384);

-- Memory facts: change from 1536 to 384 (matching all-MiniLM-L6-v2)
ALTER TABLE memory_facts ALTER COLUMN embedding TYPE VECTOR(384);

-- IVFFlat indexes for fast cosine similarity search
CREATE INDEX IF NOT EXISTS idx_messages_embedding ON messages USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_memory_facts_embedding ON memory_facts USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- RPC: semantic search over memory_facts
CREATE OR REPLACE FUNCTION match_memory_facts(
  query_embedding vector(384),
  p_user_id UUID,
  match_threshold float,
  match_count int
)
RETURNS TABLE(id UUID, content TEXT, category TEXT, similarity float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mf.id,
    mf.content,
    mf.category,
    1 - (mf.embedding <=> query_embedding) AS similarity
  FROM memory_facts mf
  WHERE mf.user_id = p_user_id
    AND mf.embedding IS NOT NULL
    AND 1 - (mf.embedding <=> query_embedding) > match_threshold
  ORDER BY mf.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;
