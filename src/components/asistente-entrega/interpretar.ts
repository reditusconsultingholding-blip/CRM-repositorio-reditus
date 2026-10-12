import type { TipoServicio } from "@/lib/capacidad";
import { TIPOS_SERVICIO, type ItemPedido, type Pedido } from "./tipos";

// Lectura del dictado SIN inteligencia artificial: respaldo para cuando no
// hay clave de Anthropic o la IA falla. Entiende frases como «entró un
// cliente, Juan, quiere 10 videos y una landing para ya».

const NUMEROS: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50,
  sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
};

// El orden importa: lo más específico primero.
const PATRONES: { tipo: TipoServicio; re: RegExp }[] = [
  { tipo: "pagina_marca", re: /(paginas?|sitios?|tiendas?) (de|con) (la )?marca|home ?page|tienda completa|pagina web completa/g },
  { tipo: "cro", re: /\bcro\b|optimizaci(o|ó)n(es)?|optimizar/g },
  { tipo: "landing", re: /landings?( pages?)?|paginas? de (producto|venta|aterrizaje)|product pages?/g },
  { tipo: "video", re: /videos?|\bvids?\b|creativos? de video|ugc/g },
  { tipo: "imagenes", re: /imagen(es)?|\bimgs?\b|fotos?|creativos? (de imagen|estaticos?)/g },
];

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function numeroAntes(texto: string, pos: number): number {
  const previas = texto.slice(Math.max(0, pos - 40), pos).trim().split(/\s+/).slice(-3).reverse();
  for (const p of previas) {
    const limpio = p.replace(/[^\p{L}\d]/gu, "");
    if (/^\d{1,3}$/.test(limpio)) return Math.max(1, Number(limpio));
    if (NUMEROS[limpio] != null) return NUMEROS[limpio];
  }
  return 1;
}

export function interpretarConReglas(textoOriginal: string): Pedido {
  const texto = sinTildes(textoOriginal.toLowerCase());
  const ocupado: [number, number][] = [];
  const items: ItemPedido[] = [];

  for (const { tipo, re } of PATRONES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(texto))) {
      const ini = m.index;
      const fin = ini + m[0].length;
      if (ocupado.some(([a, b]) => ini < b && fin > a)) continue;
      ocupado.push([ini, fin]);
      const cantidad = numeroAntes(texto, ini);
      const previo = items.find((it) => it.tipo === tipo);
      if (previo) previo.cantidad = Math.max(previo.cantidad, cantidad);
      else items.push({ tipo, cantidad, producto: null });
    }
  }

  const nombre =
    textoOriginal.match(
      /(?:cliente(?:\s+nuev[oa])?(?:\s+que)?(?:\s+se\s+llama|\s+llamad[oa]|\s+es)?|se\s+llama|de\s+parte\s+de)[\s,:]+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+[A-ZÁÉÍÓÚÑ][\p{L}]+)?)/u,
    )?.[1] ?? null;

  return {
    cliente: nombre,
    items,
    urgente: /urgente|urgencia|para ya|lo antes posible|cuanto antes|de afan|rapid/.test(texto),
  };
}

/** Valida lo que devolvió la IA (o el formulario): nunca confía en la forma. */
export function validarPedido(crudo: unknown): Pedido | null {
  if (!crudo || typeof crudo !== "object") return null;
  const o = crudo as Record<string, unknown>;
  if (!Array.isArray(o.items)) return null;

  const items: ItemPedido[] = [];
  for (const it of o.items.slice(0, 6)) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const tipo = String(r.tipo ?? "") as TipoServicio;
    if (!TIPOS_SERVICIO.includes(tipo)) continue;
    const cantidad = Math.floor(Number(r.cantidad));
    if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 500) continue;
    const producto = typeof r.producto === "string" && r.producto.trim() ? r.producto.trim().slice(0, 80) : null;
    items.push({ tipo, cantidad, producto });
  }

  const cliente = typeof o.cliente === "string" && o.cliente.trim() ? o.cliente.trim().slice(0, 60) : null;
  return { cliente, items, urgente: o.urgente === true };
}
