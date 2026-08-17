"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { error?: string } | undefined;

export async function changeMyPassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { error: "No autenticado." };

    if (newPassword.length < 8) {
      return { error: "La nueva contraseña debe tener al menos 8 caracteres." };
    }

    // Verificamos la contraseña actual re-autenticando antes de cambiarla.
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) return { error: "La contraseña actual no es correcta." };

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function changeMyEmail(currentPassword: string, newEmail: string): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return { error: "No autenticado." };

    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return { error: "Correo inválido." };

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (signInError) return { error: "La contraseña actual no es correcta." };

    // Se cambia directo (sin correo de confirmación) usando el cliente admin,
    // igual que hace el CEO al crear cuentas — este proyecto no tiene envío
    // de correos configurado todavía.
    const admin = createAdminClient();
    const { error: authError } = await admin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
    });
    if (authError) return { error: authError.message };

    const { error: profileError } = await admin.from("users").update({ email }).eq("id", user.id);
    if (profileError) return { error: profileError.message };

    revalidatePath("/perfil");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateMyProfile(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { error: "No autenticado." };

    const name = String(formData.get("name") ?? "").trim();
    const birthdate = String(formData.get("birthdate") ?? "").trim() || null;
    const phone = String(formData.get("phone") ?? "").trim() || null;
    const avatarUrl = String(formData.get("avatar_url") ?? "").trim() || null;

    if (!name) return { error: "El nombre no puede quedar vacío." };

    const { error } = await supabase
      .from("users")
      .update({ name, birthdate, phone, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
      .eq("id", user.id);
    if (error) return { error: error.message };

    revalidatePath("/perfil");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}
