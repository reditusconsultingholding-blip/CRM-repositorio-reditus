import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export type { UserRole } from "@/lib/roles";
export { ROLE_LABELS, INGRESOS_ROLES, ADMIN_ROLES } from "@/lib/roles";

export type Profile = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  avatar_url: string | null;
  birthdate: string | null;
  phone: string | null;
};

/** Server-side helper: returns the signed-in user's profile or redirects to /login.
 * Con cache() de React, el layout y la página que se pintan en la misma
 * petición comparten UNA consulta en vez de repetirla cada uno (en acciones y
 * rutas de API no hay nada que compartir y se consulta siempre). */
export const requireProfile = cache(async function requireProfile(): Promise<Profile> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("id, name, email, role, active, avatar_url, birthdate, phone")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  return profile as Profile;
});
