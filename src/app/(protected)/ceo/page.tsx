import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PAYROLL, SEMANAS_POR_MES, salarioFijoSemanal, fijosMensualesUsd } from "@/lib/payroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { CeoAssistant } from "@/components/ceo/ceo-assistant";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

// Semana ISO: lunes 00:00 (UTC) → lunes siguiente 00:00 (UTC). Aproximado —
// no ajusta por zona horaria de Colombia, suficiente para una vista gerencial.
function weekBounds(d: Date) {
  const day = d.getUTCDay(); // 0=domingo
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

function monthBounds(d: Date) {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function getUsdCopRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 1800 } });
    const data = await res.json();
    return data?.result === "success" ? (data.rates.COP as number) : null;
  } catch {
    return null;
  }
}

export default async function CeoPage() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") redirect("/dashboard");

  const supabase = await createClient();
  const now = new Date();
  const { start: weekStart, end: weekEnd } = weekBounds(now);
  const { start: monthStart, end: monthEnd } = monthBounds(now);

  const [
    { data: ingresosSemana },
    { data: ingresosMes },
    { count: videosSemanaCount },
    { count: videosMesCount },
    { count: landingsSemanaCount },
    { count: landingsMesCount },
    usdCop,
  ] = await Promise.all([
    supabase
      .from("ingresos")
      .select("precio_final_descuento")
      .gte("fecha", isoDate(weekStart))
      .lt("fecha", isoDate(weekEnd)),
    supabase
      .from("ingresos")
      .select("precio_final_descuento")
      .gte("fecha", isoDate(monthStart))
      .lt("fecha", isoDate(monthEnd)),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "video")
      .eq("estado", "Terminado")
      .gte("updated_at", weekStart.toISOString())
      .lt("updated_at", weekEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "video")
      .eq("estado", "Terminado")
      .gte("updated_at", monthStart.toISOString())
      .lt("updated_at", monthEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "landing")
      .eq("estado", "Terminado")
      .gte("updated_at", weekStart.toISOString())
      .lt("updated_at", weekEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("id", { count: "exact", head: true })
      .eq("pipeline", "landing")
      .eq("estado", "Terminado")
      .gte("updated_at", monthStart.toISOString())
      .lt("updated_at", monthEnd.toISOString()),
    getUsdCopRate(),
  ]);

  const ingresosSemanaUsd = (ingresosSemana ?? []).reduce(
    (s, r) => s + Number(r.precio_final_descuento ?? 0),
    0,
  );
  const ingresosMesUsd = (ingresosMes ?? []).reduce(
    (s, r) => s + Number(r.precio_final_descuento ?? 0),
    0,
  );

  const costoFijoSemanal = salarioFijoSemanal();
  const costoFijoMensual = fijosMensualesUsd();
  const costoFijoProrrateadoSemana = costoFijoMensual / SEMANAS_POR_MES;

  const rateCop = usdCop ?? 4000; // fallback conservador si la API externa falla
  const videosSemana = videosSemanaCount ?? 0;
  const videosMes = videosMesCount ?? 0;
  const landingsSemana = landingsSemanaCount ?? 0;
  const landingsMes = landingsMesCount ?? 0;

  const costoVideoSemana = videosSemana * PAYROLL.editorVideoUsdPorVideo;
  const costoVideoMes = videosMes * PAYROLL.editorVideoUsdPorVideo;
  const costoProgramadorSemanaUsd = (landingsSemana * PAYROLL.programadorCopPorPagina) / rateCop;
  const costoProgramadorMesUsd = (landingsMes * PAYROLL.programadorCopPorPagina) / rateCop;

  const costoTotalSemana = costoFijoSemanal + costoFijoProrrateadoSemana + costoVideoSemana + costoProgramadorSemanaUsd;
  const costoTotalMes = costoFijoSemanal * SEMANAS_POR_MES + costoFijoMensual + costoVideoMes + costoProgramadorMesUsd;

  const rentabilidadSemana = ingresosSemanaUsd - costoTotalSemana;
  const rentabilidadMes = ingresosMesUsd - costoTotalMes;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Panel CEO</h1>
        <p className="text-sm text-muted-foreground">
          Visible solo para ti. Nómina y rentabilidad calculadas automáticamente.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Esta semana</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Ingresos (ventas)" value={fmtUsd(ingresosSemanaUsd)} />
            <Row
              label="Salarios fijos (diseñadora, GC, PM)"
              value={`-${fmtUsd(costoFijoSemanal)}`}
            />
            <Row
              label="Costos fijos SaaS (prorrateado)"
              value={`-${fmtUsd(costoFijoProrrateadoSemana)}`}
            />
            <Row
              label={`Editor de video (${videosSemana} entregados × $${PAYROLL.editorVideoUsdPorVideo})`}
              value={`-${fmtUsd(costoVideoSemana)}`}
            />
            <Row
              label={`Programador (${landingsSemana} páginas × $${PAYROLL.programadorCopPorPagina.toLocaleString("es-CO")} COP)`}
              value={`-${fmtUsd(costoProgramadorSemanaUsd)}`}
            />
            <Separator className="my-1" />
            <Row label="Costo total" value={`-${fmtUsd(costoTotalSemana)}`} bold />
            <Row
              label="Rentabilidad"
              value={fmtUsd(rentabilidadSemana)}
              bold
              positive={rentabilidadSemana >= 0}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Este mes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <Row label="Ingresos (ventas)" value={fmtUsd(ingresosMesUsd)} />
            <Row
              label="Salarios fijos (aprox., 4.345 semanas)"
              value={`-${fmtUsd(costoFijoSemanal * SEMANAS_POR_MES)}`}
            />
            <Row label="Costos fijos SaaS (ElevenLabs + Google Storage)" value={`-${fmtUsd(costoFijoMensual)}`} />
            <Row
              label={`Editor de video (${videosMes} entregados × $${PAYROLL.editorVideoUsdPorVideo})`}
              value={`-${fmtUsd(costoVideoMes)}`}
            />
            <Row
              label={`Programador (${landingsMes} páginas × $${PAYROLL.programadorCopPorPagina.toLocaleString("es-CO")} COP)`}
              value={`-${fmtUsd(costoProgramadorMesUsd)}`}
            />
            <Separator className="my-1" />
            <Row label="Costo total" value={`-${fmtUsd(costoTotalMes)}`} bold />
            <Row
              label="Rentabilidad"
              value={fmtUsd(rentabilidadMes)}
              bold
              positive={rentabilidadMes >= 0}
            />
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        Tasa USD→COP usada: {Math.round(rateCop).toLocaleString("es-CO")}
        {!usdCop && " (no se pudo consultar en vivo, se usó un valor de respaldo)"}.{" "}
        &quot;Entregado&quot; = requerimiento en estado &quot;Terminado&quot; esta semana/mes. Ajusta
        las cifras de nómina en{" "}
        <code>src/lib/payroll.ts</code> si cambian.
      </p>

      <CeoAssistant />
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  positive,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span
        className={`font-mono ${bold ? "font-semibold" : ""} ${
          positive === true ? "text-green-600" : positive === false ? "text-red-600" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
