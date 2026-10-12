import "server-only";
import { llamarClaude } from "@/lib/ia-claude";
import type { createAdminClient } from "@/lib/supabase/admin";
import { REGLAS_COMUNES, type FormatoVideo } from "@/lib/video-formatos";
import {
  BUCKET_GUIONES,
  CARPETA_GUIONES,
  enlaceSeguro,
  leerGuionGuardado,
  lineaMercado,
  nombrePais,
  referenciasUtiles,
  rellenar,
  type DatosVideo,
  type GuionGuardado,
  type OrigenGuion,
  type Referencia,
  type VersionGuion,
} from "@/lib/videos";

// Lógica de servidor de «Crear video»: investigación de mercado, guion y los
// dos puntos de extensión que todavía no están conectados (búsqueda
// automática de anuncios y generación del video).

// ------------------------------------------------- investigación ----

export type Investigacion = {
  /** De dónde salió lo que se resume. Hoy solo existen estas dos. */
  fuente: "referencias_pegadas" | "sin_referencias";
  referencias: Referencia[];
  /** Patrones en texto plano, o la explicación de por qué no hay. */
  resumen: string;
  /** Si la IA no pudo resumir, el motivo (el resumen trae entonces la lista tal cual). */
  aviso?: string;
};

function listarReferencias(refs: Referencia[]): string {
  return refs
    .map((r, i) => {
      const partes = [
        `Referencia ${i + 1}`,
        r.enlace ? `enlace: ${enlaceSeguro(r.enlace) ?? r.enlace}` : "",
        r.gancho ? `qué hace el gancho: ${r.gancho}` : "",
        r.dias ? `tiempo activo: ${r.dias}` : "",
        r.duplicados ? `duplicados: ${r.duplicados}` : "",
      ];
      return partes.filter(Boolean).join(" · ");
    })
    .join("\n");
}

const SISTEMA_MERCADO = `Eres el estratega creativo de Reditus Consulting (videos de anuncios para e-commerce en Latinoamérica y España). Una persona del equipo miró anuncios en la biblioteca de anuncios de Meta y en TikTok y te pasa sus apuntes de 1 a 5 referencias.

Tú NO viste esos anuncios y no tienes acceso a ninguna biblioteca de anuncios. Trabajas solo con los apuntes y con las reglas de la base de conocimiento de Reditus que van abajo.

Devuelve, en texto plano y sin markdown, exactamente estos bloques:

PATRONES EN LAS REFERENCIAS: de 2 a 4 líneas. Solo lo que se repite o destaca en los apuntes (tipo de gancho, situación, tono). Si hay una sola referencia, dilo y no generalices.
SEÑALES DE ESCALAMIENTO: lo que los apuntes dicen sobre tiempo activo y duplicados, tal cual. Si no lo dicen, escribe «El equipo no anotó tiempo activo ni duplicados».
CÓMO APLICARLO A ESTE VIDEO: 3 líneas concretas para el gancho y el desarrollo, cruzando los apuntes con las reglas de Reditus.
QUÉ FALTA MIRAR: 1 o 2 cosas que convendría revisar en las referencias antes de producir.

Reglas:
- Nunca escribas que viste, analizaste o encontraste anuncios: di «según los apuntes» o «las referencias pegadas».
- No inventes cifras, días activos, número de duplicados, marcas ni resultados que no estén en los apuntes.
- No copies textos ni identidad de las referencias: se toma el formato, el encuadre y el ritmo.
- Máximo 170 palabras en total.`;

/**
 * PUNTO DE EXTENSIÓN — investigación de mercado.
 *
 * Hoy: no hay acceso por API a la biblioteca de anuncios de Meta ni se puede
 * recorrer desde este servidor. La persona abre la búsqueda (los enlaces los
 * arma `urlAdsLibrary` / `urlTikTokCreativeCenter` en `lib/videos.ts`), mira
 * y pega de 1 a 5 referencias. Esta función solo ORDENA y RESUME lo pegado;
 * nunca afirma haber visto anuncios. Sin referencias no llama a la IA.
 *
 * Cuando exista el servidor con Chrome que haga la búsqueda sola, se conecta
 * AQUÍ: con `datos.paisBusqueda` y `datos.palabraClave` ese servicio debe
 * devolver una lista de `Referencia` (enlace, qué hace el gancho, días
 * activo, duplicados). Se unen a las pegadas a mano, se agrega un valor nuevo
 * a `fuente` (por ejemplo "busqueda_automatica") y el resto del flujo —el
 * resumen, el guion y la pantalla— no cambia.
 */
export async function investigarMercado(datos: DatosVideo, formato: FormatoVideo): Promise<Investigacion> {
  const referencias = referenciasUtiles(datos.referencias);
  if (!referencias.length) {
    return {
      fuente: "sin_referencias",
      referencias,
      resumen:
        "Sin referencias de mercado. El guion se escribe solo con los datos del cliente y la estructura de Reditus. " +
        "Para afinarlo, abre las búsquedas, mira qué anuncios llevan más tiempo activos y pega aquí de 1 a 5.",
    };
  }

  const lista = listarReferencias(referencias);
  const usuario = [
    `Producto: ${datos.producto || "(sin dato)"}`,
    `País del video: ${nombrePais(datos.pais)} · País donde se buscó: ${nombrePais(datos.paisBusqueda)}`,
    `Formato elegido: ${formato.nombre} (${formato.para_que_sirve})`,
    "",
    "Apuntes del equipo:",
    lista,
    "",
    "Reglas de la base de conocimiento de Reditus:",
    REGLAS_COMUNES,
  ].join("\n");

  const r = await llamarClaude(SISTEMA_MERCADO, usuario, 700);
  if ("error" in r) {
    return {
      fuente: "referencias_pegadas",
      referencias,
      resumen: `Referencias pegadas por el equipo (sin resumir):\n${lista}`,
      aviso: r.error,
    };
  }
  return { fuente: "referencias_pegadas", referencias, resumen: r.texto };
}

// --------------------------------------------------------- guion ----

function fichaFormato(f: FormatoVideo): string {
  return [
    `FORMATO: ${f.nombre} · duración ${f.duracion} · ${f.relacion_aspecto} · etapa ${f.etapa_embudo || "(sin dato)"}`,
    f.estado === "por confirmar"
      ? "AVISO: este formato está POR CONFIRMAR en la biblioteca de Reditus; la definición es una interpretación de trabajo."
      : "",
    "",
    "QUÉ ES:",
    f.que_es,
    "",
    "ESTRUCTURA ESCENA POR ESCENA:",
    ...f.estructura.map((e) => `- Paso ${e.paso} · ${e.escena} (${e.tiempo}): ${e.que_pasa}`),
    "",
    `CUÁNDO SE VE EL PRODUCTO REAL: ${f.producto_en_pantalla}`,
    "",
    "REGLAS VISUALES:",
    ...f.reglas_visuales.map((r) => `- ${r}`),
    "",
    "RIESGOS A EVITAR:",
    ...f.riesgos.map((r) => `- ${r}`),
    "",
    "PLANTILLA DE GUION (respeta sus bloques, títulos y orden):",
    f.plantilla,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

const SISTEMA_GUION = `Eres el guionista de Reditus Consulting, agencia que produce videos creativos de anuncios para tiendas e-commerce de Latinoamérica y España. Escribes el guion de UN video en el formato que te indican.

Usa la plantilla del formato: mismos bloques, mismos títulos y mismo orden, con los tiempos de la estructura. Cada bloque conserva su rótulo de paso tal cual («PASO 1 · IMPACTO (…)», «PASO 2 · BAJADA (…)», «PASO 3 · REFUERZO (…)», «PASO 4 · SUBIDA (…)», «PASO 5 · CTA (…)»), y la línea «PRODUCTO EN PANTALLA» del paso 4, donde dices cómo se ve el producto real: en mano o en demostración de uso. Reemplaza cada variable y cada indicación por el texto final. Después de la plantilla agrega, en este orden:

3 HOOKS ALTERNATIVOS: tres inicios distintos para el mismo cuerpo (situación real, pregunta directa, y uno visual: qué se ve el primer segundo).
B-ROLL O ESCENAS DE APOYO: de 4 a 6, cada una atada a la frase exacta que ilustra; indica si el producto está ausente, parcial o es protagonista.
NOTAS PARA QUIEN EDITA: ritmo, subtítulos, música y qué evitar en este formato.
POR COMPLETAR CON EL CLIENTE: la lista de todo lo que dejaste entre corchetes.

Reglas que no se rompen:
- La estructura emocional es la de Reditus: impacto, bajada, refuerzo, subida con el producto y CTA con la oferta local.
- Diálogo entre comillas, frases cortas, como habla la gente del país indicado. Cada bloque hablado, de 20 a 24 palabras como máximo.
- PROHIBIDO inventar precios, descuentos, cifras, porcentajes, plazos, testimonios, nombres de clientes, certificaciones, ingredientes o resultados. Todo dato que no venga en «Datos del cliente» va entre corchetes para completar, por ejemplo [precio], [tiempo de entrega], [resultado que confirme el cliente].
- Sin promesas de salud ni credenciales («soy el doctor…»). En temas sensibles el hook es una pregunta.
- Solo conoces lo que te dan. No afirmes haber visto la tienda, el producto ni anuncios. Si hay «Investigación de mercado», úsala como apuntes del equipo; si dice que no hay referencias, no la menciones dentro del guion.
- No copies textos ni marcas de las referencias.
- Texto plano, sin markdown ni asteriscos. Sin preámbulo ni despedida: empieza en la primera línea de la plantilla.`;

function fichaDatos(d: DatosVideo, resumenMercado: string): string {
  const refs = referenciasUtiles(d.referencias);
  return [
    "Datos del cliente:",
    `Producto: ${d.producto}`,
    `País y acento: ${nombrePais(d.pais)}`,
    `Cliente o marca: ${d.cliente || "(sin dato)"}`,
    `Enlace de la tienda o producto: ${d.enlace || "(sin dato)"} (no lo abriste: es solo referencia)`,
    `Oferta: ${d.oferta || "(sin dato: deja [oferta del país] entre corchetes)"}`,
    `Valores y datos que dio el cliente: ${d.valores || "(sin dato)"}`,
    "",
    "Investigación de mercado:",
    refs.length ? resumenMercado.trim() || listarReferencias(refs) : "Sin referencias de mercado.",
  ].join("\n");
}

/** Guion sin IA: la plantilla del formato con lo que sí se sabe. */
export function guionDePlantilla(d: DatosVideo, formato: FormatoVideo): string {
  return `${lineaMercado(d.referencias)}\n\n${rellenar(formato.plantilla, d)}`;
}

export type GuionGenerado = { texto: string; origen: OrigenGuion; aviso?: string };

/**
 * Escribe el guion. Si la IA no está activa o falla, NO devuelve error: entrega
 * la plantilla del formato rellenada y explica en `aviso` qué pasó, para que
 * la pantalla siga sirviendo.
 */
export async function generarGuionVideo(
  d: DatosVideo,
  formato: FormatoVideo,
  indicacion?: string,
): Promise<GuionGenerado> {
  const extra = indicacion?.trim() ? `\n\nIndicación para esta versión: ${indicacion.trim().slice(0, 600)}` : "";
  const sistema = `${SISTEMA_GUION}\n\n--- BASE DE CONOCIMIENTO DE REDITUS ---\n${REGLAS_COMUNES}\n\n--- FORMATO ---\n${fichaFormato(formato)}`;
  const r = await llamarClaude(sistema, `${fichaDatos(d, d.resumenMercado)}${extra}`, 2400);
  if ("error" in r) {
    return {
      texto: guionDePlantilla(d, formato),
      origen: "plantilla",
      aviso: `${r.error} Te dejé la plantilla del formato con tus datos para que la completes.`,
    };
  }
  // La línea de mercado la pone el código, no la IA: así siempre es cierta.
  const cuerpo = r.texto.replace(/^MERCADO:.*\n+/i, "");
  const faltan = pasosSinRotular(cuerpo);
  return {
    texto: `${lineaMercado(d.referencias)}\n\n${cuerpo}`,
    origen: "ia",
    aviso: faltan.length
      ? `Revisa el guion: la IA no rotuló ${faltan.length === 1 ? "el paso" : "los pasos"} ${faltan.join(", ")} de la estructura.`
      : undefined,
  };
}

// ------------------------------------------------- correcciones ----

/** Pasos de la estructura que NO están rotulados en un guion (vacío = todo bien). */
export function pasosSinRotular(guion: string): number[] {
  return [1, 2, 3, 4, 5].filter((n) => !new RegExp(`^\\s*PASO ${n}\\b`, "mi").test(guion));
}

const SISTEMA_CORRECCION = `Eres el guionista de Reditus Consulting. Un cliente revisó el guion de su video y mandó una corrección. Aplícala.

Devuelve EXACTAMENTE este formato, en texto plano:

QUÉ CAMBIÓ: de 1 a 3 líneas, concretas (qué bloque, qué se cambió y por qué lo pidió el cliente). Si algo de la corrección no se pudo aplicar, dilo aquí.
===GUION===
el guion completo ya corregido

Reglas que no se rompen:
- Cambia SOLO lo que la corrección pide, y lo que deba cambiar por coherencia con eso (por ejemplo, el texto en pantalla o los hooks alternativos que repetían la frase corregida). Todo lo demás queda idéntico, palabra por palabra.
- Conserva la estructura y los rótulos: «PASO 1 · IMPACTO», «PASO 2 · BAJADA», «PASO 3 · REFUERZO», «PASO 4 · SUBIDA», «PASO 5 · CTA», la línea «PRODUCTO EN PANTALLA» y la primera línea «MERCADO: …».
- PROHIBIDO inventar precios, descuentos, cifras, plazos, testimonios, certificaciones o resultados. Si la corrección trae un dato nuevo (un precio, una oferta), úsalo tal cual lo escribió el cliente. Si pide algo para lo que falta un dato, déjalo entre [corchetes] para completar.
- Si la corrección pide una promesa de salud, una credencial inventada o un resultado garantizado, no la escribas: deja el bloque como estaba y explícalo en QUÉ CAMBIÓ.
- No afirmes haber visto la tienda, el producto ni anuncios.
- Sin markdown ni asteriscos.`;

export type GuionCorregido = { texto: string; queCambio: string } | { error: string };

/**
 * Regenera el guion con una corrección del cliente: recibe el guion vigente,
 * la corrección tal cual y los datos originales. Si la IA no está activa o
 * falla devuelve `{ error }`: quien llama deja la corrección como pendiente.
 */
export async function corregirGuionVideo(
  d: DatosVideo,
  formato: FormatoVideo,
  guionVigente: string,
  correccion: string,
): Promise<GuionCorregido> {
  const sistema = `${SISTEMA_CORRECCION}\n\n--- BASE DE CONOCIMIENTO DE REDITUS ---\n${REGLAS_COMUNES}\n\n--- FORMATO ---\n${fichaFormato(formato)}`;
  const usuario = [
    fichaDatos(d, d.resumenMercado),
    "",
    "--- GUION VIGENTE ---",
    guionVigente,
    "",
    "--- CORRECCIÓN DEL CLIENTE (texto tal cual) ---",
    correccion,
  ].join("\n");
  const r = await llamarClaude(sistema, usuario, 2800);
  if ("error" in r) return r;
  const corte = r.texto.indexOf("===GUION===");
  if (corte < 0) return { error: "La IA respondió en un formato inesperado. Intenta de nuevo o aplica la corrección a mano." };
  const queCambio = r.texto
    .slice(0, corte)
    .replace(/^\s*QUÉ CAMBIÓ:\s*/i, "")
    .trim()
    .slice(0, 1200);
  const cuerpo = r.texto
    .slice(corte + "===GUION===".length)
    .trim()
    .replace(/^MERCADO:.*\n+/i, "");
  if (!cuerpo) return { error: "La IA devolvió el guion vacío. Intenta de nuevo o aplica la corrección a mano." };
  return { texto: `${lineaMercado(d.referencias)}\n\n${cuerpo}`, queCambio };
}

// --------------------------------------------- generación de video ----

export type PeticionVideo = {
  /** Id del guion guardado (archivo `videos/<id>.json`). */
  guionId: string;
  /**
   * La versión VIGENTE del guion: su texto ya revisado por una persona y sus
   * prompts por escena (`version.escenas`), ya rellenados con producto, país y
   * oferta. El video queda ligado a `version.n`.
   */
  version: VersionGuion;
  formato: string;
  relacionAspecto: string;
  /** Fotos reales del producto (URLs). El formato las exige: nunca se inventa el envase. */
  fotosProducto?: string[];
};

/**
 * PUNTO DE EXTENSIÓN — generación del video (todavía no existe).
 *
 * Hoy el paso «Generar video» de la pantalla está deshabilitado: el equipo
 * copia los prompts por escena y genera a mano. Cuando se conecte un modelo
 * de video se implementa AQUÍ:
 *
 *  1. Recibe la versión vigente del guion (`peticion.version`).
 *  2. Genera la imagen base y luego cada escena desde esa imagen, una por
 *     cada elemento de `version.escenas`.
 *  3. Une los clips, sube el resultado y devuelve su URL en `videoUrl`.
 *
 * La acción `solicitarVideo` de `videos/actions.ts` ya hace el resto: lee el
 * guion, llama aquí con la versión vigente y guarda `videoUrl` EN ESA VERSIÓN
 * del JSON. Por eso «regenerar con corrección» no necesita nada más: la
 * corrección crea una versión nueva del guion (`registrarCorreccion`) y, con
 * `VIDEO_IA_ACTIVO` encendido, esa misma acción llama aquí con ella; las
 * versiones anteriores conservan su propio `videoUrl`.
 *
 * Para encender el botón de la pantalla y la regeneración automática,
 * `VIDEO_IA_ACTIVO` pasa a `true`.
 */
export const VIDEO_IA_ACTIVO = false;

export async function generarVideo(
  peticion: PeticionVideo,
): Promise<{ listo: false; motivo: string } | { listo: true; videoUrl: string; clips?: string[] }> {
  void peticion;
  return { listo: false, motivo: "La generación de video se activa al conectar un modelo de video." };
}

// ----------------------------------------------------- guardado ----
//
// Sin tabla propia (no se puede cambiar el esquema): cada guion es un JSON en
// Storage. Solo se toca con el cliente de servicio, después de validar el rol.

type Almacen = ReturnType<typeof createAdminClient>;

const rutaGuion = (id: string) => `${CARPETA_GUIONES}/${id}.json`;
export const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function leerGuionArchivo(admin: Almacen, id: string): Promise<GuionGuardado | null> {
  void admin;
  if (!ID_VALIDO.test(id)) return null;
  // Lectura directa y SIN caché. Con `storage.download()` Next puede devolver
  // una respuesta guardada del mismo GET, y aquí eso es grave: cada acción lee
  // el archivo, le agrega una versión o una corrección y lo vuelve a escribir;
  // partir de una copia vieja borraría lo último que se guardó.
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !clave) return null;
  try {
    const res = await fetch(`${base}/storage/v1/object/${BUCKET_GUIONES}/${rutaGuion(id)}`, {
      headers: { Authorization: `Bearer ${clave}`, apikey: clave },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return leerGuionGuardado(await res.json());
  } catch {
    return null;
  }
}

export async function escribirGuionArchivo(admin: Almacen, guion: GuionGuardado): Promise<{ error?: string }> {
  const { error } = await admin.storage
    .from(BUCKET_GUIONES)
    .upload(rutaGuion(guion.id), JSON.stringify(guion, null, 2), {
      contentType: "application/json; charset=utf-8",
      cacheControl: "0",
      upsert: true,
    });
  return error ? { error: `No se pudo guardar el guion: ${error.message}` } : {};
}

/** Los guiones más recientes (hasta 60). Un archivo dañado se salta. */
export async function listarGuiones(admin: Almacen): Promise<{ guiones: GuionGuardado[]; error?: string }> {
  const { data, error } = await admin.storage
    .from(BUCKET_GUIONES)
    .list(CARPETA_GUIONES, { limit: 60, sortBy: { column: "updated_at", order: "desc" } });
  if (error) return { guiones: [], error: `No se pudo leer la lista de guiones: ${error.message}` };
  const ids = (data ?? [])
    .map((f) => f.name)
    .filter((n) => n.endsWith(".json"))
    .map((n) => n.slice(0, -5))
    .filter((id) => ID_VALIDO.test(id));
  const leidos = await Promise.all(ids.map((id) => leerGuionArchivo(admin, id)));
  const guiones = leidos.filter((g): g is GuionGuardado => !!g);
  guiones.sort((a, b) => (b.actualizadoAt || b.creadoAt).localeCompare(a.actualizadoAt || a.creadoAt));
  return { guiones };
}
