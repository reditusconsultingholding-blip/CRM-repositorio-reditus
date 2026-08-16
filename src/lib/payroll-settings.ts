import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAYROLL, type PayrollSettings } from "@/lib/payroll";

type PayrollRow = {
  disenadora_landing_usd_dia: number;
  gerente_comercial_usd_dia: number;
  project_manager_usd_dia: number;
  dias_por_semana: number;
  editor_video_usd_por_video: number;
  programador_cop_por_pagina: number;
  elevenlabs_usd_mes: number;
  google_storage_usd_mes: number;
};

function fromRow(r: PayrollRow): PayrollSettings {
  return {
    disenadoraLandingUsdDia: Number(r.disenadora_landing_usd_dia),
    gerenteComercialUsdDia: Number(r.gerente_comercial_usd_dia),
    projectManagerUsdDia: Number(r.project_manager_usd_dia),
    diasPorSemana: Number(r.dias_por_semana),
    editorVideoUsdPorVideo: Number(r.editor_video_usd_por_video),
    programadorCopPorPagina: Number(r.programador_cop_por_pagina),
    elevenLabsUsdMes: Number(r.elevenlabs_usd_mes),
    googleStorageUsdMes: Number(r.google_storage_usd_mes),
  };
}

/** Lee la nómina configurable desde la base de datos. Si la tabla aún no
 * existe (migración 0007 pendiente) o no hay fila, cae de vuelta a los
 * valores por defecto en vez de romper el Panel CEO. */
export async function getPayrollSettings(): Promise<PayrollSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("payroll_settings").select("*").eq("id", true).single();
    if (error || !data) return DEFAULT_PAYROLL;
    return fromRow(data as PayrollRow);
  } catch {
    return DEFAULT_PAYROLL;
  }
}
