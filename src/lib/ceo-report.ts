import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SEMANAS_POR_MES, salarioFijoSemanal, fijosMensualesUsd } from "@/lib/payroll";
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
  editorVideoUsdPorVideo: number;
  programadorCopPorPagina: number;
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
 * IA, así todos ven exactamente los mismos números en todo momento. La
 * nómina se lee de payroll_settings (editable desde /ceo), no de un valor
 * fijo en el código. */
export async function computeCeoReport(): Promise<CeoReport> {
  const supabase = await createClient();
  const now = new Date();
  const { start: weekStart, end: weekEnd } = weekBounds(now);
  const { start: monthStart, end: monthEnd } = monthBounds(now);

  const [
    settings,
    { data: ingresosSemana },
    { data: ingresosMes },
    { count: videosSemanaCount },
    { count: videosMesCount },
    { count: landingsSemanaCount },
    { count: landingsMesCount },
    { count: abiertosVideoCount },
    { count: abiertosLandingCount },
    usdCop,
  ] = await Promise.all([
    getPayrollSettings(),
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

  const ingresosSemanaUsd = (ingresosSemana ?? []).reduce(
    (s, r) => s + Number(r.precio_final_descuento ?? 0),
    0,
  );
  const ingresosMesUsd = (ingresosMes ?? []).reduce(
    (s, r) => s + Number(r.precio_final_descuento ?? 0),
    0,
  );

  const costoFijoSemanal = salarioFijoSemanal(settings);
  const costoFijoMensual = fijosMensualesUsd(settings);
  const costoFijoProrrateadoSemana = costoFijoMensual / SEMANAS_POR_MES;

  const rateCop = usdCop ?? 4000;
  const videosSemana = videosSemanaCount ?? 0;
  const videosMes = videosMesCount ?? 0;
  const landingsSemana = landingsSemanaCount ?? 0;
  const landingsMes = landingsMesCount ?? 0;

  const costoVideoSemana = videosSemana * settings.editorVideoUsdPorVideo;
  const costoVideoMes = videosMes * settings.editorVideoUsdPorVideo;
  const costoProgramadorSemanaUsd = (landingsSemana * settings.programadorCopPorPagina) / rateCop;
  const costoProgramadorMesUsd = (landingsMes * settings.programadorCopPorPagina) / rateCop;

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
    editorVideoUsdPorVideo: settings.editorVideoUsdPorVideo,
    programadorCopPorPagina: settings.programadorCopPorPagina,
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
    `Costo total esta semana: ${fmtUsd(r.costoTotalSemana)} (salarios fijos ${fmtUsd(r.costoFijoSemanal)}, SaaS prorrateado ${fmtUsd(r.costoFijoProrrateadoSemana)}, editor de video ${r.videosSemana} videos × $${r.editorVideoUsdPorVideo} = ${fmtUsd(r.costoVideoSemana)}, programador ${r.landingsSemana} páginas × ${r.programadorCopPorPagina} COP = ${fmtUsd(r.costoProgramadorSemanaUsd)}).`,
    `Costo total este mes: ${fmtUsd(r.costoTotalMes)}.`,
    `Rentabilidad de esta semana: ${fmtUsd(r.rentabilidadSemana)}. Rentabilidad de este mes: ${fmtUsd(r.rentabilidadMes)}.`,
    `Requerimientos abiertos (sin terminar) ahora mismo: ${r.requerimientosAbiertosVideo} de video, ${r.requerimientosAbiertosLanding} de landing pages.`,
    `Tasa USD→COP usada: ${Math.round(r.rateCop).toLocaleString("es-CO")}${r.rateCopIsLive ? "" : " (valor de respaldo, no se pudo consultar en vivo)"}.`,
  ].join("\n");
}
