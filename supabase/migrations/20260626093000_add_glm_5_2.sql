-- Add Z.ai GLM-5.2 to the active model catalog.

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
  'z-ai/glm-5.2',
  'GLM-5.2',
  'Z.ai',
  false,
  true,
  false,
  0.95,
  3,
  1.33,
  4.2,
  1000000,
  131072,
  'Agentic reasoning model with a 1M context window for long-horizon coding and automation.',
  true
)
on conflict (id) do update set
  is_active = excluded.is_active,
  display_name = excluded.display_name,
  provider = excluded.provider,
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
