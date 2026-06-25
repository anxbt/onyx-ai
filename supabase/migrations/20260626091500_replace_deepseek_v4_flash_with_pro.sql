-- Replace DeepSeek V4 Flash with DeepSeek V4 Pro in the active catalog.
-- Keep the old Flash rows inactive so historical conversations still have
-- readable model ids while the picker and worker use V4 Pro going forward.

update public.model_catalog
   set is_active = false,
       updated_at = now()
 where id in ('deepseek/deepseek-v4-flash', 'deepseek/deepseek-v4-flash:free');

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
  'deepseek/deepseek-v4-pro',
  'DeepSeek V4 Pro',
  'DeepSeek',
  false,
  true,
  false,
  0.435,
  0.87,
  0.609,
  1.218,
  1000000,
  32768,
  'Paid default. Stronger long-context reasoning and coding model. No training data collection.',
  true
)
on conflict (id) do update set
  is_active = excluded.is_active,
  display_name = excluded.display_name,
  supports_vision = excluded.supports_vision,
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
