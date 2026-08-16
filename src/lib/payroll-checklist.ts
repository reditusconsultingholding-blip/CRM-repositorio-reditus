import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPayrollSettings } from "@/lib/payroll-settings";
import { getUsdCopRate, weekBounds, isoDate } from "@/lib/ceo-report";

export type ChecklistItem = {
  userId: string;
  name: string;
  role: string;
  amountUsd: number;
  detalle: string;
  paid: boolean;
  paidAt: string | null;
  dueDate: string;
  isLate: boolean | null; // null = aún no pagado y no vencido
  daysLate: number;
};

const ROLE_LABELS_LOCAL: Record<string, string> = {
  gerente_comercial: "Gerente Comercial",
  directora_operativa: "Directora Operativa",
  disenador_landing: "Diseñador de Landing",
  editor_video: "Editor de Video",
  programador: "Programador",
};

/** Nómina de la semana pasada (lunes a domingo anterior al actual) — cada
 * persona con su monto calculado según su rol, si ya se le pagó, y si fue a
 * tiempo. El "día de pago" de referencia es el sábado de esa semana (misma
 * convención que ya usa Sebastian). Se auto-genera/actualiza en
 * payroll_payments cada vez que se consulta (mientras no esté marcada como
 * pagada), así siempre refleja el trabajo real entregado. */
export async function getWeeklyPayrollChecklist(): Promise<{
  weekStart: string;
  weekEnd: string;
  dueDate: string;
  items: ChecklistItem[];
}> {
  const supabase = await createClient();
  const now = new Date();
  const { start: thisWeekStart } = weekBounds(now);
  const weekStart = new Date(thisWeekStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  const weekEnd = new Date(thisWeekStart); // exclusivo
  const weekEndInclusive = new Date(weekEnd);
  weekEndInclusive.setUTCDate(weekEndInclusive.getUTCDate() - 1);
  const dueDate = new Date(weekStart);
  dueDate.setUTCDate(dueDate.getUTCDate() + 5); // sábado de esa semana

  const [settings, rateCop, { data: users }, { data: videoRows }, { data: landingRows }, { data: existing }] =
    await Promise.all([
      getPayrollSettings(),
      getUsdCopRate(),
      supabase.from("users").select("id, name, role").eq("active", true).neq("role", "ceo"),
      supabase
        .from("requerimientos")
        .select("encargado_id")
        .eq("pipeline", "video")
        .eq("estado", "Terminado")
        .gte("updated_at", weekStart.toISOString())
        .lt("updated_at", weekEnd.toISOString()),
      supabase
        .from("requerimientos")
        .select("programador_id")
        .eq("pipeline", "landing")
        .eq("estado", "Terminado")
        .gte("updated_at", weekStart.toISOString())
        .lt("updated_at", weekEnd.toISOString()),
      supabase.from("payroll_payments").select("*").eq("week_start", isoDate(weekStart)),
    ]);

  const rate = rateCop ?? 4000;
  const videoCounts = new Map<string, number>();
  for (const r of videoRows ?? []) {
    if (!r.encargado_id) continue;
    videoCounts.set(r.encargado_id, (videoCounts.get(r.encargado_id) ?? 0) + 1);
  }
  const landingCounts = new Map<string, number>();
  for (const r of landingRows ?? []) {
    if (!r.programador_id) continue;
    landingCounts.set(r.programador_id, (landingCounts.get(r.programador_id) ?? 0) + 1);
  }
  const existingByUser = new Map((existing ?? []).map((p) => [p.user_id, p]));

  const items: ChecklistItem[] = [];

  for (const u of users ?? []) {
    let amount = 0;
    let detalle = "";

    switch (u.role) {
      case "gerente_comercial":
        amount = settings.gerenteComercialUsdDia * settings.diasPorSemana;
        detalle = `Salario fijo (${settings.diasPorSemana} días × $${settings.gerenteComercialUsdDia})`;
        break;
      case "directora_operativa":
        amount = settings.projectManagerUsdDia * settings.diasPorSemana;
        detalle = `Salario fijo (${settings.diasPorSemana} días × $${settings.projectManagerUsdDia})`;
        break;
      case "disenador_landing":
        amount = settings.disenadoraLandingUsdDia * settings.diasPorSemana;
        detalle = `Salario fijo (${settings.diasPorSemana} días × $${settings.disenadoraLandingUsdDia})`;
        break;
      case "editor_video": {
        const n = videoCounts.get(u.id) ?? 0;
        amount = n * settings.editorVideoUsdPorVideo;
        detalle = `${n} video(s) entregado(s) × $${settings.editorVideoUsdPorVideo}`;
        break;
      }
      case "programador": {
        const n = landingCounts.get(u.id) ?? 0;
        const usdPorPagina = settings.programadorCopPorPagina / rate;
        amount = n * usdPorPagina;
        detalle = `${n} página(s) publicada(s) × $${usdPorPagina.toFixed(2)}`;
        break;
      }
      default:
        continue; // roles sin regla de nómina definida (ninguno actualmente)
    }

    const existingRow = existingByUser.get(u.id);

    if (!existingRow) {
      await supabase
        .from("payroll_payments")
        .insert({ user_id: u.id, week_start: isoDate(weekStart), amount_usd: amount, detalle })
        .select()
        .maybeSingle();
    } else if (!existingRow.paid && Math.abs(Number(existingRow.amount_usd) - amount) > 0.01) {
      await supabase
        .from("payroll_payments")
        .update({ amount_usd: amount, detalle })
        .eq("id", existingRow.id);
    }

    const paid = existingRow?.paid ?? false;
    const paidAt = existingRow?.paid_at ?? null;
    let isLate: boolean | null = null;
    let daysLate = 0;
    if (paid && paidAt) {
      const paidDate = new Date(paidAt);
      const diffMs = paidDate.getTime() - dueDate.getTime() - 24 * 60 * 60 * 1000; // gracia hasta fin del sábado
      isLate = diffMs > 0;
      daysLate = isLate ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;
    } else if (!paid && now.getTime() > dueDate.getTime() + 24 * 60 * 60 * 1000) {
      isLate = true;
      daysLate = Math.ceil((now.getTime() - dueDate.getTime() - 24 * 60 * 60 * 1000) / (24 * 60 * 60 * 1000));
    }

    items.push({
      userId: u.id,
      name: u.name,
      role: ROLE_LABELS_LOCAL[u.role] ?? u.role,
      amountUsd: amount,
      detalle,
      paid,
      paidAt,
      dueDate: isoDate(dueDate),
      isLate,
      daysLate,
    });
  }

  return {
    weekStart: isoDate(weekStart),
    weekEnd: isoDate(weekEndInclusive),
    dueDate: isoDate(dueDate),
    items,
  };
}
