-- Catalog refresh: add Qwen3.6 Plus as the default + correct DeepSeek
-- V4 Flash pricing/context + fix Kimi K2 Thinking output price.

-- 1. Qwen3.6 Plus — default multimodal/reasoning model.
insert into public.model_catalog (
  id,
  display_name,
  provider,
  supports_vision,
  supports_reasoning,
  is_free,
  provider_input_cost_per_m_token,
  provider_output_cost_per_m_token,
  app_input_cost_per_m_token,
  app_output_cost_per_m_token,
  context_window,
  max_output,
  description,
  is_active
) values (
  'qwen/qwen3.6-plus',
  'Qwen3.6 Plus',
  'Alibaba',
  true,
  true,
  false,
  0.325,
  1.95,
  0.455,
  2.73,
  1000000,
  65536,
  'Default model. Strong multimodal chat and reasoning with a 1M context window.',
  true
)
on conflict (id) do update set
  is_active = excluded.is_active,
  display_name = excluded.display_name,
  supports_reasoning = excluded.supports_reasoning,
  is_free = excluded.is_free,
  provider_input_cost_per_m_token = excluded.provider_input_cost_per_m_token,
  provider_output_cost_per_m_token = excluded.provider_output_cost_per_m_token,
  app_input_cost_per_m_token = excluded.app_input_cost_per_m_token,
  app_output_cost_per_m_token = excluded.app_output_cost_per_m_token,
  context_window = excluded.context_window,
  max_output = excluded.max_output,
  description = excluded.description,
  updated_at = now();

-- 2. DeepSeek V4 Flash — clean up. Old `:free` variant gets deactivated; the
--    paid variant gets the correct pricing/context/reasoning flag.
update public.model_catalog
   set is_active = false,
       updated_at = now()
 where id = 'deepseek/deepseek-v4-flash:free';

insert into public.model_catalog (
  id,
  display_name,
  provider,
  supports_vision,
  supports_reasoning,
  is_free,
  provider_input_cost_per_m_token,
  provider_output_cost_per_m_token,
  app_input_cost_per_m_token,
  app_output_cost_per_m_token,
  context_window,
  max_output,
  description,
  is_active
) values (
  'deepseek/deepseek-v4-flash',
  'DeepSeek V4 Flash',
  'DeepSeek',
  false,
  true,
  false,
  0.0983,
  0.1966,
  0.13762,
  0.27524,
  1000000,
  16384,
  'Paid default. Verified reasoning levels (high, xhigh). No training data collection.',
  true
)
on conflict (id) do update set
  is_active = excluded.is_active,
  display_name = excluded.display_name,
  supports_reasoning = excluded.supports_reasoning,
  is_free = excluded.is_free,
  provider_input_cost_per_m_token = excluded.provider_input_cost_per_m_token,
  provider_output_cost_per_m_token = excluded.provider_output_cost_per_m_token,
  app_input_cost_per_m_token = excluded.app_input_cost_per_m_token,
  app_output_cost_per_m_token = excluded.app_output_cost_per_m_token,
  context_window = excluded.context_window,
  max_output = excluded.max_output,
  description = excluded.description,
  updated_at = now();

-- 3. Kimi K2 Thinking — bump output price 2.40 → 2.50 per OpenRouter listing.
update public.model_catalog
   set provider_output_cost_per_m_token = 2.5,
       app_output_cost_per_m_token = 3.5,  -- 2.5 × 1.4 GLOBAL_MARKUP
       updated_at = now()
 where id = 'moonshotai/kimi-k2-thinking';
