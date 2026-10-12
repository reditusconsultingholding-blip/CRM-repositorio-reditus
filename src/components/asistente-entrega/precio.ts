import type { TipoServicio } from "@/lib/capacidad";
import {
  REFERENCE_RATE_COP,
  IMAGEN_PUBLICITARIA_USD,
  landingUnitPriceUsd,
  videoUnitPriceUsd,
} from "@/lib/pricing-catalog";
import type { PrecioSugerido } from "./tipos";

// Precio sugerido a partir de lo que Reditus YA cobró por trabajos
// parecidos. Sin datos suficientes no inventa: muestra el precio de lista
// marcado como «referencia».

/** Mínimo de trabajos parecidos para atreverse a sugerir un precio. */
export const MIN_TRABAJOS = 3;

/** Precios de lista dados de palabra por el dueño (COP por unidad). Solo respaldo. */
const LISTA_DE_PALABRA: Partial<Record<TipoServicio, { cop: number; nota: string }>> = {
  pagina_marca: { cop: 2_000_000, nota: "precio de lista dado por Alank (≈600 USD)" },
  cro: { cop: 1_350_000, nota: "precio de lista dado por Alank" },
};

export type Muestra = {
  tipo: TipoServicio;
  cantidad: number;
  unitUsd: number;
  fuente: "app" | "historico";
};

/** Servicio del desplegable de Ingresos → tipo del asistente. */
export function tipoDeServicioApp(servicio: string | null): TipoServicio | null {
  if (servicio === "Videos IA") return "video";
  if (servicio === "Landing page") return "landing";
  if (servicio === "Imágenes Ads") return "imagenes";
  return null; // «Claude» mezcla trabajos de programación muy distintos: no sirve de referencia.
}

/** El histórico importado trae el servicio como texto libre («3 Videos con
 * IA», «1 Landing page»). Solo se usan las filas de UN servicio con su
 * cantidad al inicio; los combos («5 landings + 2 ajustes») se descartan
 * porque no se puede saber cuánto valió cada cosa. */
export function leerServicioHistorico(servicio: string | null): { tipo: TipoServicio; cantidad: number } | null {
  if (!servicio) return null;
  const s = servicio.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = s.match(/^\s*(\d{1,3})\s+(.+)$/);
  if (!m) return null;
  const resto = m[2];
  if (/[+&]|\d|paquete|pack|traduc|ajuste|branding|logo/.test(resto)) return null;

  const esLanding = /landing/.test(resto);
  const esVideo = /\bvid/.test(resto);
  const esImagen = /\bim(g|agen)/.test(resto);
  if (Number(esLanding) + Number(esVideo) + Number(esImagen) !== 1) return null;

  const cantidad = Number(m[1]);
  if (cantidad < 1) return null;
  return { tipo: esLanding ? "landing" : esVideo ? "video" : "imagenes", cantidad };
}

// Los precios por unidad bajan con el volumen: se compara con pedidos de
// tamaño parecido.
const TRAMOS = [1, 2, 5, 10, 20];
function tramo(cantidad: number): number {
  let t = 0;
  for (let i = 0; i < TRAMOS.length; i++) if (cantidad >= TRAMOS[i]) t = i;
  return t;
}
function nombreTramo(cantidad: number): string {
  const i = tramo(cantidad);
  const desde = TRAMOS[i];
  const hasta = TRAMOS[i + 1] ? TRAMOS[i + 1] - 1 : null;
  if (hasta == null) return `${desde} o más unidades`;
  return desde === hasta ? `${desde} unidad` : `${desde} a ${hasta} unidades`;
}

function cuantil(ordenados: number[], q: number): number {
  const pos = (ordenados.length - 1) * q;
  const base = Math.floor(pos);
  const sig = ordenados[Math.min(base + 1, ordenados.length - 1)];
  return ordenados[base] + (sig - ordenados[base]) * (pos - base);
}

function redondearCop(n: number): number {
  return Math.round(n / 1000) * 1000;
}

function precioDeLista(tipo: TipoServicio, cantidad: number): { cop: number; nota: string } | null {
  const dePalabra = LISTA_DE_PALABRA[tipo];
  if (dePalabra) return { cop: dePalabra.cop * cantidad, nota: dePalabra.nota };
  if (tipo === "landing") {
    return { cop: redondearCop(landingUnitPriceUsd(cantidad) * REFERENCE_RATE_COP * cantidad), nota: "tabla oficial de precios" };
  }
  if (tipo === "video") {
    return { cop: redondearCop(videoUnitPriceUsd(cantidad) * REFERENCE_RATE_COP * cantidad), nota: "tabla oficial de precios" };
  }
  if (tipo === "imagenes") {
    return { cop: redondearCop(IMAGEN_PUBLICITARIA_USD * REFERENCE_RATE_COP * cantidad), nota: "tabla oficial de precios" };
  }
  return null;
}

export function sugerirPrecio(
  muestras: Muestra[],
  tipo: TipoServicio,
  cantidad: number,
  rateCop: number,
): PrecioSugerido {
  const lista = precioDeLista(tipo, cantidad);
  const delTipo = muestras.filter((m) => m.tipo === tipo && m.unitUsd > 0);
  const mismoTramo = delTipo.filter((m) => tramo(m.cantidad) === tramo(cantidad));
  const usarTramo = mismoTramo.length >= MIN_TRABAJOS;
  const similares = usarTramo ? mismoTramo : delTipo;

  const comun = {
    tipo,
    cantidad,
    n: similares.length,
    nApp: similares.filter((m) => m.fuente === "app").length,
    nHistorico: similares.filter((m) => m.fuente === "historico").length,
    referenciaCop: lista?.cop ?? null,
    referenciaNota: lista?.nota ?? null,
  };

  if (similares.length < MIN_TRABAJOS) {
    const cuantos =
      similares.length === 0
        ? "No hay trabajos parecidos cobrados"
        : `Solo hay ${similares.length} trabajo(s) parecido(s) cobrado(s)`;
    return {
      ...comun,
      base: lista ? "referencia" : "sin_datos",
      totalCop: lista?.cop ?? null,
      totalUsd: lista ? Math.round(lista.cop / rateCop) : null,
      minCop: null,
      maxCop: null,
      detalle: lista
        ? `${cuantos}: no alcanza para sugerir un precio. Te dejo el de lista como referencia.`
        : `${cuantos} y no hay precio de lista: este hay que cotizarlo a mano.`,
    };
  }

  const unitarios = similares.map((m) => m.unitUsd).sort((a, b) => a - b);
  const mediana = cuantil(unitarios, 0.5);
  const totalUsd = mediana * cantidad;

  return {
    ...comun,
    base: "historial",
    totalCop: redondearCop(totalUsd * rateCop),
    totalUsd: Math.round(totalUsd),
    minCop: redondearCop(cuantil(unitarios, 0.25) * cantidad * rateCop),
    maxCop: redondearCop(cuantil(unitarios, 0.75) * cantidad * rateCop),
    detalle: usarTramo
      ? `Mediana de ${similares.length} pedidos de ${nombreTramo(cantidad)}. El rango es donde cayó la mitad de ellos.`
      : `Mediana de ${similares.length} pedidos de cualquier tamaño (no hay ${MIN_TRABAJOS} del mismo tamaño). El rango es donde cayó la mitad de ellos.`,
  };
}
