"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type ActionResult = { error?: string } | undefined;

const CHANNEL_MANAGER_ROLES = ["ceo", "gerente_comercial", "directora_operativa"];

async function requireChannelManager() {
  const profile = await requireProfile();
  if (!CHANNEL_MANAGER_ROLES.includes(profile.role)) {
    return { profile: null, error: "Solo CEO, Gerente Comercial o Directora Operativa pueden hacer esto." };
  }
  return { profile, error: null };
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
}

export async function createChannel(formData: FormData): Promise<ActionResult> {
  const { profile, error: denied } = await requireChannelManager();
  if (denied) return { error: denied };
  try {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "Ponle un nombre al canal." };

    const supabase = await createClient();
    const slug = `${slugify(name)}-${Date.now().toString(36)}`;

    const { data: channel, error } = await supabase
      .from("chat_channels")
      .insert({ name, slug })
      .select("id")
      .single();
    if (error) return { error: error.message };

    // El creador queda adentro automáticamente.
    await supabase.from("chat_channel_members").insert({ channel_id: channel.id, user_id: profile!.id });

    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo crear el canal." };
  }
}

export async function deleteChannel(channelId: string): Promise<ActionResult> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { error: "Solo el CEO puede borrar canales." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("chat_channels").delete().eq("id", channelId);
    if (error) return { error: error.message };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo borrar el canal." };
  }
}

export async function addChannelMember(channelId: string, userId: string): Promise<ActionResult> {
  const { error: denied } = await requireChannelManager();
  if (denied) return { error: denied };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("chat_channel_members")
      .insert({ channel_id: channelId, user_id: userId });
    if (error && !error.message.includes("duplicate")) return { error: error.message };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo agregar." };
  }
}

export async function removeChannelMember(channelId: string, userId: string): Promise<ActionResult> {
  const { error: denied } = await requireChannelManager();
  if (denied) return { error: denied };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("chat_channel_members")
      .delete()
      .eq("channel_id", channelId)
      .eq("user_id", userId);
    if (error) return { error: error.message };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo quitar." };
  }
}

export type BookmarkTipo = "link" | "nota" | "recordatorio";

const MAX_BOOKMARKS_POR_CANAL = 3;

export async function addBookmark(
  channelId: string,
  nombre: string,
  contenido: string,
  tipo: BookmarkTipo = "link",
  recordatorioEn?: string | null,
): Promise<ActionResult> {
  const { profile, error: denied } = await requireChannelManager();
  if (denied) return { error: denied };
  try {
    if (!nombre.trim()) return { error: "Ponle un nombre." };
    if (tipo === "link" && !contenido.trim()) return { error: "El link es obligatorio." };

    const supabase = await createClient();

    const { count } = await supabase
      .from("chat_channel_bookmarks")
      .select("id", { count: "exact", head: true })
      .eq("channel_id", channelId);
    if ((count ?? 0) >= MAX_BOOKMARKS_POR_CANAL) {
      return { error: `Ya hay ${MAX_BOOKMARKS_POR_CANAL} fijados en este canal — quita uno antes de agregar otro.` };
    }

    const { error } = await supabase.from("chat_channel_bookmarks").insert({
      channel_id: channelId,
      nombre: nombre.trim(),
      tipo,
      url: tipo === "link" ? contenido.trim() : null,
      nota: tipo === "nota" ? contenido.trim() : null,
      recordatorio_en: tipo === "recordatorio" && recordatorioEn ? recordatorioEn : null,
      created_by: profile!.id,
    });
    if (error) return { error: error.message };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo agregar el marcador." };
  }
}

export async function removeBookmark(bookmarkId: string): Promise<ActionResult> {
  const { error: denied } = await requireChannelManager();
  if (denied) return { error: denied };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("chat_channel_bookmarks").delete().eq("id", bookmarkId);
    if (error) return { error: error.message };
    revalidatePath("/chat");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo quitar el marcador." };
  }
}

export type ChannelBookmark = {
  id: string;
  nombre: string;
  tipo: BookmarkTipo;
  url: string | null;
  nota: string | null;
  recordatorio_en: string | null;
};

export async function listBookmarks(channelId: string): Promise<ChannelBookmark[]> {
  try {
    await requireProfile();
    const supabase = await createClient();
    const { data } = await supabase
      .from("chat_channel_bookmarks")
      .select("id, nombre, tipo, url, nota, recordatorio_en")
      .eq("channel_id", channelId)
      .order("created_at");
    return (data ?? []) as ChannelBookmark[];
  } catch {
    return [];
  }
}

export async function getChannelDetails(channelId: string): Promise<{
  members: { id: string; name: string; avatar_url: string | null }[];
  files: { name: string; url: string; size: number | null; created_at: string }[];
  error?: string;
}> {
  try {
    await requireProfile();
    const supabase = await createClient();

    const [{ data: memberRows }, { data: fileRows }] = await Promise.all([
      supabase
        .from("chat_channel_members")
        .select("users(id, name, avatar_url)")
        .eq("channel_id", channelId),
      supabase
        .from("chat_messages")
        .select("attachment_name, attachment_url, attachment_size, created_at")
        .eq("channel_id", channelId)
        .not("attachment_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const members = (memberRows ?? [])
      .map((r) => (Array.isArray(r.users) ? r.users[0] : r.users))
      .filter((u): u is { id: string; name: string; avatar_url: string | null } => !!u);

    const files = (fileRows ?? [])
      .filter((f) => f.attachment_url)
      .map((f) => ({
        name: f.attachment_name ?? "Archivo",
        url: f.attachment_url as string,
        size: f.attachment_size,
        created_at: f.created_at,
      }));

    return { members, files };
  } catch (err) {
    return { members: [], files: [], error: err instanceof Error ? err.message : "No se pudo cargar." };
  }
}
