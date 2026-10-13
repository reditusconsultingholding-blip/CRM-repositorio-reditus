// «Clonar anuncio» — tipos y funciones puras (seguro para componentes de cliente).
//
// Se clona la ESTRUCTURA de un anuncio de referencia (qué función cumple cada
// toma, cuánto dura, qué tipo de toma es, cómo se encuadra, si lleva texto en
// pantalla y cómo cierra), nunca su material: nada de sus personas, marcas,
// logos, música, voces ni textos literales. Método: `formatos-video/METODO-CLONACION.md`.
//
// Hoy la estructura la describe una persona, toma por toma, en un formulario
// guiado. El análisis automático del video (fotogramas y transcripción) está
// definido en el contrato con el trabajador y todavía no existe.
import { NOMBRE_PASO, piezaNueva, type EscenaProyecto, type Movimiento } from "@/lib/proyecto-video";
import { normalizarPlan, type DatosPlan } from "@/lib/proyecto-video-plan";
import { pasosDelGuion } from "@/lib/trabajos-video";

export const MAX_TOMAS = 16;

export const FUNCIONES_TOMA = ["gancho", "dolor", "causa", "intento-fallido", "mecanismo", "demostracion", "prueba", "oferta", "cierre"] as const;
export type FuncionToma = (typeof FUNCIONES_TOMA)[number];
export const FUNCION_LABELS: Record<FuncionToma, string> = {
  gancho: "Gancho",
  dolor: "Dolor o problema",
  causa: "Causa (por qué pasa)",
  "intento-fallido": "Lo que ya probó",
  mecanismo: "Cómo funciona",
  demostracion: "Demostración de uso",
  prueba: "Prueba o resultado",
  oferta: "Oferta",
  cierre: "Cierre con llamado",
};
/** A qué paso de la estructura de Reditus corresponde cada función. */
export const PASO_DE_FUNCION: Record<FuncionToma, number> = { gancho: 1, dolor: 2, causa: 2, "intento-fallido": 3, mecanismo: 4, demostracion: 4, prueba: 4, oferta: 5, cierre: 5 };

export const TIPOS_TOMA = ["persona-habla", "persona-accion", "producto", "apoyo", "texto"] as const;
export type TipoToma = (typeof TIPOS_TOMA)[number];
export const TIPO_TOMA_LABELS: Record<TipoToma, string> = {
  "persona-habla": "Persona hablando a cámara",
  "persona-accion": "Persona haciendo algo (sin hablar a cámara)",
  producto: "El producto solo",
  apoyo: "Toma de apoyo (lugar, objeto, detalle)",
  texto: "Pantalla de texto o gráfico",
};

export const ENCUADRES = ["primer-plano", "plano-medio", "plano-abierto", "detalle"] as const;
export type Encuadre = (typeof ENCUADRES)[number];
export const ENCUADRE_LABELS: Record<Encuadre, string> = { "primer-plano": "Primer plano", "plano-medio": "Plano medio", "plano-abierto": "Plano abierto", detalle: "Detalle (macro)" };

/** Una toma del anuncio de referencia, descrita por su función y su forma (no por su contenido literal). */
export type TomaReferencia = {
  /** Segundos que dura. */
  duracion: number;
  funcion: FuncionToma;
  tipo: TipoToma;
  encuadre: Encuadre;
  /** Qué pasa, con palabras propias y sin nombres ni marcas («alguien muestra el problema en la cocina»). */
  quePasa: string;
  /** Lleva texto grande en pantalla (se rehace con los datos del cliente; no se copia). */
  textoEnPantalla: boolean;
};

export const TOMA_VACIA: TomaReferencia = { duracion: 4, funcion: "gancho", tipo: "persona-habla", encuadre: "plano-medio", quePasa: "", textoEnPantalla: false };

const uno = <T extends string>(v: unknown, opciones: readonly T[], def: T): T => (opciones.includes(v as T) ? (v as T) : def);

export function leerTomas(raw: unknown): TomaReferencia[] {
  return (Array.isArray(raw) ? raw : []).slice(0, MAX_TOMAS).map((r) => {
    const o = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
    return {
      duracion: Math.min(20, Math.max(1, Math.round(typeof o.duracion === "number" && Number.isFinite(o.duracion) ? o.duracion : 4))),
      funcion: uno(o.funcion, FUNCIONES_TOMA, "gancho"),
      tipo: uno(o.tipo, TIPOS_TOMA, "persona-habla"),
      encuadre: uno(o.encuadre, ENCUADRES, "plano-medio"),
      quePasa: (typeof o.quePasa === "string" ? o.quePasa : "").trim().slice(0, 300),
      textoEnPantalla: o.textoEnPantalla === true,
    };
  });
}

/** La estructura en texto: lo que lee la IA (guion y plan) cuando se clona. Una línea por toma, con tiempos. */
export function textoDeReferencia(tomas: TomaReferencia[]): string {
  let t = 0;
  return tomas
    .map((x, i) => {
      const desde = t;
      t += x.duracion;
      return `Toma ${i + 1} · ${desde}–${t} s · función: ${FUNCION_LABELS[x.funcion].toLowerCase()} · ${TIPO_TOMA_LABELS[x.tipo].toLowerCase()} · ${ENCUADRE_LABELS[x.encuadre].toLowerCase()}${x.textoEnPantalla ? " · con texto grande en pantalla" : ""}${x.quePasa ? ` · qué pasa: ${x.quePasa}` : ""}`;
    })
    .join("\n");
}

export function duracionDeReferencia(tomas: TomaReferencia[]): number {
  return tomas.reduce((s, x) => s + x.duracion, 0);
}

const MOVS: Movimiento[] = ["acercar", "paneo-der", "alejar", "paneo-izq"];

/**
 * Plan de escenas equivalente a la referencia, SIN IA: una escena por toma,
 * con su duración y su tipo. El producto solo sale de la foto real (no
 * cuesta); el cierre va siempre al final con foto real. Los prompts describen
 * la forma de la toma con el producto del cliente, nunca el material ajeno.
 */
export function planDeReferencia(tomas: TomaReferencia[], d: DatosPlan): { escenas: EscenaProyecto[]; avisos: string[] } {
  const pasos = pasosDelGuion(d.guion);
  const dichos = new Set<number>();
  let fotos = 0;
  const crudas = tomas.map((x, i) => {
    const ultima = i === tomas.length - 1;
    const paso = PASO_DE_FUNCION[x.funcion];
    const esCierre = ultima && paso === 5;
    const conFoto = esCierre || x.tipo === "producto";
    // La frase del guion para ese paso se dice una vez, en su primera toma.
    const voz = dichos.has(paso) ? "" : (pasos.find((p) => p.paso === paso)?.voz ?? "");
    dichos.add(paso);
    const forma = `${TIPO_TOMA_LABELS[x.tipo]}, ${ENCUADRE_LABELS[x.encuadre].toLowerCase()}`;
    const base = {
      n: 0,
      paso,
      titulo: `${FUNCION_LABELS[x.funcion]}`.slice(0, 80),
      duracion: x.duracion,
      voz,
      movimiento: MOVS[fotos % MOVS.length],
      imagen: piezaNueva(),
      clip: piezaNueva(),
    };
    if (conFoto) {
      fotos++;
      return { ...base, tipo: esCierre ? "cierre" : "foto-real", promptImagen: "", promptVideo: "", fotoUrl: d.fotos[(fotos - 1) % Math.max(1, d.fotos.length)] ?? null };
    }
    const conProducto = paso >= 4;
    return {
      ...base,
      tipo: "generada",
      fotoUrl: null,
      promptImagen: [
        `Fotograma inicial, vertical ${d.formato.relacion_aspecto || "9:16"}. ${forma}.`,
        `Función de la toma: ${FUNCION_LABELS[x.funcion].toLowerCase()} (paso ${paso} · ${NOMBRE_PASO[paso]}).`,
        x.quePasa ? `Qué pasa: ${x.quePasa}` : "",
        "Personas nuevas y genéricas (no se parecen a nadie en particular), lugar propio, sin marcas ni logotipos de terceros.",
        conProducto ? `El producto es EXACTAMENTE el de las fotos de referencia (${d.producto}): misma forma, colores y etiqueta.${d.fichaTexto ? ` ${d.fichaTexto.replace(/\s+/g, " ").slice(0, 400)}` : ""}` : "El producto no aparece.",
        "Sin texto, sin subtítulos y sin logotipos en la imagen.",
      ]
        .filter(Boolean)
        .join("\n"),
      promptVideo: `${forma}. ${x.quePasa || FUNCION_LABELS[x.funcion]}. Una sola acción, movimiento natural, cámara estable, ${x.duracion} s. Sin texto en pantalla.`,
    };
  });
  const n = normalizarPlan(crudas, d, { verificarVoz: false });
  return {
    escenas: n.escenas,
    avisos: [
      `El plan sigue la estructura de la referencia toma por toma (${tomas.length} tomas, ${duracionDeReferencia(tomas)} s) sin IA: revisa los prompts de las escenas generadas antes de pedir imágenes.`,
      ...(tomas.some((x) => x.textoEnPantalla) ? ["La referencia usa texto grande en pantalla: aquí se rehace con tus subtítulos y el rótulo de cierre; no se copia el del original."] : []),
      ...n.avisos,
    ],
  };
}
