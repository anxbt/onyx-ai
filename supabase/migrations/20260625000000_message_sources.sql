-- Persist web-search source metadata with assistant messages so source cards
-- survive reloads and conversation history navigation.
alter table public.messages
  add column if not exists sources jsonb;

comment on column public.messages.sources is
  'Array of source metadata objects ({title,url,snippet,faviconUrl}) used for citation cards.';
