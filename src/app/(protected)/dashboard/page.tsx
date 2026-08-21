import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthCalendar, type DiaData, type DiaDetalle } from "@/components/dashboard/month-calendar";
import { LiveSync } from "@/components/live-sync";
import { RevenueExplorer } from "@/components/dashboard/revenue-explorer";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";
import { PIPELINES } from "@/lib/statuses";

function normalizeJoin<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canSeeIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = nextMonth.toISOString().slice(0, 10);

  const [
    ingresosHoy,
    ingresosMes,
    entregasDelMes,
    recordatoriosDelMes,
    videoAbiertos,
    landingAbiertos,
    claudeAbiertos,
    videoTotal,
    landingTotal,
    claudeTotal,
    usdCop,
  ] = await Promise.all([
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("precio_final_descuento, moneda", { count: "exact" })
          .eq("estado_comercial", "Cerrado")
          .eq("fecha", today)
      : Promise.resolve({ data: [], count: 0 }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("fecha, producto, precio_final_descuento, moneda, client:clients!ingresos_client_id_fkey(name)")
          .eq("estado_comercial", "Cerrado")
          .gte("fecha", monthStart)
          .lt("fecha", monthEnd)
      : Promise.resolve({ data: [] }),
    canSeeIngresos
      ? supabase
          .from("requerimientos")
          .select(
            "nombre_producto, pipeline, f_entrega_prometida, encargado:users(name), ingreso:ingresos(client:clients!ingresos_client_id_fkey(name))",
          )
          .not("estado", "in", '("ENTREGADO","Terminado")')
          .not("f_entrega_prometida", "is", null)
          .gte("f_entrega_prometida", monthStart)
          .lt("f_entrega_prometida", monthEnd)
      : Promise.resolve({ data: [] }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("producto, recordatorio_fecha, recordatorio_nota, recordatorio_enviado, client:clients!ingresos_client_id_fkey(name)")
          .not("recordatorio_fecha", "is", null)
          .gte("recordatorio_fecha", monthStart)
          .lt("recordatorio_fecha", monthEnd)
      : Promise.resolve({ data: [] }),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "video")
      .not("estado", "in", '("ENTREGADO","Terminado")'),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "landing")
      .not("estado", "in", '("ENTREGADO","Terminado")'),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "claude")
      .not("estado", "in", '("ENTREGADO","Terminado")'),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "video"),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "landing"),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "claude"),
    getUsdCopRate(),
  ]);

  const rateCop = usdCop ?? 4000;

  function fmtCop(n: number) {
    return `${Math.round(n * rateCop).toLocaleString("es-CO")} COP`;
  }
  function fmtUsd(n: number) {
    return n.toLocaleString("es-CO", { style: "currency", currency: "USD" });
  }

  const totalHoy =
    (ingresosHoy.data ?? []).reduce(
      (sum, r) => sum + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
      0,
    ) || 0;

  const calendarData: Record<string, DiaData> = {};
  const detalle: Record<string, DiaDetalle> = {};
  function getDetalle(key: string): DiaDetalle {
    if (!detalle[key]) detalle[key] = { ingresos: [], entregas: [], recordatorios: [] };
    return detalle[key];
  }

  let totalMes = 0;
  for (const row of ingresosMes.data ?? []) {
    const key = row.fecha as string;
    const monto = ingresoToUsd(row.precio_final_descuento, row.moneda, rateCop);
    totalMes += monto;
    if (!calendarData[key]) calendarData[key] = { count: 0, total: 0 };
    calendarData[key].count += 1;
    calendarData[key].total += monto;

    const cliente = normalizeJoin(row.client)?.name ?? "Cliente";
    getDetalle(key).ingresos.push({ cliente, producto: row.producto ?? "—", monto });
  }

  for (const row of entregasDelMes.data ?? []) {
    const key = String(row.f_entrega_prometida);
    const pipelineLabel = PIPELINES.find((p) => p.value === row.pipeline)?.label ?? row.pipeline;
    const cliente = normalizeJoin(normalizeJoin(row.ingreso)?.client)?.name ?? "Cliente";
    getDetalle(key).entregas.push({
      producto: row.nombre_producto,
      cliente,
      pipeline: pipelineLabel,
      encargado: normalizeJoin(row.encargado)?.name ?? null,
    });
  }

  for (const row of recordatoriosDelMes.data ?? []) {
    const key = String(row.recordatorio_fecha).slice(0, 10);
    const cliente = normalizeJoin(row.client)?.name ?? "Cliente";
    getDetalle(key).recordatorios.push({
      nota: row.recordatorio_nota,
      producto: row.producto ?? "—",
      cliente,
      enviado: row.recordatorio_enviado,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Hola, {profile.name.split(" ")[0]}
        </h1>
        <LiveSync tables={["ingresos", "requerimientos"]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {canSeeIngresos && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos de hoy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{fmtCop(totalHoy)}</p>
              <p className="text-sm font-medium text-muted-foreground">{fmtUsd(totalHoy)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {ingresosHoy.count ?? 0} pedido(s) registrados hoy
              </p>
            </CardContent>
          </Card>
        )}
        {canSeeIngresos && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Ingresos del mes
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{fmtCop(totalMes)}</p>
              <p className="text-sm font-medium text-muted-foreground">{fmtUsd(totalMes)}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {(ingresosMes.data ?? []).length} pedido(s) este mes
              </p>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Videos en curso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{videoAbiertos.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">de {videoTotal.count ?? 0} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Landing pages en curso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{landingAbiertos.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">de {landingTotal.count ?? 0} totales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Claude en curso
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{claudeAbiertos.count ?? 0}</p>
            <p className="text-sm text-muted-foreground">de {claudeTotal.count ?? 0} totales</p>
          </CardContent>
        </Card>
      </div>

      {canSeeIngresos && <RevenueExplorer />}

      {canSeeIngresos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ingresos de{" "}
              {now.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthCalendar year={now.getFullYear()} month={now.getMonth()} data={calendarData} detalle={detalle} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
