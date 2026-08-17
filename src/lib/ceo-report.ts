import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SEMANAS_POR_MES, fijosMensualesUsd } from "@/lib/payroll";
import { getPayrollSettings } from "@/lib/payroll-settings";

// Semana ISO: lunes 00:00 (UTC) → lunes siguiente 00:00 (UTC). Aproximado —
// no ajusta por zona horaria de Colombia, suficiente para una vista gerencial.
export function weekBounds(d: Date) {
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

export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Convierte un valor de ingreso a USD según su moneda guardada — los
 * ingresos en COP se guardan en pesos tal cual, y hay que pasarlos a USD
 * para poder sumarlos con el resto (todos los reportes son en USD). */
export function ingresoToUsd(precio: number | null, moneda: string | null | undefined, rateCop: number): number {
  const v = Number(precio ?? 0);
  return moneda === "COP" ? v / rateCop : v;
}

export async function getUsdCopRate(): Promise<number | null> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 300 } });
    const data = await res.json();
    return data?.result === "success" ? (data.rates.COP as number) : null;
  } catch {
    return null;
  }
}

export type CeoReport = {
  ingresosSemanaUsd: number;
  ingresosMesUsd: number;
  videosSemana: number;
  videosMes: number;
  landingsSemana: number;
  landingsMes: number;
  rateCop: number;
  rateCopIsLive: boolean;
  costoFijoSemanal: number;
  costoFijoMensual: number;
  costoFijoProrrateadoSemana: number;
  costoVideoSemana: number;
  costoVideoMes: number;
  costoProgramadorSemanaUsd: number;
  costoProgramadorMesUsd: number;
  costoTotalSemana: number;
  costoTotalMes: number;
  rentabilidadSemana: number;
  rentabilidadMes: number;
  requerimientosAbiertosVideo: number;
  requerimientosAbiertosLanding: number;
};

/** Calcula el reporte completo de negocio (semana + mes) — misma fuente de
 * datos para el Panel CEO, el widget de la barra lateral y el asistente de
 * IA, así todos ven exactamente los mismos números en todo momento. Cada
 * persona tiene su PROPIA tarifa (user_payroll_rates) — dos personas con el
 * mismo rol pueden ganar distinto, así que el costo se suma persona por
 * persona, no por un valor único de rol. */
export async function computeCeoReport(): Promise<CeoReport> {
  const supabase = await createClient();
  const now = new Date();
  const { start: weekStart, end: weekEnd } = weekBounds(now);
  const { start: monthStart, end: monthEnd } = monthBounds(now);

  const [
    settings,
    { data: ingresosSemana },
    { data: ingresosMes },
    { data: users },
    { data: rates },
    { data: videoRowsSemana },
    { data: videoRowsMes },
    { data: landingRowsSemana },
    { data: landingRowsMes },
    { count: abiertosVideoCount },
    { count: abiertosLandingCount },
    usdCop,
  ] = await Promise.all([
    getPayrollSettings(),
    supabase
      .from("ingresos")
      .select("precio_final_descuento, moneda")
      .gte("fecha", isoDate(weekStart))
      .lt("fecha", isoDate(weekEnd)),
    supabase
      .from("ingresos")
      .select("precio_final_descuento, moneda")
      .gte("fecha", isoDate(monthStart))
      .lt("fecha", isoDate(monthEnd)),
    supabase.from("users").select("id, role").eq("active", true).eq("incluir_en_nomina", true).neq("role", "ceo"),
    supabase.from("user_payroll_rates").select("user_id, modo, monto, moneda"),
    supabase
      .from("requerimientos")
      .select("encargado_id")
      .eq("pipeline", "video")
      .eq("estado", "Terminado")
      .gte("updated_at", weekStart.toISOString())
      .lt("updated_at", weekEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("encargado_id")
      .eq("pipeline", "video")
      .eq("estado", "Terminado")
      .gte("updated_at", monthStart.toISOString())
      .lt("updated_at", monthEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("programador_id")
      .eq("pipeline", "landing")
      .eq("estado", "Terminado")
      .gte("updated_at", weekStart.toISOString())
      .lt("updated_at", weekEnd.toISOString()),
    supabase
      .from("requerimientos")
      .select("programador_id")
      .eq("pipeline", "landing")
      .eq("estado", "Terminado")
      .gte("updated_at", monthStart.toISOString())
      .lt("updated_at", monthEnd.toISOString()),
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
    getUsdCopRate(),
  ]);

  const rateCop = usdCop ?? 4000;

  const ingresosSemanaUsd = (ingresosSemana ?? []).reduce(
    (s, r) => s + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
    0,
  );
  const ingresosMesUsd = (ingresosMes ?? []).reduce(
    (s, r) => s + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
    0,
  );

  function countBy(rows: { encargado_id?: string | null; programador_id?: string | null }[] | null, key: "encargado_id" | "programador_id") {
    const map = new Map<string, number>();
    for (const r of rows ?? []) {
      const id = r[key];
      if (!id) continue;
      map.set(id, (map.get(id) ?? 0) + 1);
    }
    return map;
  }

  const videoCountsSemana = countBy(videoRowsSemana, "encargado_id");
  const videoCountsMes = countBy(videoRowsMes, "encargado_id");
  const landingCountsSemana = countBy(landingRowsSemana, "programador_id");
  const landingCountsMes = countBy(landingRowsMes, "programador_id");

  const rateByUser = new Map((rates ?? []).map((r) => [r.user_id, r]));

  let costoFijoSemanal = 0;
  let costoVideoSemana = 0;
  let costoVideoMes = 0;
  let costoProgramadorSemanaUsd = 0;
  let costoProgramadorMesUsd = 0;

  for (const u of users ?? []) {
    const rateRow = rateByUser.get(u.id);
    if (!rateRow) continue;
    const montoUsd = rateRow.moneda === "COP" ? Number(rateRow.monto) / rateCop : Number(rateRow.monto);

    if (rateRow.modo === "semanal_fijo") {
      costoFijoSemanal += montoUsd;
    } else if (u.role === "editor_video") {
      costoVideoSemana += (videoCountsSemana.get(u.id) ?? 0) * montoUsd;
      costoVideoMes += (videoCountsMes.get(u.id) ?? 0) * montoUsd;
    } else if (u.role === "programador") {
      costoProgramadorSemanaUsd += (landingCountsSemana.get(u.id) ?? 0) * montoUsd;
      costoProgramadorMesUsd += (landingCountsMes.get(u.id) ?? 0) * montoUsd;
    }
  }

  const costoFijoMensual = fijosMensualesUsd(settings);
  const costoFijoProrrateadoSemana = costoFijoMensual / SEMANAS_POR_MES;

  const videosSemana = [...videoCountsSemana.values()].reduce((a, b) => a + b, 0);
  const videosMes = [...videoCountsMes.values()].reduce((a, b) => a + b, 0);
  const landingsSemana = [...landingCountsSemana.values()].reduce((a, b) => a + b, 0);
  const landingsMes = [...landingCountsMes.values()].reduce((a, b) => a + b, 0);

  const costoTotalSemana =
    costoFijoSemanal + costoFijoProrrateadoSemana + costoVideoSemana + costoProgramadorSemanaUsd;
  const costoTotalMes =
    costoFijoSemanal * SEMANAS_POR_MES + costoFijoMensual + costoVideoMes + costoProgramadorMesUsd;

  return {
    ingresosSemanaUsd,
    ingresosMesUsd,
    videosSemana,
    videosMes,
    landingsSemana,
    landingsMes,
    rateCop,
    rateCopIsLive: usdCop != null,
    costoFijoSemanal,
    costoFijoMensual,
    costoFijoProrrateadoSemana,
    costoVideoSemana,
    costoVideoMes,
    costoProgramadorSemanaUsd,
    costoProgramadorMesUsd,
    costoTotalSemana,
    costoTotalMes,
    rentabilidadSemana: ingresosSemanaUsd - costoTotalSemana,
    rentabilidadMes: ingresosMesUsd - costoTotalMes,
    requerimientosAbiertosVideo: abiertosVideoCount ?? 0,
    requerimientosAbiertosLanding: abiertosLandingCount ?? 0,
  };
}

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Convierte el reporte a texto plano para dárselo como contexto vivo al
 * asistente de IA — se recalcula en cada mensaje, así siempre responde con
 * los números actuales, no con una foto vieja. */
export function formatCeoReportText(r: CeoReport): string {
  return [
    `Ingresos de esta semana: ${fmtUsd(r.ingresosSemanaUsd)}. Ingresos de este mes: ${fmtUsd(r.ingresosMesUsd)}.`,
    `Costo total esta semana: ${fmtUsd(r.costoTotalSemana)} (salarios fijos ${fmtUsd(r.costoFijoSemanal)}, SaaS prorrateado ${fmtUsd(r.costoFijoProrrateadoSemana)}, editores de video ${r.videosSemana} entregados = ${fmtUsd(r.costoVideoSemana)}, programadores ${r.landingsSemana} páginas = ${fmtUsd(r.costoProgramadorSemanaUsd)}).`,
    `Costo total este mes: ${fmtUsd(r.costoTotalMes)}.`,
    `Rentabilidad de esta semana: ${fmtUsd(r.rentabilidadSemana)}. Rentabilidad de este mes: ${fmtUsd(r.rentabilidadMes)}.`,
    `Requerimientos abiertos (sin terminar) ahora mismo: ${r.requerimientosAbiertosVideo} de video, ${r.requerimientosAbiertosLanding} de landing pages.`,
    `Tasa USD→COP usada: ${Math.round(r.rateCop).toLocaleString("es-CO")}${r.rateCopIsLive ? "" : " (valor de respaldo, no se pudo consultar en vivo)"}.`,
  ].join("\n");
}
