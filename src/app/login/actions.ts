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

// ---------- Ingreso en un solo paso + recuperación de contraseña ----------

export type EntrarState = { error?: string; crear?: boolean; email?: string } | undefined;

/** Correo y contraseña en la misma pantalla. Si la persona nunca ha creado
 * contraseña, no se intenta el ingreso: se le devuelve `crear` para que la
 * pantalla le muestre «crea tu contraseña». */
export async function entrar(_prev: EntrarState, formData: FormData): Promise<EntrarState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escribe tu correo." };

  const status = await checkEmailStatus(email);
  if (!status.found) return { error: "Ese correo no está registrado. Pídele acceso al administrador.", email };
  if (!status.active) return { error: "Esta cuenta está desactivada. Contacta al administrador.", email };
  if (!status.passwordSet) return { crear: true, email };

  const result = await signIn(undefined, formData);
  return result ? { ...result, email } : undefined;
}

export type RecuperarState = { error?: string; enviado?: boolean } | undefined;

/** Envía el correo de recuperación. La respuesta es la misma exista o no el
 * correo, para no revelar quién tiene cuenta. */
export async function enviarRecuperacion(_prev: RecuperarState, formData: FormData): Promise<RecuperarState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "Escribe tu correo." };

  const status = await checkEmailStatus(email);
  if (status.found && status.active) {
    const { headers } = await import("next/headers");
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "www.crmreditusconsulting.company";
    const proto = h.get("x-forwarded-proto") ?? "https";
    try {
      const supabase = await createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${proto}://${host}/login/confirmar`,
      });
      if (error) {
        if (/rate|limit|seconds/i.test(error.message)) {
          return { error: "Ya te enviamos un correo hace un momento. Espera un minuto y vuelve a intentarlo." };
        }
        return { error: "No se pudo enviar el correo. Intenta de nuevo en unos segundos." };
      }
    } catch {
      return { error: "No se pudo conectar con el servidor. Intenta de nuevo en unos segundos." };
    }
  }
  return { enviado: true };
}

/** Último paso de la recuperación: la persona ya llegó con la sesión que
 * abre el enlace del correo y escribe su contraseña nueva. */
export async function cambiarClave(_prev: { error?: string } | undefined, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };
  if (password !== confirm) return { error: "Las contraseñas no coinciden." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "El enlace venció o ya se usó. Pide uno nuevo desde «¿Olvidaste tu contraseña?»." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo guardar la contraseña. Intenta de nuevo." };

  // Por si la cuenta nunca había creado contraseña: ya la tiene.
  await createAdminClient().from("users").update({ password_set: true }).eq("id", user.id);

  redirect("/dashboard");
}
