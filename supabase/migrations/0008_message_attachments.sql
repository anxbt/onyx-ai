-- Persist per-message attachments so multi-turn conversations can
-- continue to reference uploaded images / files after the initial send.
alter table public.messages
  add column if not exists attachments jsonb;

comment on column public.messages.attachments is
  'Array of Attachment objects ({id,name,type,remoteUrl,mimeType,sizeBytes}). Null when the message has no attachments.';
