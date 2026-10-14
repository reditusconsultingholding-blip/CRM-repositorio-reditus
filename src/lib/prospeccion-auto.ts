// Prospección automática — tipos, valores por defecto y funciones puras
// (seguro para componentes de cliente).
//
// Es el «ecosistema» que corre en el servidor: cada pocas horas busca tiendas
// que anuncian en Meta, las califica, las mete a la cola de correo en frío,
// lee las respuestas, y cuando una persona aprueba el video del prospecto lo
// entrega en el mismo hilo. Todo se gobierna desde /prospectos/control.
//
// Nada de esto usa tablas nuevas. La configuración va dentro de
// `prospeccion/config.json` (clave `auto`) y lo demás en JSON de Storage,
// bucket privado `trabajos` (mapa en `prospeccion-auto-server.ts`).
import { sinAcentos, validarCorreo } from "@/lib/prospeccion-correo";

export const PAISES_AUTO = ["ES", "MX"] as const;
export type PaisAuto = (typeof PAISES_AUTO)[number];
export const PAIS_AUTO: Record<PaisAuto, { nombre: string; pestana: string; prefijo: string; moneda: string }> = {
  ES: { nombre: "España", pestana: "España", prefijo: "ES", moneda: "EUR" },
  MX: { nombre: "México", pestana: "México", prefijo: "MX", moneda: "MXN" },
};

/** Dirección pública del CRM: va en el enlace de baja de cada correo. */
export const URL_PUBLICA_CRM = (process.env.NEXT_PUBLIC_URL_CRM || "https://www.crmreditusconsulting.company").replace(/\/+$/, "");

// ---------------------------------------------------------- configuración ----

export type Autorizacion = { por: string; porId: string; fecha: string };

export type ConfigAuto = {
  busqueda: {
    activa: boolean;
    paises: PaisAuto[];
    /** Horas entre una búsqueda y la siguiente. */
    cadaHoras: number;
    /** Anuncios que se piden como máximo en una corrida (es lo que cuesta). */
    anunciosPorCorrida: number;
    usdPorCorrida: number;
    usdPorDia: number;
    /** Precio de referencia del proveedor, para estimar antes de gastar. */
    usdPorMilAnuncios: number;
    puntajeMinimo: number;
    soloShopify: boolean;
    palabras: Record<PaisAuto, string[]>;
  };
  envio: {
    activo: boolean;
    /** Correos NUEVOS (primer contacto) por día. El calentamiento de la cuenta manda si es menor. */
    nuevosPorDia: number;
    /** Recordatorios al que no respondió el primer correo (0, 1 o 2). */
    seguimientosFrio: number;
    /** Quién encendió el envío: es la autorización de las campañas automáticas. */
    autorizadoPor: Autorizacion | null;
  };
  respuestas: { borradorIA: boolean };
  entrega: { automatica: boolean; autorizadoPor: Autorizacion | null };
  /** Datos del remitente que van al pie de cada correo (requisito legal). */
  remitente: { nombre: string; empresa: string; direccion: string; web: string; motivo: string };
  hoja: { id: string; activa: boolean; pestanas: Record<PaisAuto, string> };
};

export const PALABRAS_BASE: Record<PaisAuto, string[]> = {
  ES: [
    "pago contra reembolso",
    "contrareembolso",
    "envío gratis",
    "envío 24/48h",
    "paga al recibir",
    "últimas unidades",
    "oferta de lanzamiento",
    "envío desde España",
    "devolución gratuita",
    "stock limitado",
    "2x1 solo hoy",
    "garantía de 30 días",
    "pide el tuyo",
    "oferta flash",
    "descuento exclusivo",
    "compra ahora",
    "edición limitada",
    "satisfacción garantizada",
    "nueva colección",
    "regalo perfecto",
  ],
  MX: [
    "pago contra entrega",
    "paga al recibir",
    "envío gratis a todo México",
    "meses sin intereses",
    "oferta relámpago",
    "últimas piezas",
    "compra ahora",
    "2x1 solo hoy",
    "garantía de satisfacción",
    "pide el tuyo hoy",
    "descuento por tiempo limitado",
    "envío gratis",
  ],
};

export const DIAS_SEGUIMIENTO_FRIO = [4, 9] as const;

export const CONFIG_AUTO_BASE: ConfigAuto = {
  busqueda: {
    activa: false,
    paises: ["ES"],
    cadaHoras: 6,
    // Prudente a propósito: la cuenta de Apify es compartida y de saldo pequeño (unos 9 USD al mes con estos valores).
    anunciosPorCorrida: 30,
    usdPorCorrida: 0.15,
    usdPorDia: 0.3,
    usdPorMilAnuncios: 5,
    puntajeMinimo: 55,
    soloShopify: true,
    palabras: PALABRAS_BASE,
  },
  envio: { activo: false, nuevosPorDia: 25, seguimientosFrio: 1, autorizadoPor: null },
  respuestas: { borradorIA: true },
  entrega: { automatica: false, autorizadoPor: null },
  remitente: {
    nombre: "Sebastian Vargas",
    empresa: "Reditus Consulting",
    direccion: "",
    web: "reditusconsulting.org",
    motivo: "Este correo llega porque la tienda anuncia en Meta y esta es su dirección de contacto pública.",
  },
  hoja: { id: "", activa: false, pestanas: { ES: "España", MX: "México" } },
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const txt = (v: unknown, max: number, def = "") => (typeof v === "string" ? v.trim().slice(0, max) : def);
const num = (v: unknown, def: number, min: number, max: number) => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);

function leerAutorizacion(v: unknown): Autorizacion | null {
  const o = obj(v);
  return txt(o.fecha, 40) ? { por: txt(o.por, 160), porId: txt(o.porId, 40), fecha: txt(o.fecha, 40) } : null;
}

export function leerPalabras(v: unknown, def: string[]): string[] {
  const lista = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\n,;]+/) : null;
  if (!lista) return def;
  const limpias = [...new Set(lista.map((p) => txt(p, 60)).filter((p) => p.length >= 3))].slice(0, 80);
  return limpias.length ? limpias : def;
}

/** El id de una hoja de Google, venga suelto o dentro del enlace. */
export function idDeHoja(v: unknown): string {
  const t = txt(v, 400);
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(t);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(t) ? t : "";
}

/** Normaliza lo leído de Storage o lo que manda la pantalla. Nunca lanza. */
export function leerConfigAuto(raw: unknown): ConfigAuto {
  const o = obj(raw);
  const b = CONFIG_AUTO_BASE;
  const bu = obj(o.busqueda);
  const en = obj(o.envio);
  const et = obj(o.entrega);
  const re = obj(o.remitente);
  const ho = obj(o.hoja);
  const paises = (Array.isArray(bu.paises) ? bu.paises : []).filter((p): p is PaisAuto => (PAISES_AUTO as readonly unknown[]).includes(p));
  const palabras = obj(bu.palabras);
  const pestanas = obj(ho.pestanas);
  return {
    busqueda: {
      activa: bool(bu.activa, b.busqueda.activa),
      paises: paises.length ? [...new Set(paises)] : b.busqueda.paises,
      cadaHoras: Math.round(num(bu.cadaHoras, b.busqueda.cadaHoras, 1, 48)),
      anunciosPorCorrida: Math.round(num(bu.anunciosPorCorrida, b.busqueda.anunciosPorCorrida, 5, 2000)),
      usdPorCorrida: num(bu.usdPorCorrida, b.busqueda.usdPorCorrida, 0.01, 50),
      usdPorDia: num(bu.usdPorDia, b.busqueda.usdPorDia, 0.01, 200),
      usdPorMilAnuncios: num(bu.usdPorMilAnuncios, b.busqueda.usdPorMilAnuncios, 0.1, 100),
      puntajeMinimo: Math.round(num(bu.puntajeMinimo, b.busqueda.puntajeMinimo, 0, 100)),
      soloShopify: bool(bu.soloShopify, b.busqueda.soloShopify),
      palabras: { ES: leerPalabras(palabras.ES, b.busqueda.palabras.ES), MX: leerPalabras(palabras.MX, b.busqueda.palabras.MX) },
    },
    envio: {
      activo: bool(en.activo, b.envio.activo),
      nuevosPorDia: Math.round(num(en.nuevosPorDia, b.envio.nuevosPorDia, 1, 65)),
      seguimientosFrio: Math.round(num(en.seguimientosFrio, b.envio.seguimientosFrio, 0, DIAS_SEGUIMIENTO_FRIO.length)),
      autorizadoPor: leerAutorizacion(en.autorizadoPor),
    },
    respuestas: { borradorIA: bool(obj(o.respuestas).borradorIA, b.respuestas.borradorIA) },
    entrega: { automatica: bool(et.automatica, b.entrega.automatica), autorizadoPor: leerAutorizacion(et.autorizadoPor) },
    remitente: {
      nombre: txt(re.nombre, 80) || b.remitente.nombre,
      empresa: txt(re.empresa, 120) || b.remitente.empresa,
      direccion: txt(re.direccion, 200),
      web: txt(re.web, 120) || b.remitente.web,
      motivo: txt(re.motivo, 240) || b.remitente.motivo,
    },
    hoja: {
      id: idDeHoja(ho.id),
      activa: bool(ho.activa, b.hoja.activa),
      pestanas: { ES: txt(pestanas.ES, 80) || b.hoja.pestanas.ES, MX: txt(pestanas.MX, 80) || b.hoja.pestanas.MX },
    },
  };
}

/** Cuántos anuncios se pueden pedir con un presupuesto en dólares. */
export function anunciosQueCaben(usd: number, usdPorMil: number): number {
  return Math.max(0, Math.floor((usd / usdPorMil) * 1000 + 1e-6));
}
export function costoDeAnuncios(anuncios: number, usdPorMil: number): number {
  return Math.round((anuncios / 1000) * usdPorMil * 10000) / 10000;
}

/**
 * En cuántos días la cuenta llega a enviar `objetivo` correos nuevos al día
 * sin saltarse el calentamiento (15 / 30 / 50 / 65 por semana). Día 1 = el
 * del primer envío real.
 */
export function diaEnQueLlega(objetivo: number, calentamiento: readonly number[]): number {
  const semana = calentamiento.findIndex((tope) => tope >= objetivo);
  return (semana < 0 ? calentamiento.length - 1 : semana) * 7 + 1;
}

// ------------------------------------------------------------ calificación ----

/** Lo que el trabajador encontró de una tienda. Solo datos observados, nada inventado. */
export type Hallazgo = {
  dominio: string;
  tienda: string;
  url: string;
  pais: PaisAuto;
  plataforma: string;
  correo: string;
  telefono: string;
  instagram: string;
  producto: string;
  productoUrl: string;
  precio: string;
  /** Anuncios activos de ese anunciante en la muestra consultada. */
  anuncios: number;
  anunciosVideo: number;
  diasAnuncioMasAntiguo: number | null;
  diasAnuncioMasNuevo: number | null;
  duplicadosMax: number | null;
  /** Días desde que la tienda publicó su primer producto (null = no se pudo saber). */
  tiendaDias: number | null;
  adsLibrary: string;
  palabra: string;
};

export function leerHallazgo(raw: unknown): Hallazgo | null {
  const o = obj(raw);
  const dominio = limpiarDominio(txt(o.dominio, 200) || txt(o.url, 300));
  const pais = (PAISES_AUTO as readonly unknown[]).includes(o.pais) ? (o.pais as PaisAuto) : null;
  if (!dominio || !pais) return null;
  const entero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
  return {
    dominio,
    tienda: txt(o.tienda, 160) || dominio,
    url: txt(o.url, 300) || `https://${dominio}`,
    pais,
    plataforma: txt(o.plataforma, 30).toLowerCase() || "desconocida",
    correo: txt(o.correo, 160).toLowerCase(),
    telefono: txt(o.telefono, 40),
    instagram: txt(o.instagram, 120),
    producto: txt(o.producto, 240),
    productoUrl: txt(o.productoUrl, 400),
    precio: txt(o.precio, 40),
    anuncios: entero(o.anuncios) ?? 0,
    anunciosVideo: entero(o.anunciosVideo) ?? 0,
    diasAnuncioMasAntiguo: entero(o.diasAnuncioMasAntiguo),
    diasAnuncioMasNuevo: entero(o.diasAnuncioMasNuevo),
    duplicadosMax: entero(o.duplicadosMax),
    tiendaDias: entero(o.tiendaDias),
    adsLibrary: /^https:\/\/www\.facebook\.com\/ads\/library\//.test(txt(o.adsLibrary, 400)) ? txt(o.adsLibrary, 400) : "",
    palabra: txt(o.palabra, 60),
  };
}

/** `https://www.Tienda.es/collections/x?y` → `tienda.es`. */
export function limpiarDominio(v: string): string {
  const t = String(v ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "").replace(/:\d+$/, "");
  return /^[a-z0-9.-]+\.[a-z]{2,24}$/.test(t) && !t.includes("..") ? t : "";
}

export type Nivel = "A" | "B" | "C" | "D";
export type Calificacion = { puntaje: number; nivel: Nivel; falencia: string; evidencia: string; descarte: string | null };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Puntaje de 0 a 100 y la «falencia»: la razón concreta por la que un video
 * le sirve a esa tienda. Solo usa señales observadas; si una señal no se pudo
 * medir, no suma ni resta.
 */
export function calificar(h: Hallazgo, reglas: { soloShopify: boolean; puntajeMinimo: number }): Calificacion {
  const motivos: { peso: number; texto: string }[] = [];
  let puntaje = 35;
  let descarte: string | null = null;

  if (!validarCorreo(h.correo, { permitirEjemplo: true }).ok) descarte = "sin correo de contacto válido";
  else if (reglas.soloShopify && h.plataforma !== "shopify") descarte = `no es Shopify (${h.plataforma})`;
  else if (!h.producto) descarte = "no se identificó un producto";

  if (h.anuncios > 0) {
    if (h.anunciosVideo === 0) {
      puntaje += 25;
      motivos.push({ peso: 25, texto: `De ${plural(h.anuncios, "anuncio activo", "anuncios activos")} que se vieron en Meta, ninguno es video.` });
    } else if (h.anunciosVideo / h.anuncios <= 1 / 3) {
      puntaje += 10;
      motivos.push({ peso: 10, texto: `Solo ${h.anunciosVideo} de ${plural(h.anuncios, "anuncio activo", "anuncios activos")} es video.` });
    }
    if (h.anuncios <= 3) {
      puntaje += 15;
      motivos.push({ peso: 15, texto: `Tiene pocos creativos activos (${h.anuncios}).` });
    } else if (h.anuncios <= 8) puntaje += 8;
    else if (h.anuncios > 20) {
      puntaje -= 15;
      if (h.anunciosVideo / h.anuncios > 0.5) puntaje -= 15;
    }
  }
  if (h.diasAnuncioMasAntiguo !== null && h.diasAnuncioMasAntiguo >= 15) puntaje += 10;
  if (h.diasAnuncioMasNuevo !== null && h.diasAnuncioMasNuevo > 30) {
    puntaje += 5;
    motivos.push({ peso: 8, texto: `Su anuncio más reciente lleva ${h.diasAnuncioMasNuevo} días: no ha renovado creativos.` });
  }
  if (h.duplicadosMax !== null && h.duplicadosMax >= 3) {
    puntaje += 5;
    motivos.push({ peso: 5, texto: `Escala un mismo creativo (${h.duplicadosMax} copias).` });
  }
  if (h.tiendaDias !== null && h.tiendaDias < 120) {
    puntaje += 10;
    motivos.push({ peso: 9, texto: `Tienda nueva (unos ${Math.max(1, Math.round(h.tiendaDias / 30))} meses).` });
  }
  puntaje = Math.min(100, Math.max(0, Math.round(puntaje)));
  const nivel: Nivel = puntaje >= 80 ? "A" : puntaje >= 65 ? "B" : puntaje >= 50 ? "C" : "D";
  if (!descarte && puntaje < reglas.puntajeMinimo) descarte = `puntaje ${puntaje} por debajo del mínimo (${reglas.puntajeMinimo})`;
  const falencia = motivos.sort((a, b) => b.peso - a.peso).slice(0, 2).map((m) => m.texto).join(" ") || "Anuncia en Meta; no se midieron señales claras.";
  return { puntaje, nivel, falencia, evidencia: h.adsLibrary, descarte };
}

// --------------------------------------------------------------- la hoja ----

export const CAMPOS_HOJA = {
  id: ["#id", "id", "#"],
  tienda: ["tienda", "nombre", "marca"],
  url: ["link tienda", "url", "web", "sitio", "enlace tienda"],
  plataforma: ["plataforma"],
  producto: ["producto", "producto estrella", "producto mas vendido", "producto top"],
  precio: ["precio"],
  anuncios: ["anuncios", "# anuncios"],
  correo: ["correo(s)", "correos", "correo", "email", "e-mail"],
  telefono: ["telefono", "whatsapp"],
  instagram: ["ig", "instagram"],
  estado: ["estado"],
  fecha: ["fecha"],
  notas: ["notas"],
  puntaje: ["puntaje"],
  nivel: ["nivel"],
  escribir: ["¿escribir?", "escribir"],
  falencia: ["falencia"],
  evidencia: ["evidencia"],
  anuncio: ["link anuncio", "anuncio"],
} as const;
export type CampoHoja = keyof typeof CAMPOS_HOJA;

const normal = (s: string) => sinAcentos(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();

/** Dónde está cada campo según la fila de encabezados. El precio acepta «Precio (EUR)». */
export function mapaDeColumnas(cabecera: string[]): Partial<Record<CampoHoja, number>> {
  const mapa: Partial<Record<CampoHoja, number>> = {};
  const titulos = cabecera.map(normal);
  for (const campo of Object.keys(CAMPOS_HOJA) as CampoHoja[]) {
    const nombres = (CAMPOS_HOJA[campo] as readonly string[]).map(normal);
    let i = titulos.findIndex((t) => nombres.includes(t));
    if (i < 0 && campo === "precio") i = titulos.findIndex((t) => t.startsWith("precio"));
    if (i >= 0) mapa[campo] = i;
  }
  return mapa;
}

/** La primera dirección utilizable de una celda que puede traer varias, con signos o texto alrededor. */
export function primerCorreo(celda: string): string {
  for (const trozo of String(celda ?? "").split(/[\s,;|/<>()]+/)) {
    const v = validarCorreo(trozo.replace(/^mailto:/i, ""), { permitirEjemplo: true });
    if (v.ok) return v.correo;
  }
  return "";
}

/** Cómo viene marcada una fila que se trabajó a mano antes del CRM. */
export type EstadoPrevio = "pendiente" | "enviado" | "si" | "rebote" | "no";
export function estadoPrevio(celda: string): EstadoPrevio {
  const t = normal(celda);
  if (!t || t.startsWith("pendiente") || t === "en cola") return "pendiente";
  if (/rebot/.test(t)) return "rebote";
  if (/no interes|baja|no escribir/.test(t)) return "no";
  if (/respondio si|dijo si|interesad/.test(t)) return "si";
  return "enviado";
}

/** `0` → A, `25` → Z, `26` → AA. */
export function letraDeColumna(i: number): string {
  let s = "";
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function numeroDeId(id: string, prefijo: string): number {
  const m = new RegExp(`^${prefijo}-(\\d{1,6})$`, "i").exec(String(id ?? "").trim());
  return m ? Number(m[1]) : 0;
}
export const idDeHojaFila = (prefijo: string, n: number) => `${prefijo}-${String(n).padStart(4, "0")}`;

// ---------------------------------------------------------------- embudo ----

export const PASOS_EMBUDO = ["encontrados", "enviados", "seguimientos", "respuestas", "aceptados", "preguntas", "noInteresados", "rebotes", "bajas", "entregados", "llamadas"] as const;
export type PasoEmbudo = (typeof PASOS_EMBUDO)[number];
export type Embudo = Record<PasoEmbudo, number>;
export const EMBUDO_VACIO: Embudo = { encontrados: 0, enviados: 0, seguimientos: 0, respuestas: 0, aceptados: 0, preguntas: 0, noInteresados: 0, rebotes: 0, bajas: 0, entregados: 0, llamadas: 0 };
export const EMBUDO_LABELS: Record<PasoEmbudo, string> = {
  encontrados: "Encontrados",
  enviados: "Correos nuevos",
  seguimientos: "Recordatorios",
  respuestas: "Respuestas",
  aceptados: "Aceptaron el video",
  preguntas: "Preguntas",
  noInteresados: "No interesados",
  rebotes: "Rebotes",
  bajas: "Bajas",
  entregados: "Videos entregados",
  llamadas: "Llamadas agendadas",
};

export function leerEmbudo(raw: unknown): Embudo {
  const o = obj(raw);
  return Object.fromEntries(PASOS_EMBUDO.map((p) => [p, Math.max(0, Math.round(num(o[p], 0, 0, 1e7)))])) as Embudo;
}

// ------------------------------------------------------ cola de respuestas ----

export const ESTADOS_COLA = ["pendientes", "aprobadas", "en-envio", "enviadas", "descartadas"] as const;
export type EstadoCola = (typeof ESTADOS_COLA)[number];

/** Una respuesta que necesita a una persona: una pregunta (con borrador) o algo que no se pudo clasificar. */
export type RespuestaEnCola = {
  id: string;
  linea: "video" | "landing";
  motivo: "pregunta" | "por_revisar";
  destino: { tipo: "lead"; campanaId: string; leadId: string } | { tipo: "prospecto"; prospectoId: string };
  tienda: string;
  de: string;
  asunto: string;
  recibido: string;
  texto: string;
  borrador: string;
  borradorCon: "ia" | "plantilla" | "persona";
  hilo: { asunto: string; enRespuestaA: string | null; referencias: string[] };
  pais: string;
  aprobada: Autorizacion | null;
  enviadaAt: string | null;
  messageId: string | null;
  nota: string;
};

// ----------------------------------------------------------------- latido ----

export type Latido = {
  fecha: string;
  trabajador: string;
  version: string;
  modo: string;
  busqueda: string;
  cuentas: Record<string, { ok: boolean; detalle: string }>;
  reportesPendientes: number;
  ultimoError: string;
};

/** Minutos sin latido a partir de los cuales el servidor se da por caído. */
export const MINUTOS_SIN_LATIDO = 15;

export type Corrida = { id: string; pais: PaisAuto; inicio: string; fin: string | null; fuente: string; palabras: string[]; anunciosMax: number; anuncios: number; usd: number; hallazgos: number; agregados: number; descartados: number; nota: string };
export type DiaBusqueda = { usd: number; corridas: Corrida[] };

export type EstadoHoja = { ultima: string | null; error: string; leidas: number; importadas: number; actualizadas: number; agregadas: number; sinCorreo: number; cuenta: string };

export type PanelAuto = {
  hoy: string;
  embudo: { hoy: Embudo; ayer: Embudo; semana: Embudo };
  latido: Latido | null;
  servidorVivo: boolean;
  busquedas: DiaBusqueda;
  ultimaCorrida: Corrida | null;
  proximaBusqueda: string | null;
  cola: RespuestaEnCola[];
  /** Ids de la cola que el trabajador tomó y no confirmó. */
  sinConfirmar: string[];
  hoja: EstadoHoja;
  cuentaDeServicio: string;
  enCola: number;
  videos: { porDecidir: number; enCurso: number; topePorDia: number; pideAprobacion: boolean };
  /** Día (contado desde el primer envío real) en que la cuenta ya puede con el tope de correos nuevos. */
  diaObjetivo: number;
  avisos: string[];
};
