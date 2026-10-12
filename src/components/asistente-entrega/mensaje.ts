import { TIPO_LABELS, fechaLarga } from "@/lib/capacidad";
import type { DatosMensaje, ItemPedido } from "./tipos";

export function describirItems(items: ItemPedido[]): string {
  const partes = items.map((it) => {
    const l = TIPO_LABELS[it.tipo];
    if (it.tipo === "otro") return it.producto ?? "el proyecto";
    const masculino = it.tipo === "video";
    if (it.cantidad === 1) return `${masculino ? "el" : "la"} ${l.uno}`;
    return `${masculino ? "los" : "las"} ${it.cantidad} ${l.varios}`;
  });
  if (partes.length === 0) return "el proyecto";
  if (partes.length === 1) return partes[0];
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

export function copTexto(n: number): string {
  return `$${Math.round(n).toLocaleString("es-CO")} COP`;
}

/** Mensaje de plantilla: lo que se muestra cuando la IA no está o falla.
 * Tres redacciones que rotan con «Regenerar». Sin promesas de resultados. */
export function mensajePlantilla(d: DatosMensaje): string {
  const nombre = d.cliente ? ` ${d.cliente.split(" ")[0]}` : "";
  const que = describirItems(d.items);
  const cuando = fechaLarga(d.fecha);
  const precio = d.precioCop ? ` El valor sería de ${copTexto(d.precioCop)}.` : "";

  const variantes = [
    `Hola${nombre}, ¿cómo estás? Ya revisé la agenda del equipo: la entrega de ${que} sería el ${cuando}.${precio} Cualquier cosa que necesites en el camino, me escribes por aquí.`,
    `Hola${nombre}, ¿cómo vas? Te confirmo: con lo que tenemos en producción, te entregaríamos ${que} el ${cuando}.${precio} Apenas arranquemos te voy contando cómo va.`,
    `Hola${nombre}, ¡qué gusto saludarte! Ya te tengo fecha: tendríamos ${que} para el ${cuando}.${precio} Quedo pendiente por si tienes alguna duda.`,
  ];
  return variantes[Math.abs(d.variante) % variantes.length];
}
