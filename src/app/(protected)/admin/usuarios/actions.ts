"use server";

import { revalidatePath } from "next/cache";
import { requireProfile, ADMIN_ROLES, type UserRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Next.js oculta el mensaje real de cualquier `throw` dentro de una Server
// Action en producción (por seguridad) y lo reemplaza por un texto
// genérico ("Minified React error #441") — por eso estas acciones NUNCA
// lanzan para errores esperados, siempre devuelven { error: "..." } y el
// componente que las llama decide qué mostrar. redirect()/notFound() (si
// se usaran) deben quedar FUERA de cualquier try/catch para no romperse.
type ActionResult = { error?: string } | undefined;

export async function createUser(formData: FormData): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    if (!(ADMIN_ROLES as string[]).includes(profile.role)) {
      return { error: "Solo el CEO puede administrar usuarios." };
    }

    const admin = createAdminClient();
    const email = String(formData.get("email") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "") as UserRole;

    if (!email || !name || !role) {
      return { error: "Completa todos los campos." };
    }

    // Sin contraseña — la persona crea la suya la primera vez que entra a
    // /login con su correo (ver checkEmailStatus/createPasswordAndSignIn).
    const { data, error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) return { error: error.message };

    const { error: profileError } = await admin
      .from("users")
      .insert({ id: data.user.id, name, email, role, password_set: false });

    if (profileError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return { error: profileError.message };
    }

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function setUserActive(id: string, active: boolean): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    if (!(ADMIN_ROLES as string[]).includes(profile.role)) {
      return { error: "Solo el CEO puede administrar usuarios." };
    }
    const admin = createAdminClient();
    const { error } = await admin.from("users").update({ active }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function updateUserRole(id: string, role: UserRole): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    if (!(ADMIN_ROLES as string[]).includes(profile.role)) {
      return { error: "Solo el CEO puede administrar usuarios." };
    }
    const admin = createAdminClient();
    const { error } = await admin.from("users").update({ role }).eq("id", id);
    if (error) return { error: error.message };
    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." };
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const profile = await requireProfile();
  try {
    if (!(ADMIN_ROLES as string[]).includes(profile.role)) {
      return { error: "Solo el CEO puede administrar usuarios." };
    }
    if (id === profile.id) {
      return { error: "No puedes borrar tu propia cuenta." };
    }

    const admin = createAdminClient();

    // Borrar en Auth cae en cascada a public.users. Si eso falla (cuenta con
    // historial referenciado, error de red del lado de Supabase Auth, etc.)
    // se desactiva como respaldo y se informa el motivo real.
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      try {
        await admin.from("users").update({ active: false }).eq("id", id);
      } catch {
        // si ni siquiera esto funciona, igual informamos el error original abajo
      }
      return {
        error: `No se pudo borrar del todo (${error.message || "error de Supabase"}). Se dejó desactivada mientras tanto.`,
      };
    }

    revalidatePath("/admin/usuarios");
    return {};
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    try {
      const admin = createAdminClient();
      await admin.from("users").update({ active: false }).eq("id", id);
    } catch {
      // ignorar — ya vamos a informar el error original
    }
    return {
      error: `No se pudo borrar del todo (${detail || "error de Supabase"}). Se dejó desactivada mientras tanto.`,
    };
  }
}
