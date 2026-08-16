"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Marca la entrada del usuario actual. Si ya tiene una marca abierta hoy
 * (sin clock_out), no crea una nueva — devuelve la existente. */
export async function clockIn() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: open } = await supabase
    .from("attendance")
    .select("id, clock_in, clock_out")
    .eq("user_id", profile.id)
    .gte("clock_in", todayStart.toISOString())
    .is("clock_out", null)
    .maybeSingle();

  if (open) return open;

  const { data, error } = await supabase
    .from("attendance")
    .insert({ user_id: profile.id })
    .select("id, clock_in, clock_out")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function clockOut(id: string) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attendance")
    .update({ clock_out: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", profile.id)
    .select("id, clock_in, clock_out")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
