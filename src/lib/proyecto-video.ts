// Video como PROYECTO POR ESCENAS — tipos y funciones puras (seguro para
// componentes de cliente). Contrato con el trabajador:
// `servidor/CONTRATO-PROYECTO-VIDEO.md`.
//
// Lo caro es generar clips. Por eso el proyecto avanza por etapas con una
// persona en medio: imágenes base → se aprueban → clips solo de lo aprobado →
// se aprueban → armado (sin costo) → el final queda «Por aprobar». Una
// corrección rehace solo la pieza afectada.
//
// El proyecto vive DENTRO de la versión del guion (`VersionGuion.proyecto`),
// en el mismo JSON de Storage. Quién escribe qué:
//   · las acciones de `/videos` (una persona) escriben el guion y su proyecto;
//   · el trabajador solo escribe en SU trabajo de la cola (`reportes`).
// `plegarTrabajos` pasa lo que reportó el trabajador al proyecto. Es
// idempotente: si se repite no cambia nada, y nada reportado se pierde aunque
// dos escrituras del guion se pisen.
import type { TrabajoVideo } from "@/lib/trabajos-video";
import type { Exigencia } from "@/lib/videos-config";

/** Tope de intentos por escena y por tipo (imagen / clip) cuando no hay configuración. El vigente lo pone el CEO y viaja en `proyecto.topeIntentos`. */
export const TOPE_INTENTOS_ESCENA = 3;
export const MAX_ESCENAS_PROYECTO = 20;
export const MAX_FOTOS_PROYECTO = 4;

export const ESTADOS_PIEZA = ["pendiente", "en-cola", "generando", "por-aprobar", "aprobada", "rechazada", "fallo"] as const;
export type EstadoPieza = (typeof ESTADOS_PIEZA)[number];
export const ESTADO_PIEZA_LABELS: Record<EstadoPieza, string> = {
  pendiente: "Sin generar",
  "en-cola": "En cola",
  generando: "Generando",
  "por-aprobar": "Por aprobar",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
  fallo: "Falló",
};
export type Tono = "neutro" | "azul" | "ambar" | "verde" | "rojo";
export const TONO_PIEZA: Record<EstadoPieza, Tono> = {
  pendiente: "neutro",
  "en-cola": "neutro",
  generando: "azul",
  "por-aprobar": "ambar",
  aprobada: "verde",
  rechazada: "rojo",
  fallo: "rojo",
};

export const TIPOS_ESCENA = ["generada", "foto-real", "cierre"] as const;
export type TipoEscena = (typeof TIPOS_ESCENA)[number];
export const TIPO_ESCENA_LABELS: Record<TipoEscena, string> = {
  generada: "Generada con IA",
  "foto-real": "Foto real animada",
  cierre: "Cierre con foto real",
};

export const MOVIMIENTOS = ["acercar", "alejar", "paneo-izq", "paneo-der", "quieto"] as const;
export type Movimiento = (typeof MOVIMIENTOS)[number];
export const MOVIMIENTO_LABELS: Record<Movimiento, string> = {
  acercar: "Acercar",
  alejar: "Alejar",
  "paneo-izq": "Paneo a la izquierda",
  "paneo-der": "Paneo a la derecha",
  quieto: "Quieto",
};

// ---- la voz: la genera el modelo de video DENTRO de cada clip (decisión del dueño) ----

/** Quién dice la frase de una escena. */
export const LOCUCIONES = ["camara", "narrador", "texto", "sin-voz"] as const;
export type Locucion = (typeof LOCUCIONES)[number];
export const LOCUCION_LABELS: Record<Locucion, string> = {
  camara: "La persona en cámara",
  narrador: "Narrador (fuera de cámara)",
  texto: "Solo texto en pantalla",
  "sin-voz": "Nadie habla",
};

export type VozProyecto = {
  /** `clip`: la voz sale del propio clip generado (por defecto). `narracion`: locución aparte al armar (ElevenLabs), apagada salvo que se pida. */
  motor: "clip" | "narracion";
  /** BCP-47: es-CO, es-ES, es-MX, en-US… */
  idioma: string;
  /** El acento, dicho para el modelo. */
  acento: string;
  /** Descripción fija de la voz/personaje. Va IDÉNTICA en todos los clips: es lo único que sostiene la continuidad de voz. */
  descripcion: string;
};

const ACENTOS: Record<string, { idioma: string; acento: string }> = {
  CO: { idioma: "es-CO", acento: "español de Colombia, acento colombiano neutro" },
  EC: { idioma: "es-EC", acento: "español de Ecuador, acento ecuatoriano de la sierra, neutro" },
  MX: { idioma: "es-MX", acento: "español de México, acento mexicano neutro" },
  PE: { idioma: "es-PE", acento: "español de Perú, acento peruano neutro" },
  CL: { idioma: "es-CL", acento: "español de Chile, acento chileno suave y claro" },
  AR: { idioma: "es-AR", acento: "español rioplatense de Argentina, con voseo" },
  PA: { idioma: "es-PA", acento: "español de Panamá, acento panameño neutro" },
  DO: { idioma: "es-DO", acento: "español de República Dominicana, acento dominicano claro" },
  GT: { idioma: "es-GT", acento: "español de Guatemala, acento centroamericano neutro" },
  VE: { idioma: "es-VE", acento: "español de Venezuela, acento venezolano neutro" },
  ES: { idioma: "es-ES", acento: "castellano peninsular (España), con distinción de z y c, y «vosotros»" },
  US: { idioma: "es-US", acento: "español latino neutro para público hispano de Estados Unidos" },
};

/** El idioma y el acento que le corresponden al país del proyecto. */
export function acentoDePais(pais: string): { idioma: string; acento: string } {
  return ACENTOS[pais] ?? { idioma: "es", acento: "español latino neutro" };
}

export const VOZ_DESCRIPCION_BASE = "voz adulta joven, cálida y cercana, ritmo natural de conversación, sin tono de locutor";

export function vozDePais(pais: string, motor: VozProyecto["motor"] = "clip"): VozProyecto {
  return { motor, ...acentoDePais(pais), descripcion: VOZ_DESCRIPCION_BASE };
}

/** Duración máxima de un clip generado (el modelo no da más en una toma). */
export const MAX_SEGUNDOS_CLIP = 8;

export const contarPalabras = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Palabras que caben dichas con naturalidad en un clip de esa duración (deja ~1 s de aire). */
export function palabrasQueCaben(duracion: number): number {
  return Math.max(4, Math.round((Math.min(duracion, MAX_SEGUNDOS_CLIP) - 1) * 2.6));
}

export const NOMBRE_PASO: Record<number, string> = { 1: "Impacto", 2: "Bajada", 3: "Refuerzo", 4: "Subida", 5: "Cierre" };

export type TipoPieza = "imagen" | "clip";

export type Pieza = {
  estado: EstadoPieza;
  url: string | null;
  /** Veces que se mandó a generar. Al llegar al tope no se encola más. */
  intentos: number;
  /** Por qué se rechazó o por qué falló. Viaja al trabajador como corrección. */
  nota: string;
  /** Trabajo de la cola que la está generando o la generó (uso interno del CRM). */
  trabajoId: string | null;
  /** Quién la aprobó o rechazó. */
  revisadaPor: string;
  /** Lo que dijo la revisión automática de la imagen (IA de visión). Null si no se revisó sola. */
  revision: RevisionIA | null;
  /** Ya se regeneró sola una vez por un rechazo automático: la siguiente decisión es de una persona. */
  autoRegenerada: boolean;
};

export const VEREDICTOS = ["aprobada-auto", "dudosa", "rechazada-auto", "sin-ia"] as const;
export type Veredicto = (typeof VEREDICTOS)[number];
export const VEREDICTO_LABELS: Record<Veredicto, string> = {
  "aprobada-auto": "Aprobada por IA",
  dudosa: "Dudosa: decide una persona",
  "rechazada-auto": "Rechazada por IA",
  "sin-ia": "Sin revisión automática",
};
/** La lista corta y fija con la que la IA califica una imagen base. */
export const CRITERIOS_IMAGEN = {
  producto: "Producto reconocible y sin deformar (forma, color, etiqueta)",
  texto: "Sin texto inventado o ilegible sobre el producto",
  personas: "Manos y rostros sin defectos evidentes",
  encuadre: "Encuadre correcto para el formato",
  escena: "Coincide con lo pedido en la escena",
} as const;
export type Criterio = keyof typeof CRITERIOS_IMAGEN;
export type NotaCriterio = "ok" | "duda" | "mal" | "no-aplica";
export type RevisionIA = { veredicto: Veredicto; motivo: string; criterios: Partial<Record<Criterio, NotaCriterio>>; fecha: string };

/** Por qué se detuvo el modo directo. Cada una dice qué falta y se resuelve con un botón. */
export const CODIGOS_PARADA = ["imagen-dudosa", "revisar-clips", "tope-intentos", "tope-diario", "tope-gasto", "servidor", "fallo", "datos"] as const;
export type CodigoParada = (typeof CODIGOS_PARADA)[number];
export type Parada = { codigo: CodigoParada; texto: string; fecha: string };

/** Cuánto avanza solo el proyecto. Los valores iniciales salen de la configuración global. */
export type AutoProyecto = {
  /** Modo directo: avanza solo hasta «Video por aprobar» y se detiene únicamente cuando hace falta una persona. */
  activo: boolean;
  /** La IA aprueba sola las imágenes que pasan la lista. */
  imagenes: boolean;
  exigencia: Exigencia;
  /** Al terminar los clips se arma de una vez; la persona revisa el video armado. */
  armarDirecto: boolean;
  parada: Parada | null;
};
export const AUTO_APAGADO: AutoProyecto = { activo: false, imagenes: false, exigencia: "estricto", armarDirecto: false, parada: null };

export type EscenaProyecto = {
  n: number;
  /** Paso de la estructura: 1 impacto … 5 cierre. */
  paso: number;
  tipo: TipoEscena;
  /** Rótulo corto para reconocerla en la tira. */
  titulo: string;
  /** Segundos objetivo. */
  duracion: number;
  /** Lo que se dice (voz y subtítulos): la frase de ESTA escena, que cabe en su clip. */
  voz: string;
  /** Quién la dice. */
  locucion: Locucion;
  promptImagen: string;
  promptVideo: string;
  /** Foto real que se anima (tipos `foto-real` y `cierre`). */
  fotoUrl: string | null;
  movimiento: Movimiento;
  imagen: Pieza;
  clip: Pieza;
  /**
   * APERTURA en cortes: el clip se genera de `duracionClip` segundos (uno solo, se paga una vez) y el
   * servidor de videos usa SOLO estos tramos, pegados en orden: varias tomas muy cortas de un solo clip.
   * La escena dura en el video la suma de los tramos (`duracion`).
   */
  cortes?: Corte[];
  /** Segundos que se le piden al generador para el clip cuando no coincide con `duracion` (apertura en cortes). */
  duracionClip?: number;
  /** Cómo ENTRA esta escena (la dibuja el servidor de videos). Sin valor, la elige él según el ritmo. */
  transicion?: Transicion;
  /** Segundos de la escena en los que debe haber un cambio visual (acercamiento brusco o reencuadre) para que ninguna toma pase de ~3 s igual. */
  golpesVisuales?: number[];
};

/** Las transiciones que sabe dibujar el servidor de videos (`lib/efectos.js`). */
export const TRANSICIONES = ["corte", "zoom", "barrido", "flash", "glitch", "deslizar", "fundido"] as const;
export type Transicion = (typeof TRANSICIONES)[number];
export const TRANSICION_LABELS: Record<Transicion, string> = { corte: "Corte seco", zoom: "Acercamiento brusco", barrido: "Barrido", flash: "Destello", glitch: "Interferencia", deslizar: "Deslizar", fundido: "Fundido suave" };

/** Los momentos de una toma de `segundos` en los que hace falta un cambio visual: uno cada ~2,7 s, nunca pegado al final. */
export function golpesPara(segundos: number): number[] {
  const n = Math.floor((segundos - 0.6) / 2.7);
  return Array.from({ length: Math.max(0, n) }, (_, i) => Math.round(((segundos / (n + 1)) * (i + 1)) * 10) / 10);
}

export type Corte = { desde: number; hasta: number };

/** Los tramos de la apertura según lo que debe durar (3 o 4 s): un golpe de 1 s y tres tomas muy cortas, de un clip de 8 s. */
export function cortesDeApertura(segundos: number): Corte[] {
  return segundos >= 4
    ? [{ desde: 0, hasta: 1 }, { desde: 2, hasta: 3 }, { desde: 4.2, hasta: 5.2 }, { desde: 6.2, hasta: 7.2 }]
    : [{ desde: 0, hasta: 1 }, { desde: 2.2, hasta: 2.9 }, { desde: 4.2, hasta: 4.9 }, { desde: 6.2, hasta: 6.8 }];
}

function leerCortes(raw: unknown): Corte[] {
  return (Array.isArray(raw) ? raw : [])
    .map((r) => {
      const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
      const desde = typeof o.desde === "number" && Number.isFinite(o.desde) ? Math.max(0, Math.round(o.desde * 10) / 10) : NaN;
      const hasta = typeof o.hasta === "number" && Number.isFinite(o.hasta) ? Math.min(MAX_SEGUNDOS_CLIP, Math.round(o.hasta * 10) / 10) : NaN;
      return { desde, hasta };
    })
    .filter((c) => c.hasta - c.desde >= 0.3)
    .slice(0, 6);
}

// ---- estilo de edición del proyecto (lo aplica el servidor de videos al armar) ----
export const ESTILOS_SUBTITULOS = ["palabra", "caja", "limpio", "impacto"] as const;
export type EstiloSubtitulos = (typeof ESTILOS_SUBTITULOS)[number];
export const ESTILO_SUBTITULOS_LABELS: Record<EstiloSubtitulos, string> = {
  palabra: "Palabra por palabra (resalta la que suena)",
  caja: "En caja de color (frases cortas)",
  limpio: "Limpio (una línea blanca, sobrio)",
  impacto: "De impacto (mayúsculas grandes, una o dos palabras)",
};
export const RITMOS = ["muy-rapido", "rapido", "medio", "calmado"] as const;
export type Ritmo = (typeof RITMOS)[number];
export const RITMO_LABELS: Record<Ritmo, string> = {
  "muy-rapido": "Muy rápido (un cambio visual cada segundo y medio, transiciones enérgicas)",
  rapido: "Rápido (transiciones variadas, ninguna toma quieta)",
  medio: "Medio",
  calmado: "Calmado (marca sobria: cortes secos y fundidos)",
};
export type EdicionProyecto = { subtitulos: EstiloSubtitulos; ritmo: Ritmo };

/** El estilo que le va a cada formato cuando nadie lo ha elegido: dinámico por defecto. */
export function edicionDeFormato(formato: string): EdicionProyecto {
  if (formato === "ugc" || formato === "testimonio" || formato === "entrevista") return { subtitulos: "palabra", ritmo: "rapido" };
  if (formato === "historia" || formato === "historias-musicales") return { subtitulos: "limpio", ritmo: "rapido" };
  if (formato === "usos-del-producto") return { subtitulos: "caja", ritmo: "rapido" };
  return { subtitulos: "impacto", ritmo: "rapido" };
}
export function leerEdicion(raw: unknown, formato = ""): EdicionProyecto {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = edicionDeFormato(formato);
  return {
    subtitulos: (ESTILOS_SUBTITULOS as readonly string[]).includes(o.subtitulos as string) ? (o.subtitulos as EstiloSubtitulos) : b.subtitulos,
    ritmo: (RITMOS as readonly string[]).includes(o.ritmo as string) ? (o.ritmo as Ritmo) : b.ritmo,
  };
}

// ------------------------------------------------ ficha del producto ----

/**
 * Lo que se sabe del producto para que salga bien en pantalla. La primera
 * mitad la propone la IA de visión mirando las fotos; la segunda NO se deduce
 * de una foto: se pregunta. Nada vale hasta que una persona lo confirma.
 */
export type FichaProducto = {
  tamano: "" | "pequeno" | "mediano" | "grande";
  cabeEnMano: "" | "si" | "no";
  /** Cómo se presenta: en la mano, parado sobre una superficie o acostado. */
  presentacion: "" | "se-sostiene" | "se-apoya" | "se-acuesta";
  comoSeUsa: string;
  /** Qué se lee o se ve en la etiqueta, tal cual. */
  etiqueta: string;
  /** Qué NO se puede saber por la foto. */
  noSeSabe: string;
  // ---- se preguntan, no se deducen ----
  medidas: string;
  contenido: string;
  ingredientes: string;
  efectos: string;
  origen: "" | "ia" | "manual";
  confirmado: { porId: string; por: string; fecha: string } | null;
};

export const FICHA_VACIA: FichaProducto = {
  tamano: "",
  cabeEnMano: "",
  presentacion: "",
  comoSeUsa: "",
  etiqueta: "",
  noSeSabe: "",
  medidas: "",
  contenido: "",
  ingredientes: "",
  efectos: "",
  origen: "",
  confirmado: null,
};

export const TAMANO_LABELS: Record<Exclude<FichaProducto["tamano"], "">, string> = { pequeno: "Pequeño", mediano: "Mediano", grande: "Grande" };
export const PRESENTACION_LABELS: Record<Exclude<FichaProducto["presentacion"], "">, string> = {
  "se-sostiene": "Se sostiene en la mano",
  "se-apoya": "Se apoya parado sobre una superficie",
  "se-acuesta": "Se acuesta (va tumbado)",
};

const txt = (v: unknown, max: number) => (typeof v === "string" ? v : "").slice(0, max);
const num = (v: unknown, def = 0) => (typeof v === "number" && Number.isFinite(v) ? v : def);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown) => (Array.isArray(v) ? v : []);
const uno = <T extends string>(v: unknown, opciones: readonly T[], def: T): T => (opciones.includes(v as T) ? (v as T) : def);

export function leerFicha(raw: unknown): FichaProducto {
  const o = obj(raw);
  const c = obj(o.confirmado);
  const porId = txt(c.porId, 40);
  const fecha = txt(c.fecha, 40);
  return {
    tamano: uno(o.tamano, ["", "pequeno", "mediano", "grande"] as const, ""),
    cabeEnMano: uno(o.cabeEnMano, ["", "si", "no"] as const, ""),
    presentacion: uno(o.presentacion, ["", "se-sostiene", "se-apoya", "se-acuesta"] as const, ""),
    comoSeUsa: txt(o.comoSeUsa, 600).trim(),
    etiqueta: txt(o.etiqueta, 600).trim(),
    noSeSabe: txt(o.noSeSabe, 600).trim(),
    medidas: txt(o.medidas, 160).trim(),
    contenido: txt(o.contenido, 160).trim(),
    ingredientes: txt(o.ingredientes, 400).trim(),
    efectos: txt(o.efectos, 400).trim(),
    origen: uno(o.origen, ["", "ia", "manual"] as const, ""),
    confirmado: porId && fecha ? { porId, por: txt(c.por, 160), fecha } : null,
  };
}

const contenidoFicha = (f: FichaProducto) =>
  JSON.stringify([f.tamano, f.cabeEnMano, f.presentacion, f.comoSeUsa, f.etiqueta, f.noSeSabe, f.medidas, f.contenido, f.ingredientes, f.efectos]);

/**
 * La confirmación de la ficha la firma el servidor: si la pantalla la manda
 * confirmada y su contenido no cambió, se conserva quién la confirmó; si
 * cambió, la firma quien la está guardando ahora.
 */
export function sellarFicha(nueva: FichaProducto, previa: FichaProducto | null, quien: { id: string; nombre: string }, ahora: string): FichaProducto {
  if (!nueva.confirmado) return nueva;
  if (previa?.confirmado && contenidoFicha(previa) === contenidoFicha(nueva)) return { ...nueva, confirmado: previa.confirmado };
  return { ...nueva, origen: nueva.origen || "manual", confirmado: { porId: quien.id, por: quien.nombre, fecha: ahora } };
}

export function fichaConDatos(f: FichaProducto): boolean {
  return !!(f.tamano || f.cabeEnMano || f.presentacion || f.comoSeUsa || f.etiqueta || f.medidas || f.contenido || f.ingredientes || f.efectos);
}

/** La ficha en texto: es el `contexto.analisisProducto` que recibe el trabajador y lo que lee la IA. */
export function textoFicha(f: FichaProducto): string {
  const lineas = [
    f.tamano ? `Tamaño aparente: ${TAMANO_LABELS[f.tamano].toLowerCase()}${f.medidas ? ` (${f.medidas})` : ""}.` : f.medidas ? `Medidas: ${f.medidas}.` : "",
    f.cabeEnMano ? (f.cabeEnMano === "si" ? "Cabe en una mano." : "No cabe en una mano: se muestra con las dos manos o apoyado.") : "",
    f.presentacion ? `Cómo se muestra: ${PRESENTACION_LABELS[f.presentacion].toLowerCase()}.` : "",
    f.comoSeUsa ? `Cómo se usa: ${f.comoSeUsa}` : "",
    f.etiqueta ? `En la etiqueta se ve: ${f.etiqueta}` : "",
    f.contenido ? `Contenido: ${f.contenido}.` : "",
    f.ingredientes ? `Ingredientes o materiales (dados por el cliente): ${f.ingredientes}` : "",
    f.efectos ? `Efectos o beneficios que el cliente autoriza decir: ${f.efectos}` : "",
    f.noSeSabe ? `No se sabe por la foto (no afirmar): ${f.noSeSabe}` : "",
  ].filter(Boolean);
  return lineas.join("\n").slice(0, 2400);
}

// ------------------------------------------------------- el proyecto ----

export type ContextoProyecto = {
  producto: string;
  pais: string;
  /** Fotos reales del producto (https, públicas). */
  fotos: string[];
  /** Ficha del producto en texto, confirmada por una persona. */
  analisisProducto: string;
  cierre: CierreProyecto;
  /** Estilo de subtítulos y ritmo del montaje. Sin elegir, sale del formato (`edicionDeFormato`). */
  edicion?: EdicionProyecto;
  /** El gancho de la apertura (banco de ganchos): el activo, las tres opciones que se ofrecen y por qué se eligió. */
  gancho?: { id: string; opciones: string[]; porque: string };
  voz: VozProyecto;
};

export type EstadoFinal = "pendiente" | "en-cola" | "generando" | "por-aprobar" | "aprobada" | "fallo";
export const ESTADO_FINAL_LABELS: Record<EstadoFinal, string> = {
  pendiente: "Sin armar",
  "en-cola": "Armado en cola",
  generando: "Armando",
  "por-aprobar": "Por aprobar",
  aprobada: "Aprobado",
  fallo: "Falló el armado",
};

/** Tono de la música del armado, elegido según la narrativa. */
// ---- cierre del video (la tarjeta final con el producto real, la oferta y el llamado) ----

/**
 * `oferta` y `llamadoALaAccion` son las palabras del cliente. Para la tarjeta final la oferta
 * va en DOS líneas: `titular` (corto y grande: «2x1», «79 €») y `detalle` («Dos gafas por 79 €»).
 * Si nadie los escribe, salen solos de la oferta (`partirOferta`). `color` es el color de marca
 * del botón del llamado (hex).
 */
export type CierreProyecto = {
  oferta: string;
  llamadoALaAccion: string;
  titular?: string;
  detalle?: string;
  color?: string;
  /**
   * Línea de urgencia del cierre. SOLO urgencia cierta: la promoción vigente de la página, un plazo o
   * cupo que el cliente publique, o la temporada. Nunca escasez ni plazos inventados.
   */
  urgencia?: string;
};

/** La urgencia que se puede afirmar con solo leer la oferta: la promoción misma, sin plazos ni cupos inventados. «» si no hay promoción. */
export function urgenciaDeOferta(oferta: string): string {
  const o = oferta.toLowerCase();
  const promo = /\b(\d\s?x\s?\d)\b/.exec(o)?.[1]?.replace(/\s/g, "") ?? (/(\d{1,2})\s?%/.exec(o) ? `-${/(\d{1,2})\s?%/.exec(o)?.[1]} %` : /env[ií]o gratis/.test(o) ? "envío gratis" : /regalo|gratis/.test(o) ? "regalo incluido" : /antes .*ahora|descuento|oferta|promo/.test(o) ? "precio de promoción" : "");
  return promo ? `${promo.charAt(0).toUpperCase() + promo.slice(1)} mientras dure la promoción` : "";
}

export const COLOR_HEX = /^#[0-9a-fA-F]{6}$/;
/** Color del botón del cierre cuando el proyecto no trae el de la marca: el azul de Reditus. */
export const COLOR_MARCA_BASE = "#0553C9";

const PRECIO = /(\$\s?\d[\d.,]*(?:\s?[A-Z]{3})?|\d[\d.,]*\s?(?:€|EUR|USD|COP|MXN|PEN|CLP|ARS|DOP|GTQ))/;
const mayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Parte la oferta en titular (corto, va grande) y detalle (una línea). Sin IA: reglas simples y previsibles. */
export function partirOferta(oferta: string): { titular: string; detalle: string } {
  const o = oferta.replace(/\s+/g, " ").trim();
  if (!o) return { titular: "", detalle: "" };
  // «2x1: dos gafas por 79 €» · «Envío gratis — hoy»
  const conSeparador = /^(.{1,18}?)\s*(?::|·|—|–|\|)\s+(.+)$/.exec(o);
  if (conSeparador) return { titular: conSeparador[1].trim().slice(0, 28), detalle: mayuscula(conSeparador[2].trim()).slice(0, 70) };
  // «Ceryon Eclipse por 79 €» → el precio va grande
  // Con varios precios («antes $120.000, ahora $89.900») manda el que sigue a «ahora/por/solo»; si no, el último.
  const precios = [...o.matchAll(new RegExp(PRECIO.source, "g"))].map((m) => ({ texto: m[1].trim(), antes: o.slice(0, m.index).trim() }));
  const elegido = precios.find((x) => /(?:ahora|por|solo|sólo|a)$/i.test(x.antes)) ?? precios[precios.length - 1];
  if (elegido) {
    const precio = elegido.texto;
    const escapado = precio.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const resto = o
      .replace(new RegExp(`(?:[\\s,;]+(?:y\\s+)?(?:ahora|por|a|en|desde|solo|sólo))*\\s*${escapado}`, "i"), "")
      .replace(/\s{2,}/g, " ")
      .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
      .trim();
    return { titular: precio.slice(0, 28), detalle: mayuscula(resto || o).slice(0, 70) };
  }
  // Sin precio ni separador: si es corta va toda grande; si no, va toda en la línea de detalle.
  return o.length <= 22 ? { titular: o, detalle: "" } : { titular: "", detalle: mayuscula(o).slice(0, 70) };
}

/** El cierre tal como viaja al servidor de videos: siempre con titular, detalle y color. */
export function cierreCompleto(c: CierreProyecto): Required<CierreProyecto> {
  const partes = partirOferta(c.oferta);
  return {
    oferta: c.oferta,
    llamadoALaAccion: c.llamadoALaAccion,
    titular: c.titular?.trim() || partes.titular,
    detalle: c.titular?.trim() ? (c.detalle?.trim() ?? "") : c.detalle?.trim() || partes.detalle,
    color: c.color && COLOR_HEX.test(c.color) ? c.color.toUpperCase() : COLOR_MARCA_BASE,
    urgencia: c.urgencia?.trim() ?? urgenciaDeOferta(c.oferta),
  };
}

export const TONOS_MUSICA = ["neutro", "energia", "suspenso", "emotivo"] as const;
export type TonoMusica = (typeof TONOS_MUSICA)[number];
export const TONO_MUSICA_LABELS: Record<TonoMusica, string> = { neutro: "Neutro", energia: "Energía", suspenso: "Suspenso", emotivo: "Emotivo" };

/** Control de calidad del video armado: una lista fija, anotada junto al video «por aprobar». No aprueba nada. */
export const PUNTOS_CONTROL = {
  gancho: "Gancho en los primeros 2 segundos",
  apertura: "Apertura de 3 s con al menos 3 cortes",
  urgencia: "Cierre con urgencia real",
  producto: "El producto real se ve",
  cierre: "Oferta y llamado a la acción al final",
  subtitulos: "Subtítulos presentes",
  duracion: "Duración dentro del objetivo",
} as const;
export type PuntoControl = keyof typeof PUNTOS_CONTROL;
export type ControlFinal = {
  /** El video que se revisó (si se vuelve a armar, se revisa de nuevo). */
  url: string;
  puntos: Partial<Record<PuntoControl, { nota: NotaCriterio; detalle: string }>>;
  /** Se miraron fotogramas del video (si no, solo los datos del plan y del trabajo). */
  conFotogramas: boolean;
  fecha: string;
};

export type OpcionesProyecto = { subtitulos: boolean; voz: boolean; musica: string | null; modelo: string | null };
export type GastoTrabajo = { creditos: number; segundos: number; imagenes: number };

export type ProyectoVideo = {
  contexto: ContextoProyecto;
  escenas: EscenaProyecto[];
  costo: { creditos: number; segundosGenerados: number; imagenes: number };
  final: { estado: EstadoFinal; url: string | null; armados: number; trabajoId: string | null; nota: string; control?: ControlFinal | null };
  /** Tono de la música de fondo (lo mezcla el trabajador al armar). */
  tonoMusica: TonoMusica;
  // ---- uso interno del CRM ----
  opciones: OpcionesProyecto;
  /** De dónde salió el plan de escenas. */
  origenPlan: "ia" | "plantilla";
  avisos: string[];
  /** Lo gastado por cada trabajo de la cola. El costo es la suma: así nunca se cuenta dos veces. */
  gastos: Record<string, GastoTrabajo>;
  /** Trabajos encolados que todavía no se vieron terminados. */
  trabajosAbiertos: string[];
  /** Registro de actividad: lo que fue pasando, lo más reciente al final. */
  registro: EventoProyecto[];
  /** Intentos permitidos por escena y tipo (lo fija la configuración del CEO). */
  topeIntentos: number;
  auto: AutoProyecto;
  /** Es una variación: de qué guion salió (hereda sus piezas aprobadas sin volver a pagarlas). */
  variacionDe: { guionId: string; producto: string; cambia: string } | null;
  creadoAt: string;
  creadoPor: string;
};

export type EventoProyecto = { fecha: string; texto: string };
export const MAX_REGISTRO = 80;

/** Anota algo en el registro de actividad del proyecto (se conservan los últimos). */
export function anotar(p: Pick<ProyectoVideo, "registro">, texto: string, fecha = new Date().toISOString()) {
  p.registro = [...p.registro, { fecha, texto: texto.slice(0, 240) }].slice(-MAX_REGISTRO);
}

export const piezaNueva = (): Pieza => ({ estado: "pendiente", url: null, intentos: 0, nota: "", trabajoId: null, revisadaPor: "", revision: null, autoRegenerada: false });

function leerRevision(raw: unknown): RevisionIA | null {
  const o = obj(raw);
  if (!(VEREDICTOS as readonly string[]).includes(o.veredicto as string)) return null;
  const criterios: RevisionIA["criterios"] = {};
  for (const k of Object.keys(CRITERIOS_IMAGEN) as Criterio[]) {
    const v = obj(o.criterios)[k];
    if (v === "ok" || v === "duda" || v === "mal" || v === "no-aplica") criterios[k] = v;
  }
  return { veredicto: o.veredicto as Veredicto, motivo: txt(o.motivo, 600), criterios, fecha: txt(o.fecha, 40) };
}

function leerPieza(raw: unknown): Pieza {
  const o = obj(raw);
  return {
    estado: uno(o.estado, ESTADOS_PIEZA, "pendiente"),
    url: txt(o.url, 600) || null,
    intentos: Math.max(0, Math.floor(num(o.intentos))),
    nota: txt(o.nota, 600),
    trabajoId: txt(o.trabajoId, 40) || null,
    revisadaPor: txt(o.revisadaPor, 160),
    revision: leerRevision(o.revision),
    autoRegenerada: o.autoRegenerada === true,
  };
}

export function leerEscenas(raw: unknown): EscenaProyecto[] {
  return lista(raw)
    .slice(0, MAX_ESCENAS_PROYECTO)
    .map((r, i) => {
      const o = obj(r);
      const tipo = uno(o.tipo, TIPOS_ESCENA, "generada");
      return {
        n: Math.max(1, Math.floor(num(o.n, i + 1))),
        paso: Math.min(5, Math.max(1, Math.floor(num(o.paso, 1)))),
        tipo,
        titulo: txt(o.titulo, 80),
        duracion: Math.min(15, Math.max(2, Math.round(num(o.duracion, 5)))),
        voz: txt(o.voz, 1200),
        locucion: uno(o.locucion, LOCUCIONES, tipo === "generada" ? "camara" : "texto"),
        promptImagen: txt(o.promptImagen, 4000),
        promptVideo: txt(o.promptVideo, 4000),
        fotoUrl: txt(o.fotoUrl, 600) || null,
        movimiento: uno(o.movimiento, MOVIMIENTOS, "acercar"),
        imagen: leerPieza(o.imagen),
        clip: leerPieza(o.clip),
        ...((TRANSICIONES as readonly string[]).includes(o.transicion as string) ? { transicion: o.transicion as Transicion } : {}),
        ...(Array.isArray(o.golpesVisuales) && o.golpesVisuales.length ? { golpesVisuales: (o.golpesVisuales as unknown[]).filter((x): x is number => typeof x === "number" && x > 0.3 && x < 15).slice(0, 4) } : {}),
        ...(tipo === "generada" && leerCortes(o.cortes).length >= 2 ? { cortes: leerCortes(o.cortes), duracionClip: Math.min(MAX_SEGUNDOS_CLIP, Math.max(4, Math.round(num(o.duracionClip, MAX_SEGUNDOS_CLIP)))) } : {}),
      };
    });
}

export function leerContexto(raw: unknown): ContextoProyecto {
  const o = obj(raw);
  const c = obj(o.cierre);
  return {
    producto: txt(o.producto, 240),
    pais: txt(o.pais, 4),
    fotos: lista(o.fotos)
      .map((u) => txt(u, 600))
      .filter((u) => u.startsWith("https://"))
      .slice(0, MAX_FOTOS_PROYECTO),
    analisisProducto: txt(o.analisisProducto, 2400),
    cierre: {
      oferta: txt(c.oferta, 400),
      llamadoALaAccion: txt(c.llamadoALaAccion, 200),
      ...(txt(c.titular, 28) ? { titular: txt(c.titular, 28) } : {}),
      ...(txt(c.detalle, 70) ? { detalle: txt(c.detalle, 70) } : {}),
      ...(COLOR_HEX.test(txt(c.color, 9)) ? { color: txt(c.color, 9).toUpperCase() } : {}),
      ...(typeof c.urgencia === "string" ? { urgencia: txt(c.urgencia, 80) } : {}),
    },
    ...(o.edicion && typeof o.edicion === "object" ? { edicion: leerEdicion(o.edicion) } : {}),
    ...(typeof obj(o.gancho).id === "string" && obj(o.gancho).id
      ? { gancho: { id: txt(obj(o.gancho).id, 40), opciones: lista(obj(o.gancho).opciones).map((x) => txt(x, 40)).filter(Boolean).slice(0, 4), porque: txt(obj(o.gancho).porque, 300) } }
      : {}),
    voz: leerVoz(o.voz, txt(o.pais, 4)),
  };
}

export function leerVoz(raw: unknown, pais: string): VozProyecto {
  const v = obj(raw);
  const base = vozDePais(pais);
  return {
    // Los proyectos de antes (sin este campo) se armaban con narración aparte: se respetan.
    motor: v.motor === "clip" ? "clip" : v.motor === "narracion" ? "narracion" : raw ? "clip" : "narracion",
    idioma: /^[a-z]{2}(-[A-Z]{2})?$/.test(txt(v.idioma, 8)) ? txt(v.idioma, 8) : base.idioma,
    acento: txt(v.acento, 200).trim() || base.acento,
    descripcion: txt(v.descripcion, 400).trim() || base.descripcion,
  };
}

function leerControl(raw: unknown): ControlFinal | null {
  const o = obj(raw);
  const url = txt(o.url, 600);
  if (!url) return null;
  const puntos: ControlFinal["puntos"] = {};
  for (const k of Object.keys(PUNTOS_CONTROL) as PuntoControl[]) {
    const x = obj(obj(o.puntos)[k]);
    if (x.nota === "ok" || x.nota === "duda" || x.nota === "mal" || x.nota === "no-aplica") puntos[k] = { nota: x.nota, detalle: txt(x.detalle, 300) };
  }
  return { url, puntos, conFotogramas: o.conFotogramas === true, fecha: txt(o.fecha, 40) };
}

/**
 * Control del video armado SOLO con datos (el plan y lo que reportó el trabajo): gancho al
 * inicio, producto real, cierre, subtítulos y duración. Lo que solo se sabe mirando el
 * video queda en «duda» hasta que haya fotogramas.
 */
export function controlPorDatos(p: ProyectoVideo, url: string, datos: { duracion: number | null; subtitulos: boolean | null }): ControlFinal {
  const primera = p.escenas[0];
  const ultima = p.escenas[p.escenas.length - 1];
  const objetivo = duracionTotal(p);
  const d = datos.duracion;
  const conSub = datos.subtitulos ?? p.opciones.subtitulos;
  return {
    url,
    conFotogramas: false,
    fecha: new Date().toISOString(),
    puntos: {
      gancho:
        primera?.paso === 1 && primera.duracion <= 4
          ? { nota: "ok", detalle: `El plan abre con el gancho en una toma de ${primera.duracion} s.` }
          : { nota: "duda", detalle: primera?.paso === 1 ? `La primera toma dura ${primera.duracion} s: el arranque puede sentirse lento.` : "La primera escena del plan no es el gancho." },
      apertura:
        (primera?.cortes?.length ?? 0) >= 3 && primera.duracion <= 4
          ? { nota: "ok", detalle: `La apertura dura ${primera.duracion} s y lleva ${primera.cortes?.length} tomas cortas (${(primera.cortes?.length ?? 1) - 1} cortes).` }
          : { nota: "duda", detalle: "La primera escena es una sola toma: sin cortes en los primeros 3 segundos el arranque no frena el scroll." },
      urgencia: cierreCompleto(p.contexto.cierre).urgencia
        ? { nota: "ok", detalle: `El cierre lleva la urgencia: «${cierreCompleto(p.contexto.cierre).urgencia}».` }
        : { nota: "duda", detalle: "El cierre no tiene línea de urgencia (no hay promoción ni plazo publicado). Si existe uno real, escríbelo en «Cierre del video»." },
      producto: p.escenas.some((e) => e.tipo !== "generada" && e.fotoUrl) ? { nota: "ok", detalle: "Hay escenas con la foto real del producto." } : { nota: "duda", detalle: "Ninguna escena usa la foto real del producto." },
      cierre:
        ultima?.tipo === "cierre" && p.contexto.cierre.oferta.trim() && p.contexto.cierre.llamadoALaAccion.trim()
          ? { nota: "ok", detalle: "El plan cierra con la foto real y el rótulo de oferta y llamado." }
          : { nota: "mal", detalle: "Falta el cierre con oferta y llamado a la acción." },
      subtitulos: conSub ? { nota: datos.subtitulos === null ? "duda" : "ok", detalle: datos.subtitulos === null ? "Se pidieron; el servidor no confirmó que los puso." : "El servidor confirmó los subtítulos." } : { nota: "mal", detalle: "El video se armó sin subtítulos." },
      duracion:
        d === null
          ? { nota: "duda", detalle: `El servidor no informó la duración (objetivo: ${objetivo} s).` }
          : Math.abs(d - objetivo) <= Math.max(3, objetivo * 0.15)
            ? { nota: "ok", detalle: `Dura ${Math.round(d)} s (objetivo: ${objetivo} s).` }
            : { nota: "duda", detalle: `Dura ${Math.round(d)} s y el objetivo era ${objetivo} s.` },
    },
  };
}

export function leerAuto(raw: unknown): AutoProyecto {
  const o = obj(raw);
  const pa = obj(o.parada);
  const codigo = txt(pa.codigo, 20);
  return {
    activo: o.activo === true,
    imagenes: o.imagenes === true,
    exigencia: o.exigencia === "normal" ? "normal" : "estricto",
    armarDirecto: o.armarDirecto === true,
    parada: (CODIGOS_PARADA as readonly string[]).includes(codigo) ? { codigo: codigo as CodigoParada, texto: txt(pa.texto, 500), fecha: txt(pa.fecha, 40) } : null,
  };
}

/** Normaliza un proyecto leído de Storage. Devuelve null si no hay proyecto. */
export function leerProyecto(raw: unknown): ProyectoVideo | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = obj(raw);
  const escenas = leerEscenas(o.escenas);
  if (!escenas.length) return null;
  const f = obj(o.final);
  const op = obj(o.opciones);
  const gastos: Record<string, GastoTrabajo> = {};
  for (const [id, g] of Object.entries(obj(o.gastos)).slice(-120)) {
    const x = obj(g);
    gastos[id.slice(0, 40)] = { creditos: Math.max(0, num(x.creditos)), segundos: Math.max(0, num(x.segundos)), imagenes: Math.max(0, Math.floor(num(x.imagenes))) };
  }
  const p: ProyectoVideo = {
    contexto: leerContexto(o.contexto),
    escenas,
    costo: { creditos: 0, segundosGenerados: 0, imagenes: 0 },
    final: {
      estado: uno(f.estado, ["pendiente", "en-cola", "generando", "por-aprobar", "aprobada", "fallo"] as const, "pendiente"),
      url: txt(f.url, 600) || null,
      armados: Math.max(0, Math.floor(num(f.armados))),
      trabajoId: txt(f.trabajoId, 40) || null,
      nota: txt(f.nota, 600),
      control: leerControl(f.control),
    },
    tonoMusica: uno(o.tonoMusica, TONOS_MUSICA, "neutro"),
    opciones: {
      subtitulos: op.subtitulos !== false,
      voz: op.voz !== false,
      musica: txt(op.musica, 600).trim() || null,
      modelo: txt(op.modelo, 160) || null,
    },
    origenPlan: o.origenPlan === "ia" ? "ia" : "plantilla",
    avisos: lista(o.avisos)
      .map((a) => txt(a, 400))
      .filter(Boolean)
      .slice(0, 8),
    gastos,
    trabajosAbiertos: lista(o.trabajosAbiertos)
      .map((x) => txt(x, 40))
      .filter(Boolean)
      .slice(-40),
    registro: lista(o.registro)
      .slice(-MAX_REGISTRO)
      .map((r) => ({ fecha: txt(obj(r).fecha, 40), texto: txt(obj(r).texto, 240) }))
      .filter((r) => r.texto),
    topeIntentos: Math.min(6, Math.max(1, Math.floor(num(o.topeIntentos, TOPE_INTENTOS_ESCENA)))),
    auto: leerAuto(o.auto),
    variacionDe: /^[0-9a-f-]{36}$/i.test(txt(obj(o.variacionDe).guionId, 40))
      ? { guionId: txt(obj(o.variacionDe).guionId, 40), producto: txt(obj(o.variacionDe).producto, 240), cambia: txt(obj(o.variacionDe).cambia, 300) }
      : null,
    creadoAt: txt(o.creadoAt, 40),
    creadoPor: txt(o.creadoPor, 160),
  };
  p.costo = sumarGastos(p.gastos);
  return p;
}

export function sumarGastos(gastos: Record<string, GastoTrabajo>): ProyectoVideo["costo"] {
  let creditos = 0;
  let segundos = 0;
  let imagenes = 0;
  for (const g of Object.values(gastos)) {
    creditos += g.creditos;
    segundos += g.segundos;
    imagenes += g.imagenes;
  }
  return { creditos: Math.round(creditos * 100) / 100, segundosGenerados: Math.round(segundos * 10) / 10, imagenes };
}

// ---------------------------------------------------- en qué va todo ----

export const piezaEnCurso = (p: Pieza) => p.estado === "en-cola" || p.estado === "generando";
/** Se puede mandar a generar: nunca se generó, se rechazó o falló. */
export const piezaPorGenerar = (p: Pieza) => p.estado === "pendiente" || p.estado === "rechazada" || p.estado === "fallo";

export type ConteoPiezas = { total: number; aprobadas: number; porAprobar: number; enCurso: number; porGenerar: number; enTope: number };

export function contar(p: ProyectoVideo, tipo: TipoPieza): ConteoPiezas {
  const c: ConteoPiezas = { total: 0, aprobadas: 0, porAprobar: 0, enCurso: 0, porGenerar: 0, enTope: 0 };
  for (const e of p.escenas) {
    if (e.tipo !== "generada") continue;
    const x = e[tipo];
    c.total++;
    if (x.estado === "aprobada") c.aprobadas++;
    else if (x.estado === "por-aprobar") c.porAprobar++;
    else if (piezaEnCurso(x)) c.enCurso++;
    else {
      c.porGenerar++;
      if (x.intentos >= p.topeIntentos) c.enTope++;
    }
  }
  return c;
}

export function hayTrabajoEnCurso(p: ProyectoVideo): boolean {
  return p.final.estado === "en-cola" || p.final.estado === "generando" || p.escenas.some((e) => e.tipo === "generada" && (piezaEnCurso(e.imagen) || piezaEnCurso(e.clip)));
}

/** Escenas a las que hoy se les puede pedir la imagen (falta, se rechazó o falló, y no llegaron al tope). */
export function escenasParaImagen(p: ProyectoVideo): EscenaProyecto[] {
  return p.escenas.filter((e) => e.tipo === "generada" && piezaPorGenerar(e.imagen) && e.imagen.intentos < p.topeIntentos);
}

/** Escenas a las que hoy se les puede pedir el clip: SOLO con imagen aprobada. */
export function escenasParaClip(p: ProyectoVideo): EscenaProyecto[] {
  return p.escenas.filter(
    (e) => e.tipo === "generada" && e.imagen.estado === "aprobada" && !!e.imagen.url && piezaPorGenerar(e.clip) && e.clip.intentos < p.topeIntentos,
  );
}

/**
 * El clip de una escena sirve para armar: aprobado, o (con «armar al terminar
 * los clips») recién llegado y sin revisar: la persona lo ve ya dentro del video.
 */
export function clipListo(p: Pick<ProyectoVideo, "auto">, e: EscenaProyecto): boolean {
  return !!e.clip.url && (e.clip.estado === "aprobada" || (p.auto.armarDirecto && e.clip.estado === "por-aprobar"));
}

/** Qué falta para poder armar (vacío = se puede). */
export function faltaParaArmar(p: ProyectoVideo): string[] {
  const falta: string[] = [];
  if (!p.escenas.length) return ["el plan de escenas"];
  for (const e of p.escenas) {
    if (e.tipo === "generada") {
      if (!clipListo(p, e)) falta.push(`el clip ${p.auto.armarDirecto ? "" : "aprobado "}de la escena ${e.n}`);
    } else if (!e.fotoUrl) falta.push(`la foto de la escena ${e.n}`);
  }
  const ultima = p.escenas[p.escenas.length - 1];
  if (ultima.tipo !== "cierre") falta.push("que la última escena sea el cierre con foto real");
  return falta;
}

export type FaseProyecto = "detenido" | "plan" | "imagenes" | "revisar-imagenes" | "clips" | "revisar-clips" | "armar" | "armando" | "final" | "aprobado" | "corregir";

export type ResumenProyecto = { fase: FaseProyecto; etiqueta: string; tono: Tono; detalle: string; imagenes: ConteoPiezas; clips: ConteoPiezas };

/** El modo directo está detenido esperando a una persona (y no es solo «hay imágenes por revisar»). */
export const detenido = (p: ProyectoVideo) => !!p.auto.parada && p.auto.parada.codigo !== "imagen-dudosa" && p.auto.parada.codigo !== "revisar-clips";

/** En qué va el proyecto, dicho en claro, y qué toca hacer. */
export function resumenProyecto(p: ProyectoVideo): ResumenProyecto {
  const imagenes = contar(p, "imagen");
  const clips = contar(p, "clip");
  const base = { imagenes, clips };
  const f = p.final.estado;
  if (f === "en-cola" || f === "generando") return { ...base, fase: "armando", etiqueta: "Armando el video", tono: "azul", detalle: "El servidor está uniendo las escenas. No cuesta." };
  if (f === "aprobada") return { ...base, fase: "aprobado", etiqueta: "Aprobado", tono: "verde", detalle: "" };
  if (f === "por-aprobar") return { ...base, fase: "final", etiqueta: "Video por aprobar", tono: "ambar", detalle: "Míralo completo y apruébalo, o marca qué corregir." };
  if (detenido(p) && !imagenes.enCurso && !clips.enCurso) return { ...base, fase: "detenido", etiqueta: "Detenido", tono: "rojo", detalle: p.auto.parada?.texto ?? "" };
  const directo = p.auto.armarDirecto;
  if (imagenes.enCurso) return { ...base, fase: "imagenes", etiqueta: "Generando imágenes", tono: "azul", detalle: `${imagenes.enCurso} en proceso.` };
  if (imagenes.porAprobar) return { ...base, fase: "revisar-imagenes", etiqueta: `${imagenes.porAprobar} ${imagenes.porAprobar === 1 ? "imagen" : "imágenes"} por revisar`, tono: "ambar", detalle: "Apruébalas o recházalas con una nota." };
  if (clips.enCurso) return { ...base, fase: "clips", etiqueta: "Generando clips", tono: "azul", detalle: `${clips.enCurso} en proceso.` };
  if (clips.porAprobar && !directo) return { ...base, fase: "revisar-clips", etiqueta: `${clips.porAprobar} ${clips.porAprobar === 1 ? "clip" : "clips"} por revisar`, tono: "ambar", detalle: "Apruébalos o pide regenerar." };
  if (imagenes.aprobadas < imagenes.total) {
    const nunca = p.escenas.every((e) => e.tipo !== "generada" || (e.imagen.estado === "pendiente" && e.imagen.intentos === 0));
    return nunca
      ? { ...base, fase: "plan", etiqueta: "Plan de escenas listo", tono: "neutro", detalle: "Revisa el plan y genera las imágenes base." }
      : { ...base, fase: "imagenes", etiqueta: "Faltan imágenes", tono: "ambar", detalle: `${imagenes.porGenerar} por regenerar${imagenes.enTope ? ` (${imagenes.enTope} en el tope de intentos)` : ""}.` };
  }
  if (clips.aprobadas + (directo ? clips.porAprobar : 0) < clips.total) {
    return { ...base, fase: "clips", etiqueta: "Imágenes aprobadas", tono: "azul", detalle: `Faltan ${clips.porGenerar} ${clips.porGenerar === 1 ? "clip" : "clips"}${clips.enTope ? ` (${clips.enTope} en el tope de intentos)` : ""}.` };
  }
  if (f === "fallo") return { ...base, fase: "armar", etiqueta: "Falló el armado", tono: "rojo", detalle: p.final.nota || "Vuelve a armar: no cuesta." };
  return p.final.url
    ? { ...base, fase: "corregir", etiqueta: "Por volver a armar", tono: "ambar", detalle: "Hay cambios que el video armado todavía no tiene." }
    : { ...base, fase: "armar", etiqueta: "Listo para armar", tono: "verde", detalle: "Todo aprobado. Armar no cuesta." };
}

export type Estimado = { imagenes: number; clips: number; segundos: number; sinCosto: number };

/** Lo que falta por generar (y cobrar) para terminar el plan tal como está. */
export function estimado(p: Pick<ProyectoVideo, "escenas">): Estimado {
  const e: Estimado = { imagenes: 0, clips: 0, segundos: 0, sinCosto: 0 };
  for (const s of p.escenas) {
    if (s.tipo !== "generada") {
      e.sinCosto++;
      continue;
    }
    if (s.imagen.estado !== "aprobada" && s.imagen.estado !== "por-aprobar" && !piezaEnCurso(s.imagen)) e.imagenes++;
    if (s.clip.estado !== "aprobada" && s.clip.estado !== "por-aprobar" && !piezaEnCurso(s.clip)) {
      e.clips++;
      e.segundos += s.duracion;
    }
  }
  return e;
}

export function duracionTotal(p: Pick<ProyectoVideo, "escenas">): number {
  return p.escenas.reduce((s, e) => s + e.duracion, 0);
}

// ---------------------------------------- lo que reportó el trabajador ----

/** Lo gastado por un trabajo: lo mayor entre la suma por escena y el total que dijo al cerrar. */
export function gastoDeTrabajo(t: Pick<TrabajoVideo, "reportes" | "creditos" | "segundosGenerados" | "etapa">): GastoTrabajo {
  let creditos = 0;
  let segundos = 0;
  let imagenes = 0;
  for (const r of t.reportes) {
    creditos += r.creditos;
    segundos += r.segundos;
    if (r.tipo === "imagen" && !r.error) imagenes++;
  }
  return {
    creditos: Math.round(Math.max(creditos, t.creditos) * 100) / 100,
    segundos: t.etapa === "armado" ? 0 : Math.round(Math.max(segundos, t.etapa === "clips" ? t.segundosGenerados : 0) * 10) / 10,
    imagenes,
  };
}

export type Plegado = {
  proyecto: ProyectoVideo;
  /** Cambió algo que hay que guardar (llegó una pieza, cerró un trabajo, cambió el costo). */
  guardar: boolean;
  /** Llegó el video armado: quien llama lo liga a la versión del guion, sin aprobar. */
  finalNuevo: string | null;
};

const TERMINADO = (t: TrabajoVideo) => t.estado === "listo" || t.estado === "fallo";
const TOMADO = (t: TrabajoVideo) => t.estado === "tomado" || t.estado === "generando" || t.estado === "montando";

/**
 * Pasa al proyecto lo que los trabajos de la cola ya reportaron. No toca nada
 * que una persona haya decidido (una pieza aprobada o rechazada no se mueve).
 * `generando` es solo de vista: no obliga a guardar.
 */
export function plegarTrabajos(original: ProyectoVideo, trabajos: TrabajoVideo[]): Plegado {
  const p: ProyectoVideo = {
    ...original,
    escenas: original.escenas.map((e) => ({ ...e, imagen: { ...e.imagen }, clip: { ...e.clip } })),
    final: { ...original.final },
    gastos: { ...original.gastos },
    trabajosAbiertos: [...original.trabajosAbiertos],
    registro: [...original.registro],
  };
  let guardar = false;
  let finalNuevo: string | null = null;
  for (const t of [...trabajos].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!t.etapa) continue;
    if (t.etapa === "armado") {
      if (p.final.trabajoId === t.id && (p.final.estado === "en-cola" || p.final.estado === "generando")) {
        if (t.estado === "listo" && t.resultado?.videoUrl) {
          p.final.estado = "por-aprobar";
          p.final.url = t.resultado.videoUrl;
          p.final.nota = "";
          finalNuevo = t.resultado.videoUrl;
          anotar(p, "Video armado: queda por aprobar.", t.terminadoAt ?? undefined);
          guardar = true;
        } else if (TERMINADO(t)) {
          p.final.estado = "fallo";
          p.final.nota = (t.motivo || "El servidor terminó sin entregar el video.").slice(0, 600);
          anotar(p, `Falló el armado: ${p.final.nota}`);
          guardar = true;
        } else if (TOMADO(t)) p.final.estado = "generando";
      }
    } else {
      const campo: TipoPieza = t.etapa === "imagenes" ? "imagen" : "clip";
      for (const pedida of t.escenasEtapa) {
        const e = p.escenas.find((x) => x.n === pedida.n);
        const pieza = e?.[campo];
        if (!e || !pieza || pieza.trabajoId !== t.id) continue;
        const rep = [...t.reportes].reverse().find((r) => r.n === pedida.n && r.tipo === campo);
        // Un fallo que el trabajador logró entregar en su propio reintento sí cuenta.
        const entregada = !!rep && !rep.error && !!rep.url;
        if (!piezaEnCurso(pieza) && !(pieza.estado === "fallo" && entregada)) continue;
        if (rep && entregada) {
          pieza.estado = "por-aprobar";
          pieza.url = rep.url;
          pieza.nota = "";
          pieza.revisadaPor = "";
          pieza.revision = null;
          anotar(p, `Escena ${e.n}: llegó ${campo === "imagen" ? "la imagen" : "el clip"} (intento ${pieza.intentos}).`, rep.fecha || undefined);
          guardar = true;
        } else if (rep?.error) {
          pieza.estado = "fallo";
          pieza.nota = rep.error.slice(0, 600);
          anotar(p, `Escena ${e.n}: falló ${campo === "imagen" ? "la imagen" : "el clip"}: ${pieza.nota}`, rep.fecha || undefined);
          guardar = true;
        } else if (TERMINADO(t)) {
          pieza.estado = "fallo";
          pieza.nota = (t.estado === "fallo" ? t.motivo || "El servidor no pudo con este trabajo." : "El servidor terminó sin entregar esta escena.").slice(0, 600);
          guardar = true;
        } else if (TOMADO(t)) pieza.estado = "generando";
      }
    }
    const g = gastoDeTrabajo(t);
    const antes = p.gastos[t.id];
    if (g.creditos || g.segundos || g.imagenes || antes) {
      if (!antes || antes.creditos !== g.creditos || antes.segundos !== g.segundos || antes.imagenes !== g.imagenes) {
        p.gastos[t.id] = g;
        guardar = true;
      }
    }
    if (TERMINADO(t) && p.trabajosAbiertos.includes(t.id)) {
      p.trabajosAbiertos = p.trabajosAbiertos.filter((x) => x !== t.id);
      guardar = true;
    }
  }
  p.costo = sumarGastos(p.gastos);
  return { proyecto: p, guardar, finalNuevo };
}

/** Texto corto del costo acumulado. */
export function costoProyectoTexto(c: ProyectoVideo["costo"]): string {
  return `${c.creditos.toLocaleString("es-CO")} créditos · ${c.segundosGenerados} s de video · ${c.imagenes} ${c.imagenes === 1 ? "imagen" : "imágenes"}`;
}
