ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_superuser BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE conversations
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

ALTER TABLE messages
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

CREATE TABLE IF NOT EXISTS top_up_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pack_id TEXT NOT NULL,
  amount_inr DECIMAL(10,2) NOT NULL,
  credits_inr DECIMAL(10,2) NOT NULL,
  razorpay_order_id TEXT UNIQUE,
  razorpay_payment_id TEXT,
  razorpay_signature TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  message_id UUID NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  provider_input_cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
  provider_output_cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
  provider_total_cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
  charged_total_cost_inr DECIMAL(10,2) NOT NULL DEFAULT 0,
  frontier_model TEXT NOT NULL,
  frontier_cost_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
  savings_vs_frontier_usd DECIMAL(12,8) NOT NULL DEFAULT 0,
  deduction_bypassed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_catalog (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  supports_vision BOOLEAN NOT NULL DEFAULT FALSE,
  supports_reasoning BOOLEAN NOT NULL DEFAULT FALSE,
  is_free BOOLEAN NOT NULL DEFAULT FALSE,
  provider_input_cost_per_m_token DECIMAL(12,6) NOT NULL DEFAULT 0,
  provider_output_cost_per_m_token DECIMAL(12,6) NOT NULL DEFAULT 0,
  app_input_cost_per_m_token DECIMAL(12,6) NOT NULL DEFAULT 0,
  app_output_cost_per_m_token DECIMAL(12,6) NOT NULL DEFAULT 0,
  context_window INTEGER NOT NULL DEFAULT 0,
  max_output INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles
  ALTER COLUMN preferred_model SET DEFAULT 'qwen/qwen3.6-plus';

CREATE INDEX IF NOT EXISTS conversations_user_updated_idx
  ON conversations (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON messages (conversation_id, created_at);

CREATE INDEX IF NOT EXISTS credit_transactions_user_created_idx
  ON credit_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_events_user_created_idx
  ON usage_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS top_up_orders_user_created_idx
  ON top_up_orders (user_id, created_at DESC);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_up_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage own profile" ON user_profiles;
CREATE POLICY "users manage own profile"
  ON user_profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "users manage own conversations"
  ON conversations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own messages"
  ON messages FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users manage own memory"
  ON memory_facts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own credit transactions"
  ON credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users read own top up orders"
  ON top_up_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users create own top up orders"
  ON top_up_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users read own usage events"
  ON usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "authenticated users read active model catalog"
  ON model_catalog FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = TRUE);

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_superuser_by_email(
  p_email TEXT,
  p_is_superuser BOOLEAN DEFAULT TRUE
) RETURNS VOID AS $$
DECLARE
  target_user_id UUID;
BEGIN
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email = p_email
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for email %', p_email;
  END IF;

  UPDATE public.user_profiles
  SET is_superuser = p_is_superuser, updated_at = NOW()
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION record_usage_and_charge(
  p_user_id UUID,
  p_conversation_id UUID,
  p_message_id UUID,
  p_model TEXT,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_total_tokens INTEGER,
  p_provider_input_cost_usd DECIMAL,
  p_provider_output_cost_usd DECIMAL,
  p_provider_total_cost_usd DECIMAL,
  p_charged_total_cost_inr DECIMAL,
  p_frontier_model TEXT,
  p_frontier_cost_usd DECIMAL,
  p_savings_vs_frontier_usd DECIMAL,
  p_idempotency_key TEXT
) RETURNS TABLE (
  charged BOOLEAN,
  bypassed BOOLEAN,
  new_balance DECIMAL
) AS $$
DECLARE
  profile_record user_profiles%ROWTYPE;
  existing_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO existing_count
  FROM public.credit_transactions
  WHERE idempotency_key = p_idempotency_key;

  IF existing_count > 0 THEN
    RETURN QUERY
    SELECT FALSE, FALSE, credit_balance
    FROM public.user_profiles
    WHERE id = p_user_id;
    RETURN;
  END IF;

  SELECT * INTO profile_record
  FROM public.user_profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF profile_record.id IS NULL THEN
    RAISE EXCEPTION 'User profile missing for %', p_user_id;
  END IF;

  INSERT INTO public.usage_events (
    user_id,
    conversation_id,
    message_id,
    model,
    prompt_tokens,
    completion_tokens,
    total_tokens,
    provider_input_cost_usd,
    provider_output_cost_usd,
    provider_total_cost_usd,
    charged_total_cost_inr,
    frontier_model,
    frontier_cost_usd,
    savings_vs_frontier_usd,
    deduction_bypassed
  ) VALUES (
    p_user_id,
    p_conversation_id,
    p_message_id,
    p_model,
    p_prompt_tokens,
    p_completion_tokens,
    p_total_tokens,
    p_provider_input_cost_usd,
    p_provider_output_cost_usd,
    p_provider_total_cost_usd,
    p_charged_total_cost_inr,
    p_frontier_model,
    p_frontier_cost_usd,
    p_savings_vs_frontier_usd,
    profile_record.is_superuser
  );

  IF profile_record.is_superuser THEN
    RETURN QUERY SELECT FALSE, TRUE, profile_record.credit_balance;
    RETURN;
  END IF;

  UPDATE public.user_profiles
  SET
    credit_balance = credit_balance - p_charged_total_cost_inr,
    total_tokens_used = total_tokens_used + p_total_tokens,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (
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
    -p_charged_total_cost_inr,
    'usage',
    p_model,
    p_conversation_id,
    p_message_id,
    p_total_tokens,
    p_idempotency_key
  );

  RETURN QUERY
  SELECT TRUE, FALSE, credit_balance
  FROM public.user_profiles
  WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION complete_top_up_order(
  p_user_id UUID,
  p_order_id TEXT,
  p_payment_id TEXT,
  p_signature TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  order_record top_up_orders%ROWTYPE;
BEGIN
  SELECT * INTO order_record
  FROM top_up_orders
  WHERE razorpay_order_id = p_order_id
  FOR UPDATE;

  IF order_record.id IS NULL OR order_record.user_id <> p_user_id THEN
    RETURN FALSE;
  END IF;

  IF order_record.status = 'paid' THEN
    RETURN TRUE;
  END IF;

  UPDATE top_up_orders
  SET
    status = 'paid',
    razorpay_payment_id = p_payment_id,
    razorpay_signature = p_signature,
    updated_at = NOW()
  WHERE id = order_record.id;

  UPDATE public.user_profiles
  SET
    credit_balance = credit_balance + order_record.credits_inr,
    updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (
    user_id,
    amount,
    type,
    idempotency_key
  ) VALUES (
    p_user_id,
    order_record.credits_inr,
    'top_up',
    CONCAT('topup:', p_order_id)
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
