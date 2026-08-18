"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function signIn(_prevState: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "No se pudo conectar con el servidor. Intenta de nuevo en unos segundos." };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Supabase devuelve "Invalid login credentials" cuando el correo/clave
    // son incorrectos. Cualquier otro error (proyecto pausado, red caída,
    // etc.) es un problema distinto y no debe confundirse con eso.
    if (error.message.toLowerCase().includes("invalid login credentials")) {
      return { error: "Correo o contraseña incorrectos." };
    }
    return {
      error: "No se pudo iniciar sesión por un problema del servidor. Intenta de nuevo en unos segundos; si persiste, avisa al administrador.",
    };
  }

  redirect("/dashboard");
}

type EmailStatus =
  | { found: true; active: boolean; passwordSet: boolean }
  | { found: false };

/** Primer paso del login (solo correo) — revisa si existe, si la cuenta
 * está activa, y si ya tiene contraseña creada o es la primera vez que
 * esta persona entra (para mostrarle "crea tu contraseña" en vez de
 * pedirle una que nunca ha existido). */
export async function checkEmailStatus(email: string): Promise<EmailStatus> {
  const clean = email.trim().toLowerCase();
  if (!clean) return { found: false };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("users")
    .select("active, password_set")
    .eq("email", clean)
    .maybeSingle();

  // Si la migración que agrega password_set todavía no se corrió en
  // producción, no queremos bloquear a NADIE para iniciar sesión — se
  // cae de vuelta al flujo normal (asume que ya tiene contraseña).
  if (error) {
    const { data: fallback } = await admin
      .from("users")
      .select("active")
      .eq("email", clean)
      .maybeSingle();
    if (!fallback) return { found: false };
    return { found: true, active: fallback.active, passwordSet: true };
  }

  if (!data) return { found: false };
  return { found: true, active: data.active, passwordSet: data.password_set ?? true };
}

type ActionResult = { error?: string } | undefined;

/** Segundo paso para alguien que nunca ha creado contraseña — la crea y
 * de una vez lo deja con sesión iniciada, para no pedirle que la vuelva a
 * escribir en la pantalla normal de login. */
export async function createPasswordAndSignIn(email: string, password: string): Promise<ActionResult> {
  const clean = email.trim().toLowerCase();
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, active, password_set")
    .eq("email", clean)
    .maybeSingle();

  if (!profile) return { error: "Ese correo no está registrado. Pídele acceso al administrador." };
  if (!profile.active) return { error: "Esta cuenta está desactivada. Contacta al administrador." };
  // Blindaje: esta acción solo sirve para crear la PRIMERA contraseña, no
  // como puerta trasera para cambiar una que ya existe.
  if (profile.password_set) {
    return { error: "Esta cuenta ya tiene contraseña — usa el inicio de sesión normal." };
  }

  const { error: pwError } = await admin.auth.admin.updateUserById(profile.id, { password });
  if (pwError) return { error: pwError.message };

  const { error: flagError } = await admin.from("users").update({ password_set: true }).eq("id", profile.id);
  if (flagError) return { error: flagError.message };

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return { error: "Contraseña creada, pero no se pudo iniciar sesión automáticamente — entra de nuevo con tu correo y contraseña." };
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({ email: clean, password });
  if (signInError) {
    return { error: "Contraseña creada, pero no se pudo iniciar sesión automáticamente — entra de nuevo con tu correo y contraseña." };
  }

  redirect("/dashboard");
}
