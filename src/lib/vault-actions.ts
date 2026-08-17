"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/vault-crypto";

// Ver nota en admin/usuarios/actions.ts: Next.js oculta el mensaje real de
// cualquier throw en una Server Action en producción, así que aquí siempre
// se devuelve { error } en vez de lanzar.
type ActionResult = { error?: string } | undefined;

async function requireCeoOrError(): Promise<{ error: string } | null> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { error: "Solo el CEO puede ver la bóveda de contraseñas." };
  return null;
}

export type VaultEntry = {
  id: string;
  app: string;
  correo: string | null;
  utilidad: string | null;
};

/** Lista las entradas SIN la contraseña — se revela solo bajo demanda. */
export async function listVaultEntries(): Promise<VaultEntry[]> {
  const denied = await requireCeoOrError();
  if (denied) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credentials_vault")
    .select("id, app, correo, utilidad")
    .order("app");
  if (error) return [];
  return data ?? [];
}

export async function revealVaultPassword(id: string): Promise<{ password?: string; error?: string }> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("credentials_vault")
      .select("password_encrypted")
      .eq("id", id)
      .single();
    if (error) return { error: error.message };
    return { password: decryptSecret(data.password_encrypted) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo revelar la contraseña." };
  }
}

export async function createVaultEntry(formData: FormData): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const app = String(formData.get("app") ?? "").trim();
    const correo = String(formData.get("correo") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const utilidad = String(formData.get("utilidad") ?? "").trim();

    if (!app || !password) return { error: "App y contraseña son obligatorios." };

    const { error } = await supabase.from("credentials_vault").insert({
      app,
      correo: correo || null,
      password_encrypted: encryptSecret(password),
      utilidad: utilidad || null,
    });
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateVaultEntry(id: string, formData: FormData): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const app = String(formData.get("app") ?? "").trim();
    const correo = String(formData.get("correo") ?? "").trim();
    const password = String(formData.get("password") ?? "");
    const utilidad = String(formData.get("utilidad") ?? "").trim();

    if (!app) return { error: "El nombre de la app es obligatorio." };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const update: any = { app, correo: correo || null, utilidad: utilidad || null };
    if (password) update.password_encrypted = encryptSecret(password);

    const { error } = await supabase.from("credentials_vault").update(update).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function deleteVaultEntry(id: string): Promise<ActionResult> {
  const denied = await requireCeoOrError();
  if (denied) return denied;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("credentials_vault").delete().eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/ceo");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
