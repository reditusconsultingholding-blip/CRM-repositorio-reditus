import "server-only";
import { createClient } from "@/lib/supabase/server";
import { REQUERIMIENTO_TERMINADOS } from "@/lib/statuses";
import type { ChatMsg, VentasPipelineItem, VentasPipelineStage } from "@/lib/ventas-pipeline-types";

export type { ChatMsg, VentasPipelineItem, VentasPipelineStage } from "@/lib/ventas-pipeline-types";
export { STAGE_LABELS } from "@/lib/ventas-pipeline-types";

/** Todo lo que llega por la línea de ventas de WhatsApp, agrupado en un
 * pipeline: interesados → agendados → convertidos a cliente → con
 * requerimientos pendientes → compraron (ya pagaron) — o descartados.
 * Permite ver el hilo completo de cada conversación y apagar el bot para
 * que un humano tome el control. */
export async function getVentasPipeline(): Promise<VentasPipelineItem[]> {
  const supabase = await createClient();

  const { data: prospectos } = await supabase
    .from("prospectos")
    .select("id, nombre, whatsapp_number, estado, bot_activo, historial_whatsapp, client_id, updated_at")
    .eq("origen", "whatsapp")
    .order("updated_at", { ascending: false });

  const clientIds = [...new Set((prospectos ?? []).map((p) => p.client_id).filter(Boolean))] as string[];

  const comproByClient = new Map<string, boolean>();
  const pendienteByClient = new Set<string>();

  if (clientIds.length > 0) {
    const { data: ingresos } = await supabase
      .from("ingresos")
      .select("id, client_id, estado_comercial")
      .in("client_id", clientIds);

    for (const ing of ingresos ?? []) {
      if (ing.estado_comercial === "Cerrado") comproByClient.set(ing.client_id, true);
    }

    const ingresoIds = (ingresos ?? []).map((i) => i.id);
    const ingresoToClient = new Map((ingresos ?? []).map((i) => [i.id, i.client_id]));

    if (ingresoIds.length > 0) {
      const { data: reqs } = await supabase
        .from("requerimientos")
        .select("ingreso_id, estado")
        .in("ingreso_id", ingresoIds);

      for (const r of reqs ?? []) {
        if (!REQUERIMIENTO_TERMINADOS.includes(r.estado) && r.ingreso_id) {
          const cid = ingresoToClient.get(r.ingreso_id);
          if (cid) pendienteByClient.add(cid);
        }
      }
    }
  }

  return (prospectos ?? []).map((p) => {
    const historial = ((p.historial_whatsapp as ChatMsg[] | null) ?? []).slice(-40);

    let stage: VentasPipelineStage = "interesados";
    if (p.estado === "descartado") {
      stage = "descartados";
    } else if (p.client_id) {
      if (pendienteByClient.has(p.client_id)) stage = "pendientes";
      else if (comproByClient.get(p.client_id)) stage = "compraron";
      else stage = "convertidos";
    } else if (p.estado === "agendado") {
      stage = "agendados";
    }

    return {
      id: p.id,
      nombre: p.nombre,
      whatsappNumber: p.whatsapp_number,
      estado: p.estado,
      botActivo: p.bot_activo ?? true,
      historial,
      stage,
      clientId: p.client_id,
      updatedAt: p.updated_at,
    };
  });
}
