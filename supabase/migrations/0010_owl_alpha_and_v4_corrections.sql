-- Catalog refresh: add Owl Alpha as the new free default + correct DeepSeek
-- V4 Flash (was wrongly marked free at $0/$0; in reality the `:free` variant
-- was non-functional and the paid variant has real costs) + fix Kimi K2
-- Thinking output price (2.40 → 2.50 per OpenRouter June 3 2026).

-- 1. Owl Alpha (NEW) — free default. App markup applied (×1.4 of provider)
--    is moot when both provider sides are 0, so app costs are 0 too.
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
  'openrouter/owl-alpha',
  'Owl Alpha',
  'OpenRouter',
  false,
  true,
  true,
  0,
  0,
  0,
  0,
  1000000,
  32768,
  'Free default. Strong at code, agents, and complex instructions. Provider may log messages for training.',
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
