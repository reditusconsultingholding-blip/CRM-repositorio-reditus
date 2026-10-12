import type { ResultadoEntrega, TipoServicio } from "@/lib/capacidad";

export const TIPOS_SERVICIO: TipoServicio[] = ["video", "landing", "imagenes", "pagina_marca", "cro", "otro"];

export const TIPO_NOMBRES: Record<TipoServicio, string> = {
  video: "Videos",
  landing: "Landing page",
  imagenes: "Imágenes",
  pagina_marca: "Página de marca",
  cro: "Optimización / CRO",
  otro: "Otro",
};

export type ItemPedido = {
  tipo: TipoServicio;
  cantidad: number;
  producto: string | null;
};

export type Pedido = {
  cliente: string | null;
  items: ItemPedido[];
  urgente: boolean;
};

export type PrecioSugerido = {
  tipo: TipoServicio;
  cantidad: number;
  /** "historial" = sale de trabajos cobrados; "referencia" = precio de lista; "sin_datos" = nada que mostrar. */
  base: "historial" | "referencia" | "sin_datos";
  /** Total sugerido para la cantidad pedida. */
  totalCop: number | null;
  totalUsd: number | null;
  minCop: number | null;
  maxCop: number | null;
  /** Trabajos parecidos usados. */
  n: number;
  nApp: number;
  nHistorico: number;
  /** Precio de lista (referencia), si existe para este tipo. */
  referenciaCop: number | null;
  referenciaNota: string | null;
  detalle: string;
};

export type RespuestaAsistente = {
  pedido: Pedido;
  hoy: string;
  entregas: ResultadoEntrega[];
  /** La más lejana de las fechas de los ítems. */
  fecha: string | null;
  /** Fecha si el pedido se pasa por delante de la cola. */
  fechaSinCola: string | null;
  precios: PrecioSugerido[];
  totalCop: number | null;
  totalUsd: number | null;
  rateCop: number;
  mensaje: string;
  /** Cómo se entendió el dictado. */
  interpretadoCon: "ia" | "reglas" | "manual";
  avisos: string[];
};

export type DatosMensaje = {
  cliente: string | null;
  items: ItemPedido[];
  fecha: string;
  /** Total en COP, solo si se quiere mencionar el precio. */
  precioCop: number | null;
  variante: number;
};
