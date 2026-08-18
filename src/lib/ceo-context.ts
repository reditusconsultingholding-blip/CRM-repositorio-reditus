import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/roles";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";

/** Contexto extendido del negocio para el asistente del CEO: top clientes,
 * pipeline de prospectos y equipo — más allá de solo rentabilidad/nómina,
 * para que pueda dar consejo estratégico real, no solo leer números. */
export async function buildExtendedBusinessContext(): Promise<string> {
  const supabase = await createClient();

  const [{ data: clients }, { data: ingresos }, { data: historicos }, { data: prospectos }, { data: team }, usdCop] =
    await Promise.all([
      supabase.from("clients").select("id, name"),
      supabase.from("ingresos").select("client_id, precio_final_descuento, moneda").eq("estado_comercial", "Cerrado"),
      supabase.from("historical_ingresos").select("client_id, precio_usd_aprox"),
      supabase.from("prospectos").select("estado"),
      supabase.from("users").select("name, role").eq("active", true).neq("role", "ceo"),
      getUsdCopRate(),
    ]);

  const rateCop = usdCop ?? 4000;
  const spendByClient = new Map<string, number>();
  for (const r of ingresos ?? []) {
    if (!r.client_id) continue;
    spendByClient.set(
      r.client_id,
      (spendByClient.get(r.client_id) ?? 0) + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
    );
  }
  for (const r of historicos ?? []) {
    if (!r.client_id) continue;
    spendByClient.set(r.client_id, (spendByClient.get(r.client_id) ?? 0) + Number(r.precio_usd_aprox ?? 0));
  }

  const topClients = (clients ?? [])
    .map((c) => ({ name: c.name, total: spendByClient.get(c.id) ?? 0 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const prospectosPorEstado = new Map<string, number>();
  for (const p of prospectos ?? []) {
    prospectosPorEstado.set(p.estado, (prospectosPorEstado.get(p.estado) ?? 0) + 1);
  }

  const teamLines = (team ?? [])
    .map((u) => `${u.name} (${ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role})`)
    .join(", ");

  const lines = [
    topClients.length
      ? `Top clientes por gasto total (actual + histórico): ${topClients
          .map((c) => `${c.name} ($${c.total.toFixed(0)})`)
          .join(", ")}.`
      : "Todavía no hay datos de gasto por cliente.",
    prospectosPorEstado.size
      ? `Pipeline de prospectos: ${[...prospectosPorEstado.entries()].map(([e, n]) => `${n} ${e}`).join(", ")}.`
      : "Sin prospectos registrados todavía (WhatsApp de ventas aún no conectado; Calendly sincroniza automáticamente cuando alguien agenda).",
    teamLines ? `Equipo activo: ${teamLines}.` : "Sin equipo activo registrado.",
  ];

  return lines.join("\n");
}
