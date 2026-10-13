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

/** Tope de intentos por escena y por tipo (imagen / clip). Edítalo aquí. */
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
};

export type EscenaProyecto = {
  n: number;
  /** Paso de la estructura: 1 impacto … 5 cierre. */
  paso: number;
  tipo: TipoEscena;
  /** Rótulo corto para reconocerla en la tira. */
  titulo: string;
  /** Segundos objetivo. */
  duracion: number;
  /** Lo que se dice (voz y subtítulos). */
  voz: string;
  promptImagen: string;
  promptVideo: string;
  /** Foto real que se anima (tipos `foto-real` y `cierre`). */
  fotoUrl: string | null;
  movimiento: Movimiento;
  imagen: Pieza;
  clip: Pieza;
};

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
  cierre: { oferta: string; llamadoALaAccion: string };
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

export type OpcionesProyecto = { subtitulos: boolean; voz: boolean; musica: string | null; modelo: string | null };
export type GastoTrabajo = { creditos: number; segundos: number; imagenes: number };

export type ProyectoVideo = {
  contexto: ContextoProyecto;
  escenas: EscenaProyecto[];
  costo: { creditos: number; segundosGenerados: number; imagenes: number };
  final: { estado: EstadoFinal; url: string | null; armados: number; trabajoId: string | null; nota: string };
  // ---- uso interno del CRM ----
  opciones: OpcionesProyecto;
  /** De dónde salió el plan de escenas. */
  origenPlan: "ia" | "plantilla";
  avisos: string[];
  /** Lo gastado por cada trabajo de la cola. El costo es la suma: así nunca se cuenta dos veces. */
  gastos: Record<string, GastoTrabajo>;
  /** Trabajos encolados que todavía no se vieron terminados. */
  trabajosAbiertos: string[];
  creadoAt: string;
  creadoPor: string;
};

export const piezaNueva = (): Pieza => ({ estado: "pendiente", url: null, intentos: 0, nota: "", trabajoId: null, revisadaPor: "" });

function leerPieza(raw: unknown): Pieza {
  const o = obj(raw);
  return {
    estado: uno(o.estado, ESTADOS_PIEZA, "pendiente"),
    url: txt(o.url, 600) || null,
    intentos: Math.max(0, Math.floor(num(o.intentos))),
    nota: txt(o.nota, 600),
    trabajoId: txt(o.trabajoId, 40) || null,
    revisadaPor: txt(o.revisadaPor, 160),
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
        promptImagen: txt(o.promptImagen, 4000),
        promptVideo: txt(o.promptVideo, 4000),
        fotoUrl: txt(o.fotoUrl, 600) || null,
        movimiento: uno(o.movimiento, MOVIMIENTOS, "acercar"),
        imagen: leerPieza(o.imagen),
        clip: leerPieza(o.clip),
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
    cierre: { oferta: txt(c.oferta, 400), llamadoALaAccion: txt(c.llamadoALaAccion, 200) },
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
    },
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
      if (x.intentos >= TOPE_INTENTOS_ESCENA) c.enTope++;
    }
  }
  return c;
}

export function hayTrabajoEnCurso(p: ProyectoVideo): boolean {
  return p.final.estado === "en-cola" || p.final.estado === "generando" || p.escenas.some((e) => e.tipo === "generada" && (piezaEnCurso(e.imagen) || piezaEnCurso(e.clip)));
}

/** Escenas a las que hoy se les puede pedir la imagen (falta, se rechazó o falló, y no llegaron al tope). */
export function escenasParaImagen(p: ProyectoVideo): EscenaProyecto[] {
  return p.escenas.filter((e) => e.tipo === "generada" && piezaPorGenerar(e.imagen) && e.imagen.intentos < TOPE_INTENTOS_ESCENA);
}

/** Escenas a las que hoy se les puede pedir el clip: SOLO con imagen aprobada. */
export function escenasParaClip(p: ProyectoVideo): EscenaProyecto[] {
  return p.escenas.filter(
    (e) => e.tipo === "generada" && e.imagen.estado === "aprobada" && !!e.imagen.url && piezaPorGenerar(e.clip) && e.clip.intentos < TOPE_INTENTOS_ESCENA,
  );
}

/** Qué falta para poder armar (vacío = se puede). */
export function faltaParaArmar(p: ProyectoVideo): string[] {
  const falta: string[] = [];
  if (!p.escenas.length) return ["el plan de escenas"];
  for (const e of p.escenas) {
    if (e.tipo === "generada") {
      if (e.clip.estado !== "aprobada" || !e.clip.url) falta.push(`el clip aprobado de la escena ${e.n}`);
    } else if (!e.fotoUrl) falta.push(`la foto de la escena ${e.n}`);
  }
  const ultima = p.escenas[p.escenas.length - 1];
  if (ultima.tipo !== "cierre") falta.push("que la última escena sea el cierre con foto real");
  return falta;
}

export type FaseProyecto = "plan" | "imagenes" | "revisar-imagenes" | "clips" | "revisar-clips" | "armar" | "armando" | "final" | "aprobado" | "corregir";

export type ResumenProyecto = { fase: FaseProyecto; etiqueta: string; tono: Tono; detalle: string; imagenes: ConteoPiezas; clips: ConteoPiezas };

/** En qué va el proyecto, dicho en claro, y qué toca hacer. */
export function resumenProyecto(p: ProyectoVideo): ResumenProyecto {
  const imagenes = contar(p, "imagen");
  const clips = contar(p, "clip");
  const base = { imagenes, clips };
  const f = p.final.estado;
  if (f === "en-cola" || f === "generando") return { ...base, fase: "armando", etiqueta: "Armando el video", tono: "azul", detalle: "El servidor está uniendo las escenas. No cuesta." };
  if (f === "aprobada") return { ...base, fase: "aprobado", etiqueta: "Aprobado", tono: "verde", detalle: "" };
  if (f === "por-aprobar") return { ...base, fase: "final", etiqueta: "Video por aprobar", tono: "ambar", detalle: "Míralo completo y apruébalo, o marca qué corregir." };
  if (imagenes.enCurso) return { ...base, fase: "imagenes", etiqueta: "Generando imágenes", tono: "azul", detalle: `${imagenes.enCurso} en proceso.` };
  if (imagenes.porAprobar) return { ...base, fase: "revisar-imagenes", etiqueta: `${imagenes.porAprobar} ${imagenes.porAprobar === 1 ? "imagen" : "imágenes"} por revisar`, tono: "ambar", detalle: "Apruébalas o recházalas con una nota." };
  if (clips.enCurso) return { ...base, fase: "clips", etiqueta: "Generando clips", tono: "azul", detalle: `${clips.enCurso} en proceso.` };
  if (clips.porAprobar) return { ...base, fase: "revisar-clips", etiqueta: `${clips.porAprobar} ${clips.porAprobar === 1 ? "clip" : "clips"} por revisar`, tono: "ambar", detalle: "Apruébalos o pide regenerar." };
  if (imagenes.aprobadas < imagenes.total) {
    const nunca = p.escenas.every((e) => e.tipo !== "generada" || (e.imagen.estado === "pendiente" && e.imagen.intentos === 0));
    return nunca
      ? { ...base, fase: "plan", etiqueta: "Plan de escenas listo", tono: "neutro", detalle: "Revisa el plan y genera las imágenes base." }
      : { ...base, fase: "imagenes", etiqueta: "Faltan imágenes", tono: "ambar", detalle: `${imagenes.porGenerar} por regenerar${imagenes.enTope ? ` (${imagenes.enTope} en el tope de intentos)` : ""}.` };
  }
  if (clips.aprobadas < clips.total) {
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
          guardar = true;
        } else if (TERMINADO(t)) {
          p.final.estado = "fallo";
          p.final.nota = (t.motivo || "El servidor terminó sin entregar el video.").slice(0, 600);
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
          guardar = true;
        } else if (rep?.error) {
          pieza.estado = "fallo";
          pieza.nota = rep.error.slice(0, 600);
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
