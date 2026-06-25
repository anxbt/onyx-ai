-- Remove GLM-5.1 from the active catalog now that GLM-5.2 is available.
-- Keep the row inactive so historical conversations retain a readable model id.

update public.model_catalog
   set is_active = false,
       updated_at = now()
 where id = 'z-ai/glm-5.1';
