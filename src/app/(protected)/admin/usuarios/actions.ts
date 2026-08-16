"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, ADMIN_ROLES, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireCeo() {
  const profile = await requireProfile();
  if (!(ADMIN_ROLES as string[]).includes(profile.role)) {
    throw new Error("Solo el CEO puede administrar usuarios.");
  }
  return profile;
}

export async function createUser(formData: FormData) {
  await requireCeo();
  const admin = createAdminClient();

  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "") as UserRole;
  const password = String(formData.get("password") ?? "");

  if (!email || !name || !role || password.length < 8) {
    throw new Error("Completa todos los campos (contraseña mínimo 8 caracteres).");
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(error.message);

  const { error: profileError } = await admin
    .from("users")
    .insert({ id: data.user.id, name, email, role });

  if (profileError) {
    await admin.auth.admin.deleteUser(data.user.id);
    throw new Error(profileError.message);
  }

  revalidatePath("/admin/usuarios");
}

export async function setUserActive(id: string, active: boolean) {
  await requireCeo();
  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/usuarios");
}

export async function updateUserRole(id: string, role: UserRole) {
  await requireCeo();
  const admin = createAdminClient();
  const { error } = await admin.from("users").update({ role }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/usuarios");
}

export async function deleteUser(id: string) {
  const profile = await requireCeo();
  if (id === profile.id) {
    throw new Error("No puedes borrar tu propia cuenta.");
  }

  const admin = createAdminClient();

  // Todo el intento de borrado va envuelto en try/catch a propósito: la
  // librería de Supabase puede LANZAR una excepción en vez de devolver
  // {error} en algunos casos (ej. fallos de red del lado del servidor de
  // Auth), y esa excepción cruda a veces no se puede serializar bien de
  // vuelta al cliente — eso es lo que producía el error #441 genérico de
  // React en vez de un mensaje claro. Ahora cualquier fallo, venga como
  // {error} o como excepción, termina en un mensaje de texto plano.
  try {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message || "Error desconocido de Supabase.");
  } catch (err) {
    try {
      await admin.from("users").update({ active: false }).eq("id", id);
    } catch {
      // si ni siquiera esto funciona, igual informamos el error original abajo
    }
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `No se pudo borrar del todo (${detail || "error de Supabase"}). Se dejó desactivada mientras tanto — intenta borrarla de nuevo en unos minutos.`,
    );
  }

  revalidatePath("/admin/usuarios");
}
