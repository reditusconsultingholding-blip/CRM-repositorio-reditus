import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthCalendar, type DiaData } from "@/components/dashboard/month-calendar";
import { LiveSync } from "@/components/live-sync";
import { RevenueExplorer } from "@/components/dashboard/revenue-explorer";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";

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
    videoAbiertos,
    landingAbiertos,
    videoTotal,
    landingTotal,
    usdCop,
  ] = await Promise.all([
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("precio_final_descuento, moneda", { count: "exact" })
          .eq("fecha", today)
      : Promise.resolve({ data: [], count: 0 }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("fecha, precio_final_descuento, moneda")
          .gte("fecha", monthStart)
          .lt("fecha", monthEnd)
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
      .eq("pipeline", "video"),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "landing"),
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
  let totalMes = 0;
  for (const row of ingresosMes.data ?? []) {
    const key = row.fecha as string;
    const monto = ingresoToUsd(row.precio_final_descuento, row.moneda, rateCop);
    totalMes += monto;
    if (!calendarData[key]) calendarData[key] = { count: 0, total: 0 };
    calendarData[key].count += 1;
    calendarData[key].total += monto;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Hola, {profile.name.split(" ")[0]}
        </h1>
        <LiveSync tables={["ingresos", "requerimientos"]} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <MonthCalendar year={now.getFullYear()} month={now.getMonth()} data={calendarData} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
