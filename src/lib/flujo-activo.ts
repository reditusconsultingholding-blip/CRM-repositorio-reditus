import "server-only";
import { createClient } from "@/lib/supabase/server";

export type FlujoItemRole = "comercial" | "operativa" | "landing" | "video" | "programador";

export type FlujoItem = {
  id: string;
  tipo: "ingreso" | "requerimiento";
  trackingId: string | null;
  titulo: string;
  estado: string;
  role: FlujoItemRole;
  etapaLabel: string;
  responsableId: string | null;
  responsableNombre: string | null;
  href: string;
};

/** Todo lo que sigue "vivo" ahora mismo — ingresos sin pagar y
 * requerimientos sin terminar — con quién es el responsable en este
 * momento y qué color/etapa le corresponde. Es la fuente de datos tanto
 * del "Flujo general" (todo el mundo) como de "Mi flujo" (filtrado por
 * usuario) en /flujo. */
export async function getFlujoActivo(): Promise<FlujoItem[]> {
  const supabase = await createClient();

  const [{ data: ingresos }, { data: requerimientos }] = await Promise.all([
    supabase
      .from("ingresos")
      .select("id, tracking_id, producto, estado_pago, responsable:users(id, name), client:clients(name)")
      .neq("estado_pago", "Pagado")
      .order("created_at", { ascending: false }),
    supabase
      .from("requerimientos")
      .select(
        "id, pipeline, estado, nombre_producto, encargado_id, programador_id, encargado:users!requerimientos_encargado_id_fkey(id, name), programador:users!requerimientos_programador_id_fkey(id, name), ingreso:ingresos(tracking_id)",
      )
      .not("estado", "in", '("ENTREGADO","SUBIDA")')
      .order("created_at", { ascending: false }),
  ]);

  const items: FlujoItem[] = [];

  for (const r of ingresos ?? []) {
    const responsable = Array.isArray(r.responsable) ? r.responsable[0] : r.responsable;
    const client = Array.isArray(r.client) ? r.client[0] : r.client;
    items.push({
      id: `ingreso-${r.id}`,
      tipo: "ingreso",
      trackingId: r.tracking_id,
      titulo: `${client?.name ?? "Cliente"} — ${r.producto ?? "pedido"}`,
      estado: r.estado_pago,
      role: "comercial",
      etapaLabel: "Comercial (cotización/cierre/pago)",
      responsableId: responsable?.id ?? null,
      responsableNombre: responsable?.name ?? null,
      href: "/ingresos",
    });
  }

  for (const r of requerimientos ?? []) {
    const encargado = Array.isArray(r.encargado) ? r.encargado[0] : r.encargado;
    const programador = Array.isArray(r.programador) ? r.programador[0] : r.programador;
    const ingreso = Array.isArray(r.ingreso) ? r.ingreso[0] : r.ingreso;

    let role: FlujoItemRole = "operativa";
    let etapaLabel = "Operaciones (información/agenda)";
    let responsableId: string | null = null;
    let responsableNombre: string | null = null;

    if (r.estado === "Corregir") {
      role = "operativa";
      etapaLabel = "Correcciones";
      responsableId = encargado?.id ?? null;
      responsableNombre = encargado?.name ?? null;
    } else if (r.estado === "Por revisión") {
      role = "operativa";
      etapaLabel = "Revisión";
      responsableId = encargado?.id ?? null;
      responsableNombre = encargado?.name ?? null;
    } else if (r.estado === "POR SUBIR") {
      role = "programador";
      etapaLabel = "Entrega (publicar)";
      responsableId = programador?.id ?? encargado?.id ?? null;
      responsableNombre = programador?.name ?? encargado?.name ?? null;
    } else if (r.estado === "Terminado") {
      role = r.pipeline === "video" ? "video" : "programador";
      etapaLabel = "Entrega";
      responsableId = encargado?.id ?? null;
      responsableNombre = encargado?.name ?? null;
    } else if (r.estado === "En progreso") {
      role = r.pipeline === "video" ? "video" : "landing";
      etapaLabel = "Producción";
      responsableId = encargado?.id ?? null;
      responsableNombre = encargado?.name ?? null;
    } else if (encargado) {
      role = "operativa";
      etapaLabel = "Agenda (asignado, por empezar)";
      responsableId = encargado.id;
      responsableNombre = encargado.name;
    } else {
      role = "operativa";
      etapaLabel = "Información (sin asignar)";
    }

    items.push({
      id: `req-${r.id}`,
      tipo: "requerimiento",
      trackingId: ingreso?.tracking_id ?? null,
      titulo: r.nombre_producto ?? "Requerimiento",
      estado: r.estado,
      role,
      etapaLabel,
      responsableId,
      responsableNombre,
      href: `/requerimientos/${r.id}`,
    });
  }

  return items;
}
