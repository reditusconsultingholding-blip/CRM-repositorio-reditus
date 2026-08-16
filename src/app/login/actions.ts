"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
