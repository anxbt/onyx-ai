alter table public.messages
  add column if not exists skill_id text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_skill_id_check'
      and conrelid = 'public.messages'::regclass
  ) then
    alter table public.messages
      add constraint messages_skill_id_check
      check (skill_id is null or skill_id in ('explain', 'learn', 'research', 'brainstorm'));
  end if;
end
$$;

comment on column public.messages.skill_id is
  'Optional one-turn frontend skill selected for this assistant message.';
