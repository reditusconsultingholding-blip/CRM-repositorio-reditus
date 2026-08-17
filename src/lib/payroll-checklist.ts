import "server-only";
import { createClient } from "@/lib/supabase/server";
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

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

/** Nómina de la semana pasada (lunes a domingo anterior al actual) — cada
 * persona tiene su PROPIA tarifa (user_payroll_rates), no una por rol —
 * dos personas con el mismo rol pueden ganar distinto. El "día de pago" de
 * referencia es el sábado de esa semana. Se auto-genera/actualiza en
 * payroll_payments cada vez que se consulta (mientras no esté marcada como
 * pagada), así siempre refleja el trabajo real entregado. Las personas
 * activas sin tarifa configurada se listan aparte para que el CEO la
 * complete en la pestaña Nómina. */
export async function getWeeklyPayrollChecklist(): Promise<{
  weekStart: string;
  weekEnd: string;
  dueDate: string;
  limitDate: string;
  items: ChecklistItem[];
  sinConfigurar: { userId: string; name: string; role: string }[];
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

  const [rateCop, { data: users }, { data: rates }, { data: videoRows }, { data: landingRows }, { data: existing }] =
    await Promise.all([
      getUsdCopRate(),
      supabase.from("users").select("id, name, role").eq("active", true).neq("role", "ceo"),
      supabase.from("user_payroll_rates").select("user_id, modo, monto, moneda, activo"),
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
  const rateByUser = new Map((rates ?? []).map((r) => [r.user_id, r]));

  const items: ChecklistItem[] = [];
  const sinConfigurar: { userId: string; name: string; role: string }[] = [];

  for (const u of users ?? []) {
    const rateRow = rateByUser.get(u.id);
    if (!rateRow) {
      sinConfigurar.push({ userId: u.id, name: u.name, role: ROLE_LABELS_LOCAL[u.role] ?? u.role });
      continue;
    }
    if (rateRow.activo === false) continue; // excluido de nómina a propósito

    const montoUsd = rateRow.moneda === "COP" ? Number(rateRow.monto) / rate : Number(rateRow.monto);
    let amount = 0;
    let detalle = "";

    if (rateRow.modo === "semanal_fijo") {
      amount = montoUsd;
      detalle = `Salario semanal fijo (${fmtUsd(montoUsd)})`;
    } else {
      // por_pieza: video para editor_video, landing/publicación para programador.
      const n = u.role === "editor_video" ? (videoCounts.get(u.id) ?? 0) : (landingCounts.get(u.id) ?? 0);
      const unidad = u.role === "editor_video" ? "video(s)" : "página(s)";
      amount = n * montoUsd;
      detalle = `${n} ${unidad} × ${fmtUsd(montoUsd)}`;
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

    // Ventana real de pago: sábado a lunes (dueDate es el sábado) — recién
    // se considera tarde a partir del martes.
    const DAY_MS = 24 * 60 * 60 * 1000;
    const graceEndMs = dueDate.getTime() + 3 * DAY_MS; // fin del lunes

    const paid = existingRow?.paid ?? false;
    const paidAt = existingRow?.paid_at ?? null;
    let isLate: boolean | null = null;
    let daysLate = 0;
    if (paid && paidAt) {
      const paidDate = new Date(paidAt);
      const diffMs = paidDate.getTime() - graceEndMs;
      isLate = diffMs > 0;
      daysLate = isLate ? Math.ceil(diffMs / DAY_MS) : 0;
    } else if (!paid && now.getTime() > graceEndMs) {
      isLate = true;
      daysLate = Math.ceil((now.getTime() - graceEndMs) / DAY_MS);
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

  const limitDate = new Date(dueDate);
  limitDate.setUTCDate(limitDate.getUTCDate() + 2); // lunes — fin de la ventana sábado-lunes

  return {
    weekStart: isoDate(weekStart),
    weekEnd: isoDate(weekEndInclusive),
    dueDate: isoDate(dueDate),
    limitDate: isoDate(limitDate),
    items,
    sinConfigurar,
  };
}
