ALTER TABLE user_profiles
  ALTER COLUMN preferred_model SET DEFAULT 'qwen/qwen3-coder-480b:free';

UPDATE user_profiles
SET preferred_model = 'qwen/qwen3-coder-480b:free',
    updated_at = NOW()
WHERE preferred_model = 'deepseek/deepseek-v3.2'
  AND credit_balance <= 0;
