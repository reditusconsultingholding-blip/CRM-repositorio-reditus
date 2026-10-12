import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CALENDLY_URL,
  CANALES,
  CANAL_LABELS,
  ETAPA_A_ESTADO,
  ORIGEN_PROSPECCION,
  SERVICIOS,
  leerProspeccion,
  type Canal,
  type Prospeccion,
  type Servicio,
} from "@/lib/prospeccion";

// Lógica de servidor del embudo de prospección. La usan por igual las
// acciones de la pantalla (/prospectos) y el endpoint externo
// (/api/prospeccion/prospectos): un solo camino para crear prospectos.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any>;

// ---------------------------------------------------------------- IA ----

const MODELO = "claude-sonnet-5";

type ResultadoIA = { texto: string } | { error: string };

async function llamarClaude(system: string, user: string, maxTokens: number): Promise<ResultadoIA> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "La IA no está activada: falta ANTHROPIC_API_KEY en las variables de entorno. Mientras tanto puedes escribirlo a mano.",
    };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => "");
      return { error: `La IA no respondió (${res.status}). ${detalle.slice(0, 160)}`.trim() };
    }
    const data = await res.json();
    const texto = (data?.content ?? [])
      .filter((c: { type: string }) => c.type === "text")
      .map((c: { text: string }) => c.text)
      .join("\n")
      .trim();
    if (!texto) return { error: "La IA respondió vacío. Intenta de nuevo." };
    return { texto };
  } catch (err) {
    return { error: `No se pudo contactar a la IA: ${err instanceof Error ? err.message : "error de red"}` };
  }
}

// Estructura del video ganador de Reditus. Fuente: base de conocimiento de
// Supernova, `conocimiento/videos-ia/BASE_CONOCIMIENTO.md` §3.1 (escenas del
// UGC: hook 0–3 s → problema → producto en mano → resultado/prueba → CTA con
// la oferta local) y §4 (plantilla de guion: cabecera, HOOK / DESARROLLO /
// CTA, música, texto en pantalla, b-roll), más los tres tipos de gancho de
// la mentoría (visual, de texto, auditivo) para las variaciones de inicio.
const SISTEMA_GUION_VIDEO = `Eres el guionista de Reditus Consulting, agencia que produce videos creativos de anuncios para tiendas e-commerce de Latinoamérica y España. Escribes el guion del VIDEO GRATIS de muestra que se le prometió a un prospecto.

Formato del video: anuncio vertical 9:16 estilo UGC (grabado con celular, persona común hablando a cámara, nada de look de estudio), de 25 a 35 segundos.

Usa EXACTAMENTE esta estructura, con estos títulos y en este orden:

PRODUCTO: … | PAÍS/ACENTO: … | FORMATO: UGC 9:16 | DURACIÓN: … s

HOOK (0–3 s): la frase hablada que detiene el dedo. Una pregunta de dolor o una observación que rompe el patrón.
PROBLEMA (3–8 s): el dolor del comprador, en una situación concreta y reconocible.
PRODUCTO EN MANO (8–20 s): el producto en uso: cómo se usa, qué lo hace distinto (mecanismo) y el beneficio.
RESULTADO O PRUEBA (20–25 s): lo que cambia para quien lo usa, o la prueba que lo respalda.
CTA (25–30 s): llamado a la acción con la oferta local y urgencia.

TEXTO EN PANTALLA: los rótulos, uno por bloque, de máximo 6 palabras.
MÚSICA / MOOD: una línea.
B-ROLL: 4 a 6 tomas. Cada una apoya una línea exacta del guion y aporta información visual nueva; indica si el producto está ausente, parcial o es protagonista.
3 HOOKS ALTERNATIVOS: uno visual (qué se ve el primer segundo), uno de texto (frase en pantalla) y uno auditivo (sonido o frase que se oye).
NOTAS PARA EL EDITOR: ritmo de cortes, subtítulos y qué evitar.

Reglas:
- El video debe atacar la falencia detectada en la publicidad o la tienda del prospecto: que al verlo entienda qué le estaba faltando.
- Escribe el diálogo entre comillas, con frases cortas, como habla la gente del país de la tienda. Si no se sabe el país, español neutro.
- No inventes precios, descuentos, cifras, testimonios, certificaciones ni promesas de salud. Lo que no esté en los datos va entre corchetes para confirmar, por ejemplo [precio] o [oferta del país].
- Solo conoces los datos que te dan: no afirmes haber visto la tienda ni sus anuncios.
- Texto plano, sin markdown ni asteriscos. Sin preámbulo ni despedida: empieza en la línea PRODUCTO.`;

// Línea landing/CRO: no hay una estructura de «muestra gratis» documentada en
// la base de conocimiento; esta es una propuesta apoyada en las reglas de la
// skill alank-conocimiento (dolor primero, compra sin fricción, prueba real).
const SISTEMA_GUION_LANDING = `Eres el estratega de conversión (CRO) de Reditus Consulting, agencia que diseña landing pages y product pages para tiendas e-commerce de Latinoamérica y España. Escribes el brief de la MUESTRA GRATIS que se le prometió a un prospecto cuya página vende poco para el tráfico que recibe: un rediseño del primer pantallazo de su página de producto y un video corto recorriéndolo.

Usa EXACTAMENTE esta estructura, con estos títulos y en este orden:

PRODUCTO: … | TIENDA: … | PAÍS: …

QUÉ FRENA LA COMPRA HOY: 3 hipótesis concretas a partir de la falencia detectada, cada una con lo que hay que revisar en la página para confirmarla.
PRIMER PANTALLAZO PROPUESTO: titular (dolor o resultado, máximo 10 palabras), subtítulo, 3 viñetas de beneficio específico, texto del botón, y la prueba que va al lado del botón.
ORDEN DE LA PÁGINA: 6 a 8 secciones en orden, una línea cada una (dolor primero, producto y mecanismo, prueba, oferta, garantía y envío, preguntas, cierre).
COMPRA SIN FRICCIÓN: 3 ajustes para que comprar tome menos pasos.
GUION DEL VIDEO-RECORRIDO (45–60 s): lo que se dice al mostrarle la muestra al prospecto: qué se cambió, por qué, y qué más se haría en la página completa.
NOTAS PARA QUIEN DISEÑA: qué material real pedirle al cliente y qué evitar.

Reglas:
- No inventes precios, cifras de conversión, testimonios ni promesas de salud. Lo que no esté en los datos va entre corchetes para confirmar, por ejemplo [precio] o [reseñas reales].
- Solo conoces los datos que te dan: no afirmes haber visto la página; formula hipótesis y di qué revisar.
- Texto plano, sin markdown ni asteriscos. Sin preámbulo ni despedida: empieza en la línea PRODUCTO.`;

function fichaProspecto(nombre: string, p: Prospeccion): string {
  return [
    `Marca o persona: ${nombre}`,
    `Tienda: ${p.tienda || "(sin dato)"}`,
    `País: ${p.pais || "(sin dato: dedúcelo del dominio si es evidente, si no usa español neutro)"}`,
    `Producto de la muestra: ${p.producto || "(sin dato)"}`,
    `Falencia detectada: ${p.falencia || "(sin dato)"}`,
    p.ads_library ? `Biblioteca de anuncios: ${p.ads_library}` : "",
    p.respuesta ? `Lo que respondió el prospecto: «${p.respuesta}»` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generarGuionIA(nombre: string, p: Prospeccion, indicacion?: string): Promise<ResultadoIA> {
  if (!p.producto.trim()) return { error: "Falta el producto: sin eso no se puede escribir el guion." };
  const sistema = p.servicio === "landing" ? SISTEMA_GUION_LANDING : SISTEMA_GUION_VIDEO;
  const extra = indicacion?.trim() ? `\n\nIndicación para esta versión: ${indicacion.trim().slice(0, 600)}` : "";
  return llamarClaude(sistema, `Datos del prospecto:\n${fichaProspecto(nombre, p)}${extra}`, 1800);
}

/** Garantiza que el mensaje lleve los dos enlaces aunque la IA los omita. */
function asegurarEnlaces(mensaje: string, p: Prospeccion): string {
  let m = mensaje.trim();
  if (p.video_url && !m.includes(p.video_url)) m += `\n\nAquí está: ${p.video_url}`;
  if (!m.includes(CALENDLY_URL)) m += `\n\nAgenda aquí: ${CALENDLY_URL}`;
  return m;
}

function piezaTexto(servicio: Servicio): string {
  return servicio === "landing" ? "la muestra de tu página" : "el video";
}

/** Mensaje de entrega sin IA: sirve cuando no hay clave o la IA falla. */
export function mensajeBase(nombre: string, p: Prospeccion, firma: string): string {
  const saludo = `Hola, ${nombre.trim().split(/\s+/)[0] || "qué tal"}.`;
  const pieza = piezaTexto(p.servicio);
  const lineas = [
    p.canal === "correo" ? `Asunto: Listo ${pieza} de ${p.producto || "tu producto"}\n` : "",
    saludo,
    `Ya está ${pieza} que te prometimos para ${p.producto || "tu producto"}:`,
    p.video_url ?? "[enlace de la pieza]",
    // La falencia es una nota interna: la plantilla no la pega tal cual
    // (la IA sí la reformula). Aquí va una línea neutra por servicio.
    p.servicio === "landing"
      ? "La pensamos para que quien llega a tu página entienda la oferta y pueda comprar en menos pasos."
      : "Lo pensamos para tus anuncios: que el producto se vea en uso y enganche desde el primer segundo.",
    `Si te gusta, te muestro en 15 minutos cómo sería un paquete completo para tu tienda: ${CALENDLY_URL}`,
    p.canal === "whatsapp" ? "" : "¿Me compartes tu número de WhatsApp para coordinar más rápido?",
    `\n${firma}`,
  ];
  return lineas.filter(Boolean).join("\n");
}

export async function generarMensajeIA(nombre: string, p: Prospeccion, firma: string): Promise<ResultadoIA> {
  if (!p.video_url) return { error: "Primero sube la pieza: el mensaje lleva su enlace." };
  const esCorreo = p.canal === "correo";
  const sistema = `Redactas mensajes comerciales de Reditus Consulting (agencia de videos creativos y landing pages para e-commerce). Escribes el mensaje que se le envía por ${CANAL_LABELS[p.canal]} a un prospecto para entregarle ${piezaTexto(p.servicio)} gratis que aceptó recibir.

El mensaje debe, en este orden:
1. Entregar la pieza con su enlace exacto, tal cual, sin acortarlo ni ponerlo entre signos.
2. Decir en una frase qué se trabajó, conectándolo con la falencia detectada, sin tecnicismos y sin criticar al prospecto.
3. Invitar a una llamada de 15 minutos para ver un paquete más grande, con el enlace exacto de la agenda.
${p.canal === "whatsapp" ? "4. Cerrar con una pregunta corta que invite a responder." : "4. Pedir su número de WhatsApp para coordinar más rápido."}

Reglas:
- Tono humano, cercano y directo, de persona a persona. Nada de «espero que te encuentres bien» ni frases de plantilla. Máximo un emoji, o ninguno.
- ${esCorreo ? "La primera línea es «Asunto: …» (máximo 8 palabras). Cuerpo de máximo 130 palabras." : "Máximo 90 palabras, en párrafos cortos."}
- No inventes resultados, cifras, precios ni plazos.
- Termina con la firma indicada.
- Texto plano, sin markdown. Devuelve solo el mensaje.`;
  const usuario = `${fichaProspecto(nombre, p)}\n\nEnlace de la pieza: ${p.video_url}\nEnlace de la agenda: ${CALENDLY_URL}\nFirma: ${firma}`;
  const r = await llamarClaude(sistema, usuario, 600);
  if ("error" in r) return r;
  return { texto: asegurarEnlaces(r.texto, p) };
}

// ------------------------------------------------------- persistencia ----

export type FilaProspeccion = {
  id: string;
  nombre: string;
  estado: string;
  origen: string;
  whatsapp_number: string | null;
  email: string | null;
  respuestas_calificacion: unknown;
};

const COLUMNAS = "id, nombre, estado, origen, whatsapp_number, email, respuestas_calificacion";

export async function leerFila(admin: Admin, id: string): Promise<FilaProspeccion | null> {
  const { data } = await admin.from("prospectos").select(COLUMNAS).eq("id", id).maybeSingle();
  return (data as FilaProspeccion | null) ?? null;
}

/** Vuelve a leer la fila, aplica el cambio sobre el bloque `prospeccion` y
 * lo guarda (junto con columnas reales, si se piden). Releer justo antes de
 * escribir acota la ventana en la que dos personas podrían pisarse. */
export async function guardarProspeccion(
  admin: Admin,
  id: string,
  cambio: Partial<Prospeccion>,
  opciones: { evento?: { quien: string; accion: string }; columnas?: Record<string, unknown> } = {},
): Promise<{ error?: string }> {
  const fila = await leerFila(admin, id);
  const actual = fila ? leerProspeccion(fila.respuestas_calificacion) : null;
  if (!fila || !actual) return { error: "No se encontró el prospecto." };

  const siguiente: Prospeccion = { ...actual, ...cambio };
  if (opciones.evento) {
    siguiente.historial = [
      ...actual.historial,
      { fecha: new Date().toISOString(), quien: opciones.evento.quien, accion: opciones.evento.accion },
    ].slice(-60);
  }
  const base =
    fila.respuestas_calificacion && typeof fila.respuestas_calificacion === "object"
      ? (fila.respuestas_calificacion as Record<string, unknown>)
      : {};
  const { error } = await admin
    .from("prospectos")
    .update({ ...(opciones.columnas ?? {}), respuestas_calificacion: { ...base, prospeccion: siguiente } })
    .eq("id", id);
  return error ? { error: error.message } : {};
}

// ------------------------------------------------------------ creación ----

export type EntradaProspecto = {
  nombre?: unknown;
  servicio?: unknown;
  tienda?: unknown;
  producto?: unknown;
  falencia?: unknown;
  respuesta?: unknown;
  canal?: unknown;
  contacto?: unknown;
  pais?: unknown;
  ads_library?: unknown;
  notas?: unknown;
  id_externo?: unknown;
  generar_guion?: unknown;
};

function limpio(v: unknown, max: number): string {
  return (typeof v === "string" ? v : typeof v === "number" ? String(v) : "").trim().slice(0, max);
}

/** Reparte el contacto en las columnas reales cuando el canal lo permite,
 * para que Ingresos pueda ligar el prospecto al cliente por su WhatsApp. */
export function columnasContacto(canal: Canal, contacto: string): { email?: string; whatsapp_number?: string } {
  if (canal === "correo" && contacto.includes("@")) return { email: contacto.toLowerCase() };
  if (canal === "whatsapp") {
    const numero = contacto.replace(/[^\d+]/g, "");
    if (numero.replace(/\D/g, "").length >= 7) return { whatsapp_number: numero };
  }
  return {};
}

export type ResultadoCrear =
  | { id: string; creado: boolean; guion: boolean; aviso?: string }
  | { error: string; campos?: string[] };

/**
 * ÚNICA puerta para crear un prospecto del embudo. La llaman el formulario
 * manual (acción del servidor) y el endpoint externo. Queda en la etapa
 * «Falta enviar video» y, salvo que se pida lo contrario, con el guion ya
 * generado. Si llega un `id_externo` que ya existe, devuelve ese prospecto
 * en vez de duplicarlo (reintentos seguros del bot).
 */
export async function crearProspectoProspeccion(
  entrada: EntradaProspecto,
  quien: { nombre: string; fuente: "manual" | "api" },
): Promise<ResultadoCrear> {
  const nombre = limpio(entrada.nombre, 160);
  const producto = limpio(entrada.producto, 240);
  const tienda = limpio(entrada.tienda, 300);
  const servicioRaw = limpio(entrada.servicio, 20) || "video";
  const canalRaw = limpio(entrada.canal, 20) || "correo";

  const faltan: string[] = [];
  if (!nombre) faltan.push("nombre");
  if (!tienda) faltan.push("tienda");
  if (!producto) faltan.push("producto");
  if (faltan.length) return { error: `Faltan datos obligatorios: ${faltan.join(", ")}.`, campos: faltan };
  if (!(SERVICIOS as readonly string[]).includes(servicioRaw)) {
    return { error: `El servicio debe ser uno de: ${SERVICIOS.join(", ")}.`, campos: ["servicio"] };
  }
  if (!(CANALES as readonly string[]).includes(canalRaw)) {
    return { error: `El canal debe ser uno de: ${CANALES.join(", ")}.`, campos: ["canal"] };
  }
  const servicio = servicioRaw as Servicio;
  const canal = canalRaw as Canal;
  const contacto = limpio(entrada.contacto, 200);
  const idExterno = limpio(entrada.id_externo, 120) || null;

  const admin = createAdminClient();

  if (idExterno) {
    const { data: previo } = await admin
      .from("prospectos")
      .select("id")
      .eq("origen", ORIGEN_PROSPECCION)
      .eq("respuestas_calificacion->prospeccion->>id_externo", idExterno)
      .limit(1)
      .maybeSingle();
    if (previo?.id) return { id: previo.id as string, creado: false, guion: false };
  }

  const ahora = new Date().toISOString();
  const pros: Prospeccion = {
    servicio,
    etapa: "falta_enviar_video",
    tienda,
    producto,
    falencia: limpio(entrada.falencia, 2000),
    respuesta: limpio(entrada.respuesta, 4000),
    canal,
    contacto,
    pais: limpio(entrada.pais, 60),
    ads_library: limpio(entrada.ads_library, 500),
    guion: "",
    guion_generado_at: null,
    editor_id: null,
    video_url: null,
    video_nombre: null,
    video_path: null,
    video_terminado_at: null,
    mensaje: "",
    enviado_at: null,
    id_externo: idExterno,
    fuente: quien.fuente,
    historial: [
      {
        fecha: ahora,
        quien: quien.nombre,
        accion: quien.fuente === "api" ? "Prospecto creado por el proceso automático" : "Prospecto creado a mano",
      },
    ],
  };

  const { data: creado, error } = await admin
    .from("prospectos")
    .insert({
      nombre,
      origen: ORIGEN_PROSPECCION,
      estado: ETAPA_A_ESTADO.falta_enviar_video,
      notas: limpio(entrada.notas, 2000) || null,
      // Estas filas no son conversaciones del agente de WhatsApp.
      bot_activo: false,
      respuestas_calificacion: { prospeccion: pros },
      ...columnasContacto(canal, contacto),
    })
    .select("id")
    .single();
  if (error || !creado) return { error: error?.message ?? "No se pudo crear el prospecto." };

  const id = creado.id as string;
  if (entrada.generar_guion === false || entrada.generar_guion === "false") {
    return { id, creado: true, guion: false };
  }

  const guion = await generarGuionIA(nombre, pros);
  if ("error" in guion) return { id, creado: true, guion: false, aviso: guion.error };
  const guardado = await guardarProspeccion(
    admin,
    id,
    { guion: guion.texto, guion_generado_at: new Date().toISOString() },
    { evento: { quien: "IA", accion: "Guion generado" } },
  );
  return guardado.error
    ? { id, creado: true, guion: false, aviso: guardado.error }
    : { id, creado: true, guion: true };
}

// ------------------------------------------------- envío automático ----

/**
 * PUNTO DE EXTENSIÓN — envío automático del mensaje (todavía no existe).
 *
 * Hoy el mensaje se copia y se envía a mano, y luego se marca «Video
 * enviado» en la pantalla. Cuando exista el servidor de envíos (correo,
 * Instagram o WhatsApp), se implementa aquí: recibe el prospecto con su
 * canal, contacto y mensaje final, lo entrega por el canal y devuelve
 * `{ enviado: true }`. La acción `marcarEnviado` de
 * `prospectos/actions.ts` es quien debe llamarla antes de mover la etapa.
 */
export async function enviarMensajeAutomatico(
  fila: FilaProspeccion,
  prospeccion: Prospeccion,
): Promise<{ enviado: boolean; motivo?: string }> {
  void fila;
  void prospeccion;
  return { enviado: false, motivo: "El envío automático todavía no está conectado: copia el mensaje y envíalo a mano." };
}
