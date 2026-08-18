import "server-only";
import { createClient } from "@/lib/supabase/server";

export type GastoFijo = { id: string; nombre: string; montoUsd: number };

/** Gastos fijos mensuales (SaaS y similares) — el CEO los administra
 * libremente desde el Panel CEO. Si la tabla no existe todavía o falla la
 * consulta, cae de vuelta a lista vacía en vez de romper el Panel CEO. */
export async function getGastosFijos(): Promise<{ items: GastoFijo[]; totalUsd: number }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("gastos_fijos").select("id, nombre, monto_usd").order("nombre");
    if (error || !data) return { items: [], totalUsd: 0 };
    const items = data.map((r) => ({ id: r.id, nombre: r.nombre, montoUsd: Number(r.monto_usd) }));
    return { items, totalUsd: items.reduce((s, i) => s + i.montoUsd, 0) };
  } catch {
    return { items: [], totalUsd: 0 };
  }
}
