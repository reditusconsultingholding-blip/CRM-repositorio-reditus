"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  // Solo cierra la sesión de este equipo; el celular y los demás navegadores siguen abiertos.
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login?salio=1");
}
