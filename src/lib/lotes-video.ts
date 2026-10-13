// Lotes de videos — tipos y funciones puras (seguro para componentes de cliente).
//
// Un lote es una lista de productos (una fila por video). Cada fila crea su
// guion y su proyecto y corre el modo directo hasta donde pueda. Se guarda
// como JSON en el bucket privado `trabajos` (`lib/lotes-video-server.ts`).
import { codigoDePais, enlaceSeguro } from "@/lib/videos";

export const MAX_FILAS_LOTE = 30;

export const ESTADOS_FILA = ["pendiente", "en-marcha", "creado", "detenido", "espera-manana", "error"] as const;
export type EstadoFila = (typeof ESTADOS_FILA)[number];
export const ESTADO_FILA_LABELS: Record<EstadoFila, string> = {
  pendiente: "Por empezar",
  "en-marcha": "Trabajando",
  creado: "Proyecto en marcha",
  detenido: "Necesita atención",
  "espera-manana": "En espera para mañana",
  error: "Falló",
};

export type FilaLote = {
  n: number;
  producto: string;
  enlace: string;
  pais: string;
  oferta: string;
  llamado: string;
  /** Slug del formato; vacío = el que recomiende la investigación. */
  formato: string;
  /** Fotos reales del producto (https), si se dieron en la lista. */
  fotos: string[];
  cliente: string;
  prospectoId: string | null;
  /** El guion que creó esta fila. Con él, el estado se lee en vivo de su proyecto. */
  guionId: string | null;
  estado: EstadoFila;
  /** Qué falta o qué pasó, dicho en claro. */
  detalle: string;
};

export type LoteVideos = { id: string; nombre: string; creadoPor: string; creadoPorId: string; creadoAt: string; filas: FilaLote[] };

export const ID_LOTE = /^\d{8}-\d{6}-[0-9a-f]{8}$/;

const txt = (v: unknown, max: number) => (typeof v === "string" ? v : "").trim().slice(0, max);

export function leerFila(raw: unknown, n: number): FilaLote {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const estado = txt(o.estado, 20);
  const prospecto = txt(o.prospectoId, 40);
  const guion = txt(o.guionId, 40);
  return {
    n,
    producto: txt(o.producto, 240),
    enlace: txt(o.enlace, 500),
    pais: codigoDePais(txt(o.pais, 40)) ?? "CO",
    oferta: txt(o.oferta, 400),
    llamado: txt(o.llamado, 200),
    formato: /^[a-z0-9-]{1,60}$/.test(txt(o.formato, 60)) ? txt(o.formato, 60) : "",
    fotos: (Array.isArray(o.fotos) ? o.fotos : [])
      .filter((u): u is string => typeof u === "string" && u.startsWith("https://"))
      .map((u) => u.slice(0, 600))
      .slice(0, 4),
    cliente: txt(o.cliente, 160),
    prospectoId: /^[0-9a-f-]{36}$/i.test(prospecto) ? prospecto : null,
    guionId: /^[0-9a-f-]{36}$/i.test(guion) ? guion : null,
    estado: (ESTADOS_FILA as readonly string[]).includes(estado) ? (estado as EstadoFila) : "pendiente",
    detalle: txt(o.detalle, 500),
  };
}

export function leerLote(raw: unknown): LoteVideos | null {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = txt(o.id, 40);
  if (!ID_LOTE.test(id)) return null;
  return {
    id,
    nombre: txt(o.nombre, 120) || "Lote",
    creadoPor: txt(o.creadoPor, 160),
    creadoPorId: txt(o.creadoPorId, 40),
    creadoAt: txt(o.creadoAt, 40),
    filas: (Array.isArray(o.filas) ? o.filas : []).slice(0, MAX_FILAS_LOTE).map((f, i) => leerFila(f, i + 1)),
  };
}

/** Parte una línea por el separador, respetando comillas dobles. */
function partir(linea: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else entreComillas = !entreComillas;
    } else if (c === sep && !entreComillas) {
      celdas.push(actual);
      actual = "";
    } else actual += c;
  }
  celdas.push(actual);
  return celdas.map((x) => x.trim());
}

export type FormatoLote = { slug: string; nombre: string };

/**
 * Lee la lista pegada o subida: una fila por video, con las columnas
 * producto · enlace · país · oferta · llamado a la acción · formato (opcional)
 * · fotos (opcional, enlaces https separados por espacio). Acepta tabulador
 * (pegado desde una hoja de cálculo), punto y coma, barra vertical o coma.
 */
export function filasDeTexto(texto: string, formatos: FormatoLote[]): { filas: FilaLote[]; avisos: string[] } {
  const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
  const avisos: string[] = [];
  if (!lineas.length) return { filas: [], avisos };
  const muestra = lineas[0];
  const sep = muestra.includes("\t") ? "\t" : muestra.includes(";") ? ";" : muestra.includes("|") ? "|" : ",";
  const plano = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const filas: FilaLote[] = [];
  lineas.forEach((linea, i) => {
    const c = partir(linea, sep);
    if (i === 0 && /^producto/.test(plano(c[0] ?? ""))) return; // encabezado
    if (!c[0]) return;
    if (filas.length >= MAX_FILAS_LOTE) return;
    const pedido = plano(c[5] ?? "");
    const formato = pedido ? formatos.find((f) => f.slug === pedido || plano(f.nombre) === pedido) : undefined;
    if (pedido && !formato) avisos.push(`Fila ${filas.length + 1}: no conozco el formato «${c[5]}»; se usará el que recomiende la investigación.`);
    const pais = codigoDePais(c[2] ?? "");
    if ((c[2] ?? "").trim() && !pais) avisos.push(`Fila ${filas.length + 1}: no reconozco el país «${c[2]}»; quedó Colombia.`);
    filas.push(
      leerFila(
        {
          producto: c[0],
          enlace: enlaceSeguro(c[1] ?? "") ?? "",
          pais: pais ?? "CO",
          oferta: c[3] ?? "",
          llamado: c[4] ?? "",
          formato: formato?.slug ?? "",
          fotos: (c[6] ?? "").split(/\s+/).filter((u) => u.startsWith("https://")),
        },
        filas.length + 1,
      ),
    );
  });
  if (lineas.length - 1 > MAX_FILAS_LOTE) avisos.push(`Un lote lleva hasta ${MAX_FILAS_LOTE} videos: las filas de más no se tomaron.`);
  return { filas, avisos };
}

/** Lo que le falta a una fila para poder empezar (vacío = lista). */
export function faltaEnFila(f: FilaLote): string[] {
  return [!f.producto ? "el producto" : "", !f.oferta ? "la oferta" : "", !f.llamado ? "el llamado a la acción" : ""].filter(Boolean);
}
