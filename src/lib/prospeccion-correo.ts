// Prospección por correo — tipos, constantes y funciones puras (seguro para
// componentes de cliente). La lectura y escritura vive en
// `src/lib/prospeccion-correo-server.ts`; quien envía y lee Gmail es el
// trabajador del servidor (`reditus-servidor-kit/prospeccion-worker`), que le
// habla al CRM por `/api/servidor/prospeccion/**`.
//
// No hay tablas nuevas. Dos lugares guardan todo:
//
// 1. Campañas en frío (leads que todavía no son prospectos): JSON en Supabase
//    Storage, bucket PRIVADO `trabajos`, carpeta `prospeccion/`:
//
//      prospeccion/config.json                         pausa general, exclusiones, inicio del calentamiento
//      prospeccion/campanas/<id>.json                  la campaña (plantilla, estado, quién la activó)
//      prospeccion/leads/<campaña>/<estado>/<lead>.json  un archivo por lead; la carpeta dice su estado
//      prospeccion/destinatarios/<huella>.json         un archivo por dirección: último envío, baja, rebote
//      prospeccion/mensajes/<huella>.json              Message-ID → a quién pertenece (para ligar respuestas)
//      prospeccion/diario/<línea>/<día>.json           cuántos correos salieron hoy por esa cuenta
//
// 2. Correos de un prospecto ya creado (entrega del video y seguimientos):
//    dentro de la misma columna jsonb `respuestas_calificacion`, clave
//    `correos`, al lado de `prospeccion`.
import { CALENDLY_URL, SERVICIOS, type Servicio } from "@/lib/prospeccion";

export type Linea = Servicio;
export const LINEAS = SERVICIOS;

export const CARPETA_CORREO = "prospeccion";

/** Solo estos roles activan campañas y aprueban el envío de un video. */
export const ROLES_ACTIVAN_ENVIO = ["ceo", "gerente_comercial"];

// ------------------------------------------------------- reglas de envío ----

/** Tope diario por cuenta según la semana de calentamiento (1.ª, 2.ª, 3.ª, 4.ª en adelante). */
export const CALENTAMIENTO = [15, 30, 50, 65] as const;
/** Días después de la entrega en que sale cada seguimiento. */
export const DIAS_SEGUIMIENTO = [2, 5, 9] as const;
/** Horario laboral del país del lead: lunes a viernes, de `desde` a `hasta` (hora local). */
export const HORARIO = { desde: 9, hasta: 18 } as const;
/** Espera entre un correo y el siguiente; la aplica el trabajador. */
export const ESPERA_ENTRE_ENVIOS_SEG = { min: 150, max: 300 } as const;
/** Veces que se reintenta un envío que el servidor de correo rechazó. */
export const MAX_INTENTOS_ENVIO = 3;
export const MAX_LEADS_POR_CAMPANA = 1000;
/** La cuenta manda en hora de Colombia: el «día» del tope es el de Bogotá. */
export const ZONA_CUENTA = "America/Bogota";

export const FIRMA = "Sebastian Vargas · Reditus Consulting";
export const LINEA_BAJA = "Si prefieres no recibir más correos, responde «no» y no te vuelvo a escribir.";

const ZONAS: Record<string, string> = {
  colombia: "America/Bogota",
  co: "America/Bogota",
  mexico: "America/Mexico_City",
  mx: "America/Mexico_City",
  espana: "Europe/Madrid",
  es: "Europe/Madrid",
  spain: "Europe/Madrid",
  ecuador: "America/Guayaquil",
  ec: "America/Guayaquil",
  peru: "America/Lima",
  pe: "America/Lima",
  chile: "America/Santiago",
  cl: "America/Santiago",
  argentina: "America/Argentina/Buenos_Aires",
  ar: "America/Argentina/Buenos_Aires",
  "republica dominicana": "America/Santo_Domingo",
  rd: "America/Santo_Domingo",
  do: "America/Santo_Domingo",
  panama: "America/Panama",
  pa: "America/Panama",
  "costa rica": "America/Costa_Rica",
  cr: "America/Costa_Rica",
  guatemala: "America/Guatemala",
  gt: "America/Guatemala",
  "el salvador": "America/El_Salvador",
  sv: "America/El_Salvador",
  honduras: "America/Tegucigalpa",
  hn: "America/Tegucigalpa",
  nicaragua: "America/Managua",
  bolivia: "America/La_Paz",
  bo: "America/La_Paz",
  paraguay: "America/Asuncion",
  py: "America/Asuncion",
  uruguay: "America/Montevideo",
  uy: "America/Montevideo",
  venezuela: "America/Caracas",
  ve: "America/Caracas",
  "puerto rico": "America/Puerto_Rico",
  pr: "America/Puerto_Rico",
  "estados unidos": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
};

export function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Zona horaria del país del lead. Si no se reconoce, se usa la de Colombia. */
export function zonaDePais(pais: string): { zona: string; conocida: boolean } {
  const clave = sinAcentos(pais ?? "").toLowerCase().trim();
  const zona = ZONAS[clave];
  return zona ? { zona, conocida: true } : { zona: ZONA_CUENTA, conocida: false };
}

type Local = { dia: string; hora: number; minuto: number; diaSemana: number };

/** Fecha y hora de pared en una zona. `diaSemana`: 0 domingo … 6 sábado. */
export function horaLocal(zona: string, fecha: Date): Local {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(fecha);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  const semana = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    dia: `${p("year")}-${p("month")}-${p("day")}`,
    hora: Number(p("hour")),
    minuto: Number(p("minute")),
    diaSemana: semana.indexOf(p("weekday")),
  };
}

export function diaCuenta(fecha: Date): string {
  return horaLocal(ZONA_CUENTA, fecha).dia;
}

/** ¿Es horario laboral ahora en el país del lead? */
export function enHorario(pais: string, ahora: Date): boolean {
  const l = horaLocal(zonaDePais(pais).zona, ahora);
  return l.diaSemana >= 1 && l.diaSemana <= 5 && l.hora >= HORARIO.desde && l.hora < HORARIO.hasta;
}

/** Días de calendario entre dos días `AAAA-MM-DD`. */
export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

/** Tope del día para una cuenta. `inicio` es el día del primer envío real (null = aún no envía). */
export function topeDelDia(inicio: string | null, hoy: string): { tope: number; semana: number } {
  const dias = inicio ? Math.max(0, diasEntre(inicio, hoy)) : 0;
  const semana = Math.min(CALENTAMIENTO.length, Math.floor(dias / 7) + 1);
  return { tope: CALENTAMIENTO[semana - 1], semana };
}

// ------------------------------------------------- validación de correos ----

const DOMINIOS_PLANTILLA = new Set([
  "tutienda.com",
  "mitienda.com",
  "tudominio.com",
  "midominio.com",
  "dominio.com",
  "domain.com",
  "yourdomain.com",
  "yourstore.com",
  "mystore.com",
  "tuempresa.com",
  "empresa.com",
  "correo.com",
  "email.com",
  "mail.com",
  "ejemplo.com",
  "test.com",
  "sentry.io",
  "wixpress.com",
  "sentry-next.wixpress.com",
]);
const DOMINIOS_EJEMPLO = new Set(["example.com", "example.org", "example.net"]);
const LOCALES_PLANTILLA = new Set([
  "correo",
  "tucorreo",
  "micorreo",
  "email",
  "tuemail",
  "youremail",
  "your-email",
  "nombre",
  "tunombre",
  "usuario",
  "user",
  "ejemplo",
  "example",
  "name",
  "yourname",
  "xxx",
  "xxxx",
]);
const LOCALES_SIN_BUZON = /^(no-?reply|noreply|no-?responder|donotreply|do-not-reply|mailer-daemon|postmaster|bounce[s]?)$/;

/** Direcciones de los dominios reservados para ejemplos (example.com y sus subdominios). */
export function esDeEjemplo(correo: string): boolean {
  const dominio = correo.toLowerCase().slice(correo.indexOf("@") + 1);
  return [...DOMINIOS_EJEMPLO].some((d) => dominio === d || dominio.endsWith(`.${d}`));
}

export type ValidacionCorreo = { ok: true; correo: string } | { ok: false; motivo: string };

/**
 * Descarta lo que no es una dirección a la que tenga sentido escribir:
 * plantillas (`correo@tutienda.com`), direcciones con `<>`, dominios sin
 * sentido, buzones que no leen personas. `permitirEjemplo` solo se usa en
 * pruebas locales (dominios `example.com`).
 */
export function validarCorreo(crudo: string, opciones: { permitirEjemplo?: boolean } = {}): ValidacionCorreo {
  const original = String(crudo ?? "").trim();
  if (!original) return { ok: false, motivo: "sin correo" };
  if (/[<>]/.test(original)) return { ok: false, motivo: "trae < > (no es una dirección limpia)" };
  if (/[\s,;()"'\\]/.test(original)) return { ok: false, motivo: "trae espacios o signos que no van en un correo" };
  const correo = original.toLowerCase().replace(/^mailto:/, "");
  if (correo.length > 120) return { ok: false, motivo: "demasiado largo" };
  const m = /^([a-z0-9._%+-]+)@([a-z0-9.-]+)$/.exec(correo);
  if (!m) return { ok: false, motivo: "no tiene forma de correo" };
  const [, local, dominio] = m;
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return { ok: false, motivo: "puntos mal puestos" };
  const etiquetas = dominio.split(".");
  if (etiquetas.length < 2 || etiquetas.some((e) => !e || e.startsWith("-") || e.endsWith("-"))) {
    return { ok: false, motivo: "dominio inválido" };
  }
  const tld = etiquetas[etiquetas.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) return { ok: false, motivo: "dominio inválido" };
  if (/^(png|jpe?g|gif|webp|svg|css|js|html?|php)$/.test(tld)) return { ok: false, motivo: "es el nombre de un archivo, no un correo" };
  if (/^\d+$/.test(etiquetas[etiquetas.length - 2])) return { ok: false, motivo: "dominio sin sentido" };
  if (DOMINIOS_PLANTILLA.has(dominio)) return { ok: false, motivo: "es un correo de plantilla" };
  if (/^(test|example|invalid|localhost|local)$/.test(tld)) return { ok: false, motivo: "dominio reservado para pruebas" };
  if (esDeEjemplo(correo) && !opciones.permitirEjemplo) return { ok: false, motivo: "es un correo de ejemplo" };
  if (LOCALES_PLANTILLA.has(local)) return { ok: false, motivo: "es un correo de plantilla" };
  if (LOCALES_SIN_BUZON.test(local)) return { ok: false, motivo: "es un buzón que nadie lee" };
  if (/^[0-9a-f]{24,}$/.test(local)) return { ok: false, motivo: "parece un identificador, no una persona" };
  return { ok: true, correo };
}

/** Normaliza la lista de exclusión: una entrada por línea, correo o dominio. */
export function leerExclusiones(texto: string): string[] {
  const vistas = new Set<string>();
  for (const linea of String(texto ?? "").split(/[\n,;]+/)) {
    const e = linea.trim().toLowerCase().replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (e && /^[a-z0-9._%+@-]+\.[a-z]{2,24}$/.test(e)) vistas.add(e);
  }
  return [...vistas].slice(0, 2000);
}

export function estaExcluido(correo: string, exclusiones: string[]): boolean {
  const c = correo.toLowerCase();
  const dominio = c.slice(c.indexOf("@") + 1);
  return exclusiones.some((e) => (e.includes("@") ? e === c : dominio === e || dominio.endsWith(`.${e}`)));
}

// ------------------------------------------------------------- campañas ----

export const ESTADOS_CAMPANA = ["borrador", "activa", "pausada"] as const;
export type EstadoCampana = (typeof ESTADOS_CAMPANA)[number];
export const ESTADO_CAMPANA_LABELS: Record<EstadoCampana, string> = {
  borrador: "Sin activar",
  activa: "Activa",
  pausada: "En pausa",
};

export type Campana = {
  id: string;
  nombre: string;
  linea: Linea;
  estado: EstadoCampana;
  /** Primera línea «Asunto: …», luego el cuerpo. Variables entre llaves dobles. */
  plantilla: string;
  /** Si la IA reescribe cada correo a partir de la plantilla y los datos del lead. */
  usarIA: boolean;
  creada: string;
  creadaPor: string;
  activada: { por: string; porId: string; fecha: string } | null;
  /** Leads importados hasta ahora (numera los archivos para conservar el orden). */
  consecutivo: number;
  /** Correos confirmados como enviados, por día de Bogotá. */
  enviosPorDia: Record<string, number>;
  /** Filas que no entraron al importar, con su motivo. */
  descartes: { correo: string; tienda: string; motivo: string }[];
  historial: { fecha: string; quien: string; accion: string }[];
};

export const ESTADOS_LEAD = ["pendientes", "en-envio", "enviados", "respondidos", "rebotados", "bajas", "fallidos"] as const;
export type EstadoLead = (typeof ESTADOS_LEAD)[number];
export const ESTADO_LEAD_LABELS: Record<EstadoLead, string> = {
  pendientes: "Por enviar",
  "en-envio": "Saliendo",
  enviados: "Enviados",
  respondidos: "Respondieron",
  rebotados: "Rebotaron",
  bajas: "Pidieron no recibir",
  fallidos: "No se pudo enviar",
};

export const CLASIFICACIONES = ["interesado", "no_interesado", "automatica", "otro_correo", "rebote", "por_revisar"] as const;
export type Clasificacion = (typeof CLASIFICACIONES)[number];
export const CLASIFICACION_LABELS: Record<Clasificacion, string> = {
  interesado: "Interesado",
  no_interesado: "No interesado",
  automatica: "Respuesta automática",
  otro_correo: "Pide escribir a otro correo",
  rebote: "Rebote",
  por_revisar: "Por revisar",
};

export type Lead = {
  id: string;
  campanaId: string;
  linea: Linea;
  tienda: string;
  url: string;
  correo: string;
  producto: string;
  falencia: string;
  pais: string;
  intentos: number;
  /** Lo que se redactó para este lead (queda fijo desde que se entrega al trabajador). */
  asunto: string;
  cuerpo: string;
  redactadoCon: "ia" | "plantilla" | null;
  entregadoAt: string | null;
  incierto: boolean;
  enviadoAt: string | null;
  messageId: string | null;
  respuesta: { fecha: string; de: string; texto: string; clasificacion: Clasificacion; messageId: string | null } | null;
  rebote: { fecha: string; diagnostico: string } | null;
  prospectoId: string | null;
  nota: string;
};

export type LeadEntrada = Pick<Lead, "tienda" | "url" | "correo" | "producto" | "falencia" | "pais"> & { linea: string };

const ENCABEZADOS: Record<string, keyof LeadEntrada> = {
  tienda: "tienda",
  nombre: "tienda",
  marca: "tienda",
  url: "url",
  web: "url",
  sitio: "url",
  "url tienda": "url",
  enlace: "url",
  correo: "correo",
  email: "correo",
  "e-mail": "correo",
  mail: "correo",
  producto: "producto",
  "producto estrella": "producto",
  falencia: "falencia",
  problema: "falencia",
  "falencia detectada": "falencia",
  pais: "pais",
  linea: "linea",
  servicio: "linea",
};
const ORDEN_FIJO: (keyof LeadEntrada)[] = ["tienda", "url", "correo", "producto", "falencia", "pais", "linea"];

function partirFila(fila: string, sep: string): string[] {
  const celdas: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < fila.length; i++) {
    const c = fila[i];
    if (comillas) {
      if (c === '"' && fila[i + 1] === '"') {
        actual += '"';
        i++;
      } else if (c === '"') comillas = false;
      else actual += c;
    } else if (c === '"' && !actual) comillas = true;
    else if (c === sep) {
      celdas.push(actual.trim());
      actual = "";
    } else actual += c;
  }
  celdas.push(actual.trim());
  return celdas;
}

/**
 * Lee una lista pegada o un CSV (coma, punto y coma o tabulador). Con fila de
 * encabezados las columnas pueden ir en cualquier orden; sin ella se asume
 * tienda, URL, correo, producto, falencia, país, línea.
 */
export function leerLeadsPegados(texto: string): { filas: LeadEntrada[]; conEncabezados: boolean } {
  const lineas = String(texto ?? "")
    .replace(/^\ufeff/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (!lineas.length) return { filas: [], conEncabezados: false };
  const primera = lineas[0];
  const sep = primera.includes("\t") ? "\t" : (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const cabecera = partirFila(primera, sep).map((c) => ENCABEZADOS[sinAcentos(c).toLowerCase().replace(/[_]+/g, " ").trim()]);
  const conEncabezados = cabecera.includes("correo");
  const columnas = conEncabezados ? cabecera : ORDEN_FIJO;
  const filas: LeadEntrada[] = [];
  for (const linea of lineas.slice(conEncabezados ? 1 : 0)) {
    const celdas = partirFila(linea, sep);
    const f: LeadEntrada = { tienda: "", url: "", correo: "", producto: "", falencia: "", pais: "", linea: "" };
    columnas.forEach((col, i) => {
      if (col && celdas[i]) f[col] = celdas[i].slice(0, col === "falencia" ? 1200 : 300);
    });
    filas.push(f);
  }
  return { filas, conEncabezados };
}

// ------------------------------------------------------------ plantillas ----

export const VARIABLES_PLANTILLA = ["tienda", "producto", "falencia", "pais", "url"] as const;

export const PLANTILLA_INICIAL: Record<Linea, string> = {
  video: `Asunto: Un video de muestra para {{producto}}

Hola, equipo de {{tienda}}.

Soy Sebastian, de Reditus Consulting. Hacemos videos publicitarios para tiendas en línea.

Me gustaría prepararles, sin costo, un video de muestra para {{producto}}, para que vean cómo trabajamos antes de decidir nada.

¿Les interesa? Con responder «sí» a este correo lo preparo.

${FIRMA}

${LINEA_BAJA}`,
  landing: `Asunto: Una muestra de página para {{producto}}

Hola, equipo de {{tienda}}.

Soy Sebastian, de Reditus Consulting. Diseñamos páginas de producto para tiendas en línea.

Me gustaría prepararles, sin costo, una muestra de cómo se vería la página de {{producto}} pensada para que comprar tome menos pasos.

¿Les interesa? Con responder «sí» a este correo la preparo.

${FIRMA}

${LINEA_BAJA}`,
};

/** Reemplaza `{{variable}}`. Lo que no exista queda vacío. */
export function aplicarPlantilla(plantilla: string, lead: Pick<Lead, "tienda" | "producto" | "falencia" | "pais" | "url">): string {
  return plantilla.replace(/\{\{\s*([a-zA-Záéíóúñ_]+)\s*\}\}/g, (_, nombre: string) => {
    const clave = sinAcentos(nombre).toLowerCase() as (typeof VARIABLES_PLANTILLA)[number];
    return (VARIABLES_PLANTILLA as readonly string[]).includes(clave) ? String(lead[clave] ?? "").trim() : "";
  });
}

/** Separa la línea «Asunto: …» del resto. */
export function separarAsunto(texto: string, porDefecto = "Una muestra para tu tienda"): { asunto: string; cuerpo: string } {
  const t = String(texto ?? "").replace(/\r\n/g, "\n").trim();
  const m = /^\s*asunto\s*:\s*(.+)\n?/i.exec(t);
  if (!m) return { asunto: porDefecto, cuerpo: t };
  return { asunto: m[1].trim().replace(/[\r\n]+/g, " ").slice(0, 150) || porDefecto, cuerpo: t.slice(m[0].length).trim() };
}

/** Todo correo lleva la línea para darse de baja y la firma. */
export function asegurarPie(cuerpo: string): string {
  let c = cuerpo.trim();
  if (!/reditus/i.test(c)) c += `\n\n${FIRMA}`;
  if (!/responde[n]?\s+[«"“']?no[»"”']?/i.test(c) && !/no recibir m[aá]s/i.test(c)) c += `\n\n${LINEA_BAJA}`;
  return c;
}

export function problemasPlantilla(plantilla: string): string[] {
  const p: string[] = [];
  const { cuerpo } = separarAsunto(plantilla, "");
  if (!/^\s*asunto\s*:/i.test(plantilla)) p.push("Falta la primera línea «Asunto: …».");
  if (cuerpo.length < 40) p.push("El cuerpo está vacío o es demasiado corto.");
  if (/[$€]\s?\d|\d\s?(usd|cop|eur|mxn)\b/i.test(plantilla)) p.push("No pongas precios en el correo.");
  const desconocidas = [...plantilla.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
    .map((m) => sinAcentos(m[1]).toLowerCase())
    .filter((v) => !(VARIABLES_PLANTILLA as readonly string[]).includes(v));
  if (desconocidas.length) p.push(`Variables que no existen: ${[...new Set(desconocidas)].join(", ")}.`);
  return p;
}

/** Los tres seguimientos sin IA. `n` de 1 a 3. */
export function seguimientoBase(n: number, d: { nombre: string; producto: string; pieza: string; enlace: string }): string {
  // El nombre suele ser el de la tienda («Tienda Uno»): saludar con su primera palabra queda raro.
  const hola = "Hola de nuevo.";
  const producto = d.producto || "tu producto";
  const cuerpos = [
    `${hola}\n\n¿Pudiste ver ${d.pieza} de ${producto}? Te dejo el enlace otra vez:\n${d.enlace}\n\nSi quieres que le ajuste algo, dime y lo cambio.`,
    `${hola}\n\nTe escribo corto: si ${d.pieza} te sirvió, en 15 minutos te muestro cómo sería un paquete completo para tu tienda. Puedes agendar aquí:\n${CALENDLY_URL}\n\nSi prefieres coordinar por WhatsApp, pásame tu número.`,
    `${hola}\n\nEste es mi último mensaje sobre ${d.pieza} de ${producto}, para no llenarte la bandeja. Queda disponible aquí:\n${d.enlace}\n\nSi más adelante quieres retomarlo, responde este correo o agenda cuando te quede bien:\n${CALENDLY_URL}`,
  ];
  return `${cuerpos[Math.min(3, Math.max(1, n)) - 1]}\n\n${FIRMA}\n\n${LINEA_BAJA}`;
}

// ---------------------------------------------------------- clasificación ----

const CORREO_EN_TEXTO = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;

/** Quita el mensaje citado y las firmas típicas, para clasificar solo lo que la persona escribió. */
export function soloLoEscrito(texto: string): string {
  const lineas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  const fin = lineas.findIndex(
    (l) =>
      /^\s*>/.test(l) ||
      /^\s*(el|on)\s.+(escribi[oó]|wrote)\s*:?\s*$/i.test(l) ||
      /^\s*-{2,}\s*(mensaje original|original message|forwarded)/i.test(l) ||
      /^\s*(de|from)\s*:\s.+@/i.test(l) ||
      /^\s*enviado desde mi/i.test(l) ||
      /^\s*sent from my/i.test(l),
  );
  return (fin >= 0 ? lineas.slice(0, fin) : lineas).join("\n").trim();
}

/**
 * Clasifica sin IA. Devuelve null cuando no hay una señal clara (entonces lo
 * decide la IA o queda «por revisar»). `otroCorreo` es la dirección nueva.
 */
export function clasificarPorReglas(
  textoCrudo: string,
  remitente: string,
): { clasificacion: Clasificacion; baja: boolean; otroCorreo: string | null } | null {
  const escrito = soloLoEscrito(textoCrudo);
  const t = sinAcentos(escrito).toLowerCase().replace(/[¡!¿?.,;:«»"“”']+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;

  if (/(fuera de la oficina|out of office|respuesta automatica|automatic reply|auto ?reply|autorespuesta|estare ausente|estoy de vacaciones|hemos recibido tu (mensaje|solicitud|correo)|we have received your|ticket (number|#|numero)|no responda a este (mensaje|correo))/.test(t)) {
    return { clasificacion: "automatica", baja: false, otroCorreo: null };
  }
  if (/(no (me|nos|les) (escrib|contact|envi|mand)|no (volver|vuelvan?|vuelvas) a (escribir|contactar)|dar(me|nos)? de baja|darse de baja|unsubscribe|remove me|elimin\w+ de (su|la|tu|esta) (lista|base)|no dese[oa]mos? recibir|no quier[oe]\w* recibir|dej[ae]n? de (escribir|enviar)|esto es spam|\bstop\b)/.test(t)) {
    return { clasificacion: "no_interesado", baja: true, otroCorreo: null };
  }
  const otros = [...escrito.matchAll(CORREO_EN_TEXTO)].map((m) => m[0].toLowerCase()).filter((c) => c !== remitente.toLowerCase());
  if (otros.length && /(escrib|contact|envi|comunic|dirig|reenvi|mand|encargad|responsable|write to|reach)/.test(t)) {
    return { clasificacion: "otro_correo", baja: false, otroCorreo: otros[0] };
  }
  if (/^(no|no gracias|no thanks|no thank you|nop|nope)( gracias)?$/.test(t) || /\bno (me|nos|estamos|estoy) interesa(dos|do|da|n)?\b|\bno (estamos|estoy) interesad|\bno gracias\b|\bnot interested\b|\bno por ahora\b|\bpor ahora no\b/.test(t)) {
    return { clasificacion: "no_interesado", baja: true, otroCorreo: null };
  }
  if (
    /^(si|claro|dale|ok|okay|listo|perfecto|de una|adelante|hagamoslo|va|bueno|genial|yes|sure|por supuesto|me interesa|nos interesa|si por favor|si claro|si gracias)\b/.test(t) ||
    /\b(me interesa|nos interesa|si quiero|si queremos|envi[ae]n?(me|lo|nos|melo|noslo)|mand[ae]n?(me|lo|nos|melo)|quiero (el|la|ver)|queremos (el|la|ver)|cuentame mas|mas informacion|im interested)\b/.test(t)
  ) {
    return { clasificacion: "interesado", baja: false, otroCorreo: null };
  }
  return null;
}

// --------------------------------------------- correos de un prospecto ----

export const PASOS = ["entrega", "seguimiento_1", "seguimiento_2", "seguimiento_3"] as const;
export type Paso = (typeof PASOS)[number];
export const PASO_LABELS: Record<Paso, string> = {
  entrega: "Entrega de la pieza",
  seguimiento_1: "Seguimiento 1",
  seguimiento_2: "Seguimiento 2",
  seguimiento_3: "Seguimiento 3",
};

export type TipoEvento = "inicial" | Paso | "respuesta" | "automatica" | "rebote" | "baja";
export const TIPO_EVENTO_LABELS: Record<TipoEvento, string> = {
  inicial: "Correo inicial",
  ...PASO_LABELS,
  respuesta: "Respondió",
  automatica: "Respuesta automática",
  rebote: "Rebotó",
  baja: "Pidió no recibir más",
};

export type EventoCorreo = {
  tipo: TipoEvento;
  fecha: string;
  asunto: string;
  texto: string;
  messageId: string | null;
  clasificacion: Clasificacion | null;
};

export const ESTADOS_SEGUIMIENTO = ["sin_iniciar", "activos", "cortados", "completos"] as const;
export type EstadoSeguimiento = (typeof ESTADOS_SEGUIMIENTO)[number];
export const ESTADO_SEGUIMIENTO_LABELS: Record<EstadoSeguimiento, string> = {
  sin_iniciar: "Sin iniciar",
  activos: "Activos",
  cortados: "Detenidos",
  completos: "Completos",
};

export type CorreosProspecto = {
  /** Aprobación explícita del envío (CEO o gerente comercial). Sin esto nada sale. */
  aprobado: { por: string; porId: string; fecha: string } | null;
  /** Paso que el trabajador tiene en la mano. */
  enEnvio: { paso: Paso; desde: string; incierto: boolean } | null;
  eventos: EventoCorreo[];
  seguimientos: { estado: EstadoSeguimiento; motivo: string; textos: string[] };
  /** Hilo del correo inicial, para que la entrega llegue como respuesta en la misma conversación. */
  hilo: { asunto: string; ids: string[] } | null;
  origen: { campanaId: string; leadId: string } | null;
};

export const CORREOS_VACIO: CorreosProspecto = {
  aprobado: null,
  enEnvio: null,
  eventos: [],
  seguimientos: { estado: "sin_iniciar", motivo: "", textos: [] },
  hilo: null,
  origen: null,
};

function txt(v: unknown, max = 8000): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Lee `respuestas_calificacion.correos`. Siempre devuelve un bloque válido. */
export function leerCorreos(raw: unknown): CorreosProspecto {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>).correos : null;
  if (!c || typeof c !== "object" || Array.isArray(c)) return structuredClone(CORREOS_VACIO);
  const o = c as Record<string, unknown>;
  const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
  const ap = obj(o.aprobado);
  const en = obj(o.enEnvio);
  const seg = obj(o.seguimientos);
  const hilo = obj(o.hilo);
  const origen = obj(o.origen);
  const tipos = Object.keys(TIPO_EVENTO_LABELS);
  return {
    aprobado: ap && txt(ap.fecha) ? { por: txt(ap.por, 160), porId: txt(ap.porId, 40), fecha: txt(ap.fecha, 40) } : null,
    enEnvio:
      en && (PASOS as readonly string[]).includes(txt(en.paso))
        ? { paso: en.paso as Paso, desde: txt(en.desde, 40), incierto: en.incierto === true }
        : null,
    eventos: (Array.isArray(o.eventos) ? o.eventos : [])
      .map(obj)
      .filter((e): e is Record<string, unknown> => !!e && tipos.includes(txt(e.tipo)))
      .map((e) => ({
        tipo: e.tipo as TipoEvento,
        fecha: txt(e.fecha, 40),
        asunto: txt(e.asunto, 300),
        texto: txt(e.texto),
        messageId: txt(e.messageId, 400) || null,
        clasificacion: (CLASIFICACIONES as readonly string[]).includes(txt(e.clasificacion)) ? (e.clasificacion as Clasificacion) : null,
      })),
    seguimientos: {
      estado: (ESTADOS_SEGUIMIENTO as readonly string[]).includes(txt(seg?.estado)) ? (seg!.estado as EstadoSeguimiento) : "sin_iniciar",
      motivo: txt(seg?.motivo, 300),
      textos: (Array.isArray(seg?.textos) ? seg!.textos : []).map((t) => txt(t, 4000)).slice(0, 3),
    },
    hilo: hilo && Array.isArray(hilo.ids) ? { asunto: txt(hilo.asunto, 300), ids: hilo.ids.map((i) => txt(i, 400)).filter(Boolean).slice(-10) } : null,
    origen: origen && txt(origen.campanaId) ? { campanaId: txt(origen.campanaId, 60), leadId: txt(origen.leadId, 60) } : null,
  };
}

/** El paso que toca ahora para un prospecto, o null. No mira horario ni topes. */
export function pasoQueToca(c: CorreosProspecto, paisDelLead: string, ahora: Date): { paso: Paso; n: number } | null {
  if (!c.aprobado || c.enEnvio) return null;
  const entrega = c.eventos.find((e) => e.tipo === "entrega");
  if (!entrega) return { paso: "entrega", n: 0 };
  if (c.seguimientos.estado !== "activos") return null;
  const hechos = c.eventos.filter((e) => e.tipo.startsWith("seguimiento_")).length;
  if (hechos >= DIAS_SEGUIMIENTO.length) return null;
  const zona = zonaDePais(paisDelLead).zona;
  const pasados = diasEntre(horaLocal(zona, new Date(entrega.fecha)).dia, horaLocal(zona, ahora).dia);
  return pasados >= DIAS_SEGUIMIENTO[hechos] ? { paso: PASOS[hechos + 1], n: hechos + 1 } : null;
}

/** Cuándo sale el próximo seguimiento (día local del lead), para mostrarlo. */
export function proximoSeguimiento(c: CorreosProspecto, paisDelLead: string): { n: number; dia: string } | null {
  const entrega = c.eventos.find((e) => e.tipo === "entrega");
  if (!entrega || c.seguimientos.estado !== "activos") return null;
  const hechos = c.eventos.filter((e) => e.tipo.startsWith("seguimiento_")).length;
  if (hechos >= DIAS_SEGUIMIENTO.length) return null;
  const base = horaLocal(zonaDePais(paisDelLead).zona, new Date(entrega.fecha)).dia;
  const dia = new Date(Date.parse(`${base}T00:00:00Z`) + DIAS_SEGUIMIENTO[hechos] * 86_400_000).toISOString().slice(0, 10);
  return { n: hechos + 1, dia };
}

// --------------------------------------------------------------- resumen ----

export type ConfigCorreo = {
  pausaGeneral: boolean;
  exclusiones: string[];
  /** Día (Bogotá) del primer envío real de cada cuenta: de ahí cuenta el calentamiento. */
  inicio: Record<Linea, string | null>;
};

export type UsoCuenta = { linea: Linea; tope: number; semana: number; usados: number };

export type ResumenCampana = {
  campana: Campana;
  cuentas: Record<EstadoLead, number>;
  enviadosHoy: number;
  muestra: Lead | null;
  respuestas: Lead[];
  sinConfirmar: number;
};
