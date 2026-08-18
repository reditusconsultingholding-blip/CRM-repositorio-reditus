-- Reditus CRM — base de conocimiento editable del agente de ventas de
-- WhatsApp. Una sola fila de texto libre que el CEO puede editar desde la
-- app (sin tocar código) para agregar información de ventas, precios
-- nuevos, objeciones, etc. a medida que vaya llegando.
create table if not exists public.bot_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  contenido text not null default '',
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

alter table public.bot_knowledge_base enable row level security;

drop policy if exists "bot_knowledge_base_select" on public.bot_knowledge_base;
create policy "bot_knowledge_base_select" on public.bot_knowledge_base
  for select using (public.current_role() is not null);

drop policy if exists "bot_knowledge_base_manage" on public.bot_knowledge_base;
create policy "bot_knowledge_base_manage" on public.bot_knowledge_base
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.bot_knowledge_base'::regclass) then
    create trigger set_updated_at before update on public.bot_knowledge_base
      for each row execute function public.set_updated_at();
  end if;
end $$;
