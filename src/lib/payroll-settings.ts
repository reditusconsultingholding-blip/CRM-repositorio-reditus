import "server-only";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PAYROLL, type PayrollSettings } from "@/lib/payroll";

type PayrollRow = {
  elevenlabs_usd_mes: number;
  google_storage_usd_mes: number;
};

function fromRow(r: PayrollRow): PayrollSettings {
  return {
    elevenLabsUsdMes: Number(r.elevenlabs_usd_mes),
    googleStorageUsdMes: Number(r.google_storage_usd_mes),
  };
}

/** Lee los costos fijos de SaaS desde la base de datos. Si la tabla aún no
 * existe o no hay fila, cae de vuelta a los valores por defecto en vez de
 * romper el Panel CEO. Los sueldos por persona viven en
 * user_payroll_rates, no aquí. */
export async function getPayrollSettings(): Promise<PayrollSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("payroll_settings")
      .select("elevenlabs_usd_mes, google_storage_usd_mes")
      .eq("id", true)
      .single();
    if (error || !data) return DEFAULT_PAYROLL;
    return fromRow(data as PayrollRow);
  } catch {
    return DEFAULT_PAYROLL;
  }
}
