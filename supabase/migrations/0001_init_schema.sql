CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  credit_balance DECIMAL(10,4) NOT NULL DEFAULT 0,
  total_tokens_used INTEGER NOT NULL DEFAULT 0,
  preferred_model TEXT NOT NULL DEFAULT 'qwen/qwen3-coder-480b:free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT,
  model TEXT NOT NULL DEFAULT 'deepseek/deepseek-v3.2',
  preview TEXT,
  token_count INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  model TEXT,
  has_attachment BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('learning', 'preference', 'project', 'personal')),
  confidence DECIMAL(3,2) NOT NULL DEFAULT 0.5,
  embedding vector(1536),
  source_conversation_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, content)
);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('top_up', 'usage', 'refund')),
  model TEXT,
  conversation_id UUID,
  message_id UUID,
  tokens_used INTEGER,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION deduct_credits_and_record(
  p_user_id UUID,
  p_amount DECIMAL,
  p_model TEXT,
  p_conversation_id UUID,
  p_message_id UUID,
  p_tokens_used INTEGER,
  p_idempotency_key TEXT
) RETURNS VOID AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM credit_transactions WHERE idempotency_key = p_idempotency_key
  ) THEN
    RETURN;
  END IF;

  UPDATE user_profiles
  SET
    credit_balance = credit_balance - p_amount,
    total_tokens_used = total_tokens_used + p_tokens_used,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO credit_transactions (
    user_id,
    amount,
    type,
    model,
    conversation_id,
    message_id,
    tokens_used,
    idempotency_key
  ) VALUES (
    p_user_id,
    -p_amount,
    'usage',
    p_model,
    p_conversation_id,
    p_message_id,
    p_tokens_used,
    p_idempotency_key
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
