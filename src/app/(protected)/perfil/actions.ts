"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function changeMyPassword(currentPassword: string, newPassword: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) throw new Error("No autenticado.");

  if (newPassword.length < 8) {
    throw new Error("La nueva contraseña debe tener al menos 8 caracteres.");
  }

  // Verificamos la contraseña actual re-autenticando antes de cambiarla.
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    throw new Error("La contraseña actual no es correcta.");
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}

export async function changeMyEmail(currentPassword: string, newEmail: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) throw new Error("No autenticado.");

  const email = newEmail.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("Correo inválido.");

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInError) throw new Error("La contraseña actual no es correcta.");

  // Se cambia directo (sin correo de confirmación) usando el cliente admin,
  // igual que hace el CEO al crear cuentas — este proyecto no tiene envío
  // de correos configurado todavía.
  const admin = createAdminClient();
  const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
    email,
    email_confirm: true,
  });
  if (authError) throw new Error(authError.message);

  const { error: profileError } = await admin.from("users").update({ email }).eq("id", user.id);
  if (profileError) throw new Error(profileError.message);

  revalidatePath("/perfil");
}

export async function updateMyProfile(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const name = String(formData.get("name") ?? "").trim();
  const birthdate = String(formData.get("birthdate") ?? "").trim() || null;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;

  if (!name) throw new Error("El nombre no puede quedar vacío.");

  const { error } = await supabase
    .from("users")
    .update({ name, birthdate, phone, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
    .eq("id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/perfil");
}
