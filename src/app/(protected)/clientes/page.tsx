import { redirect } from "next/navigation";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";
import { ClientesTable, type ClienteRow } from "@/components/clientes/clientes-table";
import { LiveSync } from "@/components/live-sync";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function fmtCop(n: number) {
  return `${Math.round(n).toLocaleString("es-CO")} COP`;
}

export default async function ClientesPage() {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) redirect("/dashboard");

  const supabase = await createClient();

  const [{ data: clients }, { data: ingresos }, { data: historicos }, usdCop] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, whatsapp_number, country, tax_id, historico_pedidos_ajuste, historico_gasto_ajuste_usd")
      .order("name"),
    supabase.from("ingresos").select("client_id, precio_final_descuento, moneda"),
    // Puede no existir todavía si la migración 0002b/histórica no se ha corrido —
    // se maneja con gracia en vez de romper la página.
    supabase.from("historical_ingresos").select("client_id, precio_usd_aprox"),
    getUsdCopRate(),
  ]);

  const rateCop = usdCop ?? 4000;

  const actualByClient = new Map<string, { total: number; count: number }>();
  for (const r of ingresos ?? []) {
    if (!r.client_id) continue;
    const cur = actualByClient.get(r.client_id) ?? { total: 0, count: 0 };
    cur.total += ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop);
    cur.count += 1;
    actualByClient.set(r.client_id, cur);
  }

  const historicoByClient = new Map<string, { total: number; count: number }>();
  for (const r of historicos ?? []) {
    if (!r.client_id) continue;
    const cur = historicoByClient.get(r.client_id) ?? { total: 0, count: 0 };
    cur.total += Number(r.precio_usd_aprox ?? 0);
    cur.count += 1;
    historicoByClient.set(r.client_id, cur);
  }

  const rows: ClienteRow[] = (clients ?? [])
    .map((c) => {
      const actual = actualByClient.get(c.id) ?? { total: 0, count: 0 };
      const historico = historicoByClient.get(c.id) ?? { total: 0, count: 0 };
      // Si el CEO/Gerente Comercial dejó un ajuste manual, ese número manda
      // sobre el calculado desde la importación histórica.
      const pedidosHistoricos = c.historico_pedidos_ajuste ?? historico.count;
      const gastoHistorico = c.historico_gasto_ajuste_usd ?? historico.total;
      return {
        ...c,
        pedidosActuales: actual.count,
        gastoActual: actual.total,
        pedidosHistoricos,
        gastoHistorico,
        gastoTotal: actual.total + gastoHistorico,
      };
    })
    .sort((a, b) => b.gastoTotal - a.gastoTotal);

  const granTotal = rows.reduce((s, r) => s + r.gastoTotal, 0);
  const historicoDisponible = historicos != null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Base de datos de clientes</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} clientes · {fmtUsd(granTotal)} · {fmtCop(granTotal * rateCop)} en gasto total (actual +
            histórico)
          </p>
        </div>
        <LiveSync tables={["clients", "ingresos"]} />
      </div>

      {!historicoDisponible && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          El histórico 2024-2026 todavía no se ha importado — esta vista solo muestra los ingresos
          registrados directamente en la app.
        </p>
      )}

      <ClientesTable rows={rows} rateCop={rateCop} />
    </div>
  );
}
