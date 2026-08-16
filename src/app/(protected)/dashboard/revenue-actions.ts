"use server";

import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Suma de ingresos entre dos fechas (inclusive), en formato YYYY-MM-DD.
 * Para un solo día, pasa la misma fecha en start y end. */
export async function getRevenueForRange(start: string, end: string) {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
    throw new Error("No tienes acceso a esta información.");
  }
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ingresos")
    .select("precio_final_descuento")
    .gte("fecha", start)
    .lte("fecha", end);

  if (error) throw new Error(error.message);

  const total = (data ?? []).reduce((sum, r) => sum + Number(r.precio_final_descuento ?? 0), 0);
  return { total, count: data?.length ?? 0 };
}
