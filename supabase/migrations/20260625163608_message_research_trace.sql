-- Persist the research planning/search trace for assistant messages.
-- Stored on messages to reuse existing message ownership and RLS behavior.
alter table public.messages
  add column if not exists research_trace jsonb;

comment on column public.messages.research_trace is
  'Array of research progress events emitted while planning, searching, reading, and synthesizing web/deep research.';
