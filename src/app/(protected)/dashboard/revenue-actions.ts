"use server";

import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Suma de ingresos entre dos fechas (inclusive), en formato YYYY-MM-DD.
 * Para un solo día, pasa la misma fecha en start y end. */
export async function getRevenueForRange(
  start: string,
  end: string,
): Promise<{ total: number; count: number; error?: string }> {
  try {
    const profile = await requireProfile();
    if (!(INGRESOS_ROLES as string[]).includes(profile.role)) {
      return { total: 0, count: 0, error: "No tienes acceso a esta información." };
    }
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("ingresos")
      .select("precio_final_descuento")
      .gte("fecha", start)
      .lte("fecha", end);

    if (error) return { total: 0, count: 0, error: error.message };

    const total = (data ?? []).reduce((sum, r) => sum + Number(r.precio_final_descuento ?? 0), 0);
    return { total, count: data?.length ?? 0 };
  } catch (err) {
    return { total: 0, count: 0, error: err instanceof Error ? err.message : "No se pudo consultar." };
  }
}
