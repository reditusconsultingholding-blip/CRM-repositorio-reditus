-- Reditus CRM — reemplaza el bloque único de texto de bot_knowledge_base
-- por varias secciones desplegables (Misión, Qué debe hacer, Personalidad,
-- Contexto del negocio, y las que el CEO quiera agregar). La tabla vieja
-- se deja intacta (no se borra, por si acaso) pero ya no se usa.
create table if not exists public.bot_knowledge_sections (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  contenido text not null default '',
  orden integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users (id) on delete set null
);

alter table public.bot_knowledge_sections enable row level security;

drop policy if exists "bot_knowledge_sections_select" on public.bot_knowledge_sections;
create policy "bot_knowledge_sections_select" on public.bot_knowledge_sections
  for select using (public.current_role() = 'ceo');

drop policy if exists "bot_knowledge_sections_manage" on public.bot_knowledge_sections;
create policy "bot_knowledge_sections_manage" on public.bot_knowledge_sections
  for all using (public.current_role() = 'ceo') with check (public.current_role() = 'ceo');

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'set_updated_at' and tgrelid = 'public.bot_knowledge_sections'::regclass) then
    create trigger set_updated_at before update on public.bot_knowledge_sections
      for each row execute function public.set_updated_at();
  end if;
end $$;
