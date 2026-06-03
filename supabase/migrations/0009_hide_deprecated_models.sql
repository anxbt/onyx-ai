-- Catalog cleanup (plan Section 4): trim user-facing model list to 4.
-- Hide 5 deprecated models from the picker and surface Kimi K2 Thinking as
-- the new reasoning tier. Gemini Flash Lite stays available internally to
-- the Worker (kept in CURATED_MODELS in worker/src/config.ts) but is hidden
-- here so newly-installed clients won't show it in the model picker either.

-- 1. Hide deprecated models from the picker.
update public.model_catalog
   set is_active = false,
       updated_at = now()
 where id in (
   'qwen/qwen3-next-80b-a3b-instruct:free',
   'google/gemini-2.5-flash-lite',
   'deepseek/deepseek-v3.2',
   'mistralai/mistral-small-2603',
   'moonshotai/kimi-k2.5'
 );

-- 2. Add Kimi K2 Thinking as the new reasoning tier. Idempotent via upsert.
--    Provider costs ~$0.60 / $2.40 per M tokens. App markup follows the
--    existing GLOBAL_MARKUP=1.4 pattern from worker/src/config.ts so the
--    app-side costs are 0.84 / 3.36 per M tokens.
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
  'moonshotai/kimi-k2-thinking',
  'Kimi K2 Thinking',
  'Moonshot AI',
  false,
  true,
  false,
  0.6,
  2.4,
  0.84,
  3.36,
  262144,
  32768,
  'Deep reasoning. Best for hard CS problems: compiler design, algorithms, proofs.',
  true
)
on conflict (id) do update set
  is_active = excluded.is_active,
  display_name = excluded.display_name,
  provider_input_cost_per_m_token = excluded.provider_input_cost_per_m_token,
  provider_output_cost_per_m_token = excluded.provider_output_cost_per_m_token,
  app_input_cost_per_m_token = excluded.app_input_cost_per_m_token,
  app_output_cost_per_m_token = excluded.app_output_cost_per_m_token,
  context_window = excluded.context_window,
  max_output = excluded.max_output,
  description = excluded.description,
  supports_reasoning = excluded.supports_reasoning,
  updated_at = now();
