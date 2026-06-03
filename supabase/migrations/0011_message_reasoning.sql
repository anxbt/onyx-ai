-- Section 7c: persist the reasoning trace from thinking-capable models
-- (DeepSeek V4 Flash with effort, Kimi K2 Thinking, Qwen3 thinking, etc.).
-- Stored separately from `content` so the visible answer can be summarized
-- and previewed without pulling in the trace.
--
-- The Worker writes this column when persisting the assistant message at the
-- end of the SSE stream. The client reads it via fetchMessagesForConversation
-- and renders a collapsible <ReasoningPanel> above the answer.

alter table public.messages
  add column if not exists reasoning text;

comment on column public.messages.reasoning is
  'Chain-of-thought trace produced by reasoning models. Concatenation of OpenRouter delta.reasoning_details entries during streaming.';
