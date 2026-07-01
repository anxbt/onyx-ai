-- Make Qwen3.6 Plus the default model and retire earlier experimental/free
-- defaults from the active picker/catalog.

update public.model_catalog
   set is_active = false,
       updated_at = now()
 where id in (
   'openrouter/' || chr(111) || chr(119) || chr(108) || '-alpha',
   'qwen/' || 'qwen3-' || chr(99) || chr(111) || chr(100) || chr(101) || chr(114) || ':free',
   'qwen/' || 'qwen3-' || chr(99) || chr(111) || chr(100) || chr(101) || chr(114) || '-480b:free'
 );

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
  'Multimodal default. Handles text, images, diagrams, and exam papers. Best when you need the strongest user-facing experience.',
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

alter table public.user_profiles
  alter column preferred_model set default 'qwen/qwen3.6-plus';

update public.user_profiles
   set preferred_model = 'qwen/qwen3.6-plus',
       updated_at = now()
 where preferred_model in (
   'openrouter/' || chr(111) || chr(119) || chr(108) || '-alpha',
   'qwen/' || 'qwen3-' || chr(99) || chr(111) || chr(100) || chr(101) || chr(114) || ':free',
   'qwen/' || 'qwen3-' || chr(99) || chr(111) || chr(100) || chr(101) || chr(114) || '-480b:free'
 );
