"use server";

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { encryptSecret, decryptSecret } from "@/lib/vault-crypto";

async function requireCeo() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") throw new Error("Solo el CEO puede ver la bóveda de contraseñas.");
}

export type VaultEntry = {
  id: string;
  app: string;
  correo: string | null;
  utilidad: string | null;
};

/** Lista las entradas SIN la contraseña — se revela solo bajo demanda. */
export async function listVaultEntries(): Promise<VaultEntry[]> {
  await requireCeo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credentials_vault")
    .select("id, app, correo, utilidad")
    .order("app");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function revealVaultPassword(id: string): Promise<string> {
  await requireCeo();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("credentials_vault")
    .select("password_encrypted")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return decryptSecret(data.password_encrypted);
}

export async function createVaultEntry(formData: FormData) {
  await requireCeo();
  const supabase = await createClient();

  const app = String(formData.get("app") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const utilidad = String(formData.get("utilidad") ?? "").trim();

  if (!app || !password) throw new Error("App y contraseña son obligatorios.");

  const { error } = await supabase.from("credentials_vault").insert({
    app,
    correo: correo || null,
    password_encrypted: encryptSecret(password),
    utilidad: utilidad || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/ceo");
}

export async function updateVaultEntry(id: string, formData: FormData) {
  await requireCeo();
  const supabase = await createClient();

  const app = String(formData.get("app") ?? "").trim();
  const correo = String(formData.get("correo") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const utilidad = String(formData.get("utilidad") ?? "").trim();

  if (!app) throw new Error("El nombre de la app es obligatorio.");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: any = { app, correo: correo || null, utilidad: utilidad || null };
  if (password) update.password_encrypted = encryptSecret(password);

  const { error } = await supabase.from("credentials_vault").update(update).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/ceo");
}

export async function deleteVaultEntry(id: string) {
  await requireCeo();
  const supabase = await createClient();
  const { error } = await supabase.from("credentials_vault").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/ceo");
}
