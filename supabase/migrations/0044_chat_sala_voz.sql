-- Reditus CRM — Sala de voz (pestaña "Voz" en el chat interno, tipo
-- Discord): un canal fijo (identificado por su slug 'sala-de-voz') con su
-- propio chat de texto (reutiliza chat_messages normal) y llamadas en
-- vivo por WebRTC (la señalización va por Supabase Realtime
-- broadcast/presence, no toca la base de datos).
insert into public.chat_channels (slug, name)
values ('sala-de-voz', '🔊 Sala de voz')
on conflict (slug) do nothing;

-- Todo el mundo activo entra automáticamente, igual que los demás canales.
insert into public.chat_channel_members (channel_id, user_id)
select c.id, u.id
from public.chat_channels c
cross join public.users u
where c.slug = 'sala-de-voz' and u.active = true
on conflict do nothing;
