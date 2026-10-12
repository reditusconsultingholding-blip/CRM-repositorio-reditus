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

/** El ingreso con huella abre la sesión directo en el navegador, sin pasar
 * por `entrar`. Antes de dejar pasar se confirma aquí que la cuenta exista
 * y siga activa; si no, se cierra la sesión recién abierta. */
export async function validarSesionHuella(): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: perfil } = await createAdminClient().from("users").select("active").eq("id", user.id).maybeSingle();
  if (!perfil?.active) {
    await supabase.auth.signOut();
    return { ok: false };
  }
  return { ok: true };
}

export type GoogleState =
  | { error: string }
  | { registrar: true; correo: string; nombre: string }
  | { pendiente: true; correo: string }
  | undefined;

/** Ingreso con Google: se comprueba el token de Google y se busca el usuario del CRM
 * con ese correo (o su alias). Si existe y está activo, se le abre la sesión. Si no
 * existe, se le devuelve `registrar` para que pida acceso eligiendo su rol; nadie
 * entra hasta que el CEO lo acepte en Usuarios. */
export async function entrarConGoogle(credential: string): Promise<GoogleState> {
  const { datosDeGoogle } = await import("@/lib/google-token");
  const { GOOGLE_ALIAS } = await import("@/lib/google-login");

  const google = await datosDeGoogle(String(credential ?? ""));
  if (!google) return { error: "No pudimos comprobar tu cuenta de Google. Intenta de nuevo." };
  const email = GOOGLE_ALIAS[google.email] ?? google.email;

  const admin = createAdminClient();
  const { data: perfil } = await admin.from("users").select("id, active").eq("email", email).maybeSingle();
  if (!perfil) return { registrar: true, correo: google.email, nombre: google.name };
  if (!perfil.active) {
    const { data: cuenta } = await admin.auth.admin.getUserById(perfil.id);
    if (cuenta?.user?.app_metadata?.solicitud === "pendiente") return { pendiente: true, correo: google.email };
    return { error: "Esta cuenta está desactivada. Contacta al administrador." };
  }

  const { data: enlace, error: errEnlace } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const token_hash = enlace?.properties?.hashed_token;
  if (errEnlace || !token_hash) return { error: "No se pudo iniciar sesión por un problema del servidor. Intenta de nuevo en unos segundos." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ token_hash, type: "magiclink" });
  if (error) return { error: "No se pudo iniciar sesión por un problema del servidor. Intenta de nuevo en unos segundos." };

  redirect("/dashboard");
}

const ROLES_SOLICITABLES = ["gerente_comercial", "directora_operativa", "editor_video", "disenador_landing", "programador"];

/** Registro con Google: la persona (ya comprobada por Google) dice su nombre y su rol.
 * Se crea la cuenta DESACTIVADA y marcada como solicitud pendiente, y se avisa al CEO.
 * No abre sesión: solo entra cuando el CEO la acepte. */
export async function solicitarAcceso(credential: string, nombre: string, rol: string): Promise<GoogleState> {
  const { datosDeGoogle } = await import("@/lib/google-token");
  const { GOOGLE_ALIAS } = await import("@/lib/google-login");
  const { ROLE_LABELS } = await import("@/lib/roles");
  const { notify } = await import("@/lib/notify");

  const google = await datosDeGoogle(String(credential ?? ""));
  if (!google) return { error: "Tu sesión de Google venció. Toca otra vez «Continuar con Google»." };
  const email = GOOGLE_ALIAS[google.email] ?? google.email;
  const name = String(nombre ?? "").trim().slice(0, 80);
  if (name.length < 3) return { error: "Escribe tu nombre completo." };
  if (!ROLES_SOLICITABLES.includes(rol)) return { error: "Elige tu rol." };

  const admin = createAdminClient();
  const { data: existe } = await admin.from("users").select("id").eq("email", email).maybeSingle();
  if (existe) return { pendiente: true, correo: google.email };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    app_metadata: { solicitud: "pendiente" },
    user_metadata: { name },
  });
  if (error || !data.user) return { error: "No se pudo enviar la solicitud. Intenta de nuevo en unos segundos." };

  const { error: errPerfil } = await admin
    .from("users")
    .insert({ id: data.user.id, name, email, role: rol, active: false, password_set: false });
  if (errPerfil) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "No se pudo enviar la solicitud. Intenta de nuevo en unos segundos." };
  }

  const { data: ceos } = await admin.from("users").select("id").eq("role", "ceo").eq("active", true);
  const etiqueta = ROLE_LABELS[rol as keyof typeof ROLE_LABELS] ?? rol;
  for (const c of ceos ?? []) {
    await notify(admin, c.id, "nuevo_pedido", `${name} pidió acceso como ${etiqueta}`, "/admin/usuarios");
  }

  return { pendiente: true, correo: google.email };
}
