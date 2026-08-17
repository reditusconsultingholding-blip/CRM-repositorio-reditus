"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

type AttendanceRow = { id: string; clock_in: string; clock_out: string | null };
type ActionResult = { data?: AttendanceRow; error?: string };

/** Marca la entrada del usuario actual. Si ya tiene una marca abierta hoy
 * (sin clock_out), no crea una nueva — devuelve la existente. */
export async function clockIn(): Promise<ActionResult> {
  try {
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

    if (open) return { data: open };

    const { data, error } = await supabase
      .from("attendance")
      .insert({ user_id: profile.id })
      .select("id, clock_in, clock_out")
      .single();

    if (error) return { error: error.message };
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo marcar la entrada." };
  }
}

export async function clockOut(id: string): Promise<ActionResult> {
  try {
    const profile = await requireProfile();
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("attendance")
      .update({ clock_out: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", profile.id)
      .select("id, clock_in, clock_out")
      .single();

    if (error) return { error: error.message };
    return { data };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo marcar la salida." };
  }
}
