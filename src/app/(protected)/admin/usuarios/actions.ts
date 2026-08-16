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
  const { error } = await admin.auth.admin.deleteUser(id);

  if (error) {
    // Algunos proyectos de Supabase devuelven un 500 genérico acá por un
    // problema transitorio de su servicio de auth — como red de seguridad,
    // al menos desactivamos la cuenta para que deje de aparecer en la app.
    await admin.from("users").update({ active: false }).eq("id", id);
    throw new Error(
      `No se pudo borrar del todo (${error.message || "error de Supabase"}) — se dejó desactivada mientras tanto. Intenta de nuevo en unos minutos.`,
    );
  }

  revalidatePath("/admin/usuarios");
}
