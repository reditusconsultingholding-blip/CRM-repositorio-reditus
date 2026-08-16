-- Reditus CRM — suscripciones de notificaciones push (PWA).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own" on public.push_subscriptions
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
