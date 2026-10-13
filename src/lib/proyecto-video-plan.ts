// Plan de escenas y correcciones del proyecto de video — funciones puras
// (seguro para componentes de cliente).
//
// Regla de costo por defecto: las escenas de producto/beneficios y el cierre
// salen como `foto-real` (se anima la foto real: el producto sale idéntico y
// cuesta cero). Solo se generan las escenas que la foto no puede mostrar.
import type { FormatoVideo } from "@/lib/video-formatos";
import { corchetes, pasosDelGuion, segundosDeTramo } from "@/lib/trabajos-video";
import {
  MAX_ESCENAS_PROYECTO,
  MOVIMIENTOS,
  NOMBRE_PASO,
  TIPOS_ESCENA,
  TOPE_INTENTOS_ESCENA,
  piezaEnCurso,
  piezaNueva,
  type EscenaProyecto,
  type Movimiento,
  type ProyectoVideo,
  type TipoEscena,
} from "@/lib/proyecto-video";

export type FormatoPlan = Pick<FormatoVideo, "slug" | "nombre" | "estructura" | "relacion_aspecto" | "producto_en_pantalla">;

/** Formatos donde el producto es el protagonista de todo el video: sus escenas salen de las fotos reales. */
const PRODUCTO_PROTAGONISTA = new Set(["usos-del-producto"]);
/** Segundos máximos de un clip generado (los modelos de video no dan más en una toma). */
const MAX_CLIP = 8;

export type DatosPlan = { guion: string; formato: FormatoPlan; fotos: string[]; fichaTexto: string; producto: string };

const limpiar = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
const entre = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(v)));
const MOV_CICLO: Movimiento[] = ["acercar", "paneo-der", "alejar", "paneo-izq"];

function escena(base: Partial<EscenaProyecto> & Pick<EscenaProyecto, "paso" | "tipo" | "duracion">): EscenaProyecto {
  return {
    n: 0,
    titulo: NOMBRE_PASO[base.paso] ?? `Paso ${base.paso}`,
    voz: "",
    promptImagen: "",
    promptVideo: "",
    fotoUrl: null,
    movimiento: "acercar",
    imagen: piezaNueva(),
    clip: piezaNueva(),
    ...base,
  };
}

function promptsDePlantilla(d: DatosPlan, paso: number, quePasa: string, textoGuion: string, duracion: number, conProducto: boolean) {
  const producto = conProducto
    ? `El producto es EXACTAMENTE el de las fotos de referencia (${d.producto || "producto"}): misma forma, mismos colores y misma etiqueta, sin inventar texto.${d.fichaTexto ? ` ${limpiar(d.fichaTexto, 500)}` : ""}`
    : "El producto no aparece en esta escena.";
  return {
    promptImagen: [
      `Fotograma inicial de la escena, vertical ${d.formato.relacion_aspecto || "9:16"}, formato «${d.formato.nombre}».`,
      `Paso ${paso} · ${NOMBRE_PASO[paso] ?? ""}: ${quePasa}`,
      textoGuion ? `Según el guion: ${limpiar(textoGuion, 500)}` : "",
      producto,
      "Sin texto, sin subtítulos y sin logotipos en la imagen.",
    ]
      .filter(Boolean)
      .join("\n"),
    promptVideo: `${quePasa}. Movimiento natural y continuo, un solo plano, cámara estable, ${duracion} s. Sin texto en pantalla.`,
  };
}

/**
 * Plan de escenas SIN IA: sale de la estructura del formato y de lo que el
 * guion dice en cada paso. Es el respaldo cuando la IA no está o falla.
 */
export function planDePlantilla(d: DatosPlan): { escenas: EscenaProyecto[]; avisos: string[] } {
  const pasos = pasosDelGuion(d.guion);
  const foto = (i: number) => d.fotos[i % Math.max(1, d.fotos.length)] ?? null;
  const protagonista = PRODUCTO_PROTAGONISTA.has(d.formato.slug);
  const estructura = [...d.formato.estructura].sort((a, b) => a.paso - b.paso);
  const escenas: EscenaProyecto[] = [];
  let fotosUsadas = 0;
  const fotoReal = (paso: number, duracion: number, voz: string, titulo?: string) =>
    escena({ paso, tipo: "foto-real", duracion: entre(duracion, 2, 6), voz, fotoUrl: foto(fotosUsadas), movimiento: MOV_CICLO[fotosUsadas++ % MOV_CICLO.length], titulo: titulo ?? `${NOMBRE_PASO[paso]} · producto` });

  for (const paso of [1, 2, 3, 4, 5]) {
    const e = estructura.find((x) => x.paso === paso);
    const pg = pasos.find((x) => x.paso === paso);
    const seg = (e ? segundosDeTramo(e.tiempo) : 0) || 5;
    const voz = pg?.voz ?? "";
    const quePasa = e?.que_pasa ?? NOMBRE_PASO[paso];
    if (paso === 5) {
      escenas.push(escena({ paso: 5, tipo: "cierre", duracion: entre(seg, 5, 8), voz, fotoUrl: foto(0), movimiento: "quieto", titulo: "Cierre · oferta" }));
      continue;
    }
    if (paso === 4) {
      if (protagonista) {
        const usos = Math.min(3, Math.max(1, Math.round(seg / 4)));
        for (let i = 0; i < usos; i++) escenas.push(fotoReal(4, seg / usos, i === 0 ? voz : "", `Uso ${i + 1}`));
      } else {
        const gen = entre(seg * 0.55, 3, MAX_CLIP);
        escenas.push(escena({ paso: 4, tipo: "generada", duracion: gen, voz, ...promptsDePlantilla(d, 4, quePasa, pg?.texto ?? "", gen, true), titulo: "Subida · con el producto" }));
        escenas.push(fotoReal(4, Math.max(3, seg - gen), "", "Subida · producto real"));
      }
      continue;
    }
    if (paso === 1 && protagonista) {
      escenas.push(fotoReal(1, seg, voz, "Impacto · producto"));
      continue;
    }
    const trozos = Math.min(3, Math.max(1, Math.ceil(seg / MAX_CLIP)));
    for (let i = 0; i < trozos; i++) {
      const dur = entre(seg / trozos, 3, MAX_CLIP);
      escenas.push(
        escena({ paso, tipo: "generada", duracion: dur, voz: i === 0 ? voz : "", ...promptsDePlantilla(d, paso, quePasa, pg?.texto ?? "", dur, false), titulo: trozos > 1 ? `${NOMBRE_PASO[paso]} ${i + 1}` : NOMBRE_PASO[paso] }),
      );
    }
  }
  const avisos = ["El plan salió de la plantilla del formato (sin IA): revisa y mejora el prompt de cada escena generada antes de pedir las imágenes."];
  if (!pasos.length) avisos.push("El guion no tiene los rótulos «PASO 1…5»: las escenas quedaron sin voz. Escríbela en cada escena.");
  return { escenas: numerar(escenas.slice(0, MAX_ESCENAS_PROYECTO)), avisos };
}

export function numerar(escenas: EscenaProyecto[]): EscenaProyecto[] {
  return escenas.map((e, i) => ({ ...e, n: i + 1 }));
}

const palabras = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9ñ$%]+/)
    .filter(Boolean);

/**
 * Deja un plan (propuesto por la IA o editado a mano) dentro de las reglas:
 *  · los pasos van en orden y la ÚLTIMA escena es el cierre con foto real;
 *  · `foto-real` y `cierre` usan una foto de las que se subieron;
 *  · la voz no se inventa: lo que diga cada paso tiene que estar en el guion
 *    (si la IA agregó palabras, se usa la frase del guion tal cual);
 *  · el producto real aparece (al menos el cierre lo muestra).
 * Las piezas (imagen/clip) de cada escena se conservan tal como llegan.
 */
export function normalizarPlan(crudas: unknown, d: DatosPlan, opciones: { verificarVoz: boolean }): { escenas: EscenaProyecto[]; avisos: string[] } {
  const avisos: string[] = [];
  const pasos = pasosDelGuion(d.guion);
  const vozDe = (paso: number) => pasos.find((p) => p.paso === paso)?.voz ?? "";
  const lista = Array.isArray(crudas) ? crudas : [];
  let escenas: EscenaProyecto[] = lista.slice(0, MAX_ESCENAS_PROYECTO + 4).map((r) => {
    const o = (r && typeof r === "object" ? r : {}) as Record<string, unknown>;
    const s = (k: string, max: number) => (typeof o[k] === "string" ? (o[k] as string) : "").trim().slice(0, max);
    const n = (k: string, def: number) => (typeof o[k] === "number" && Number.isFinite(o[k]) ? (o[k] as number) : def);
    const paso = entre(n("paso", 1), 1, 5);
    const tipo: TipoEscena = (TIPOS_ESCENA as readonly string[]).includes(o.tipo as string) ? (o.tipo as TipoEscena) : "generada";
    const indice = entre(n("foto", 1), 1, Math.max(1, d.fotos.length)) - 1;
    const pedida = s("fotoUrl", 600);
    return escena({
      n: entre(n("n", 0), 0, 999),
      paso,
      tipo,
      titulo: s("titulo", 80) || NOMBRE_PASO[paso],
      duracion: n("duracion", 5),
      voz: s("voz", 1200),
      promptImagen: s("promptImagen", 4000),
      promptVideo: s("promptVideo", 4000),
      fotoUrl: d.fotos.includes(pedida) ? pedida : (d.fotos[indice] ?? null),
      movimiento: (MOVIMIENTOS as readonly string[]).includes(o.movimiento as string) ? (o.movimiento as Movimiento) : "acercar",
      ...(o.imagen && typeof o.imagen === "object" ? { imagen: o.imagen as EscenaProyecto["imagen"] } : {}),
      ...(o.clip && typeof o.clip === "object" ? { clip: o.clip as EscenaProyecto["clip"] } : {}),
    });
  });

  // Un solo cierre, y al final. Un «cierre» en otra parte pasa a foto real.
  const idxCierre = escenas.map((e) => e.tipo).lastIndexOf("cierre");
  escenas = escenas.map((e, i) => (e.tipo === "cierre" && i !== idxCierre ? { ...e, tipo: "foto-real" as const } : e));
  let cierre = idxCierre >= 0 ? escenas[idxCierre] : null;
  let resto = escenas.filter((e) => e !== cierre);
  // Los pasos en orden (orden estable: dentro de un paso manda el orden que traían).
  resto = resto.map((e, i) => ({ e, i })).sort((a, b) => a.e.paso - b.e.paso || a.i - b.i).map((x) => x.e);
  if (!cierre) {
    cierre = escena({ paso: 5, tipo: "cierre", duracion: 5, voz: vozDe(5), fotoUrl: d.fotos[0] ?? null, movimiento: "quieto", titulo: "Cierre · oferta" });
    avisos.push("El plan no traía el cierre con foto real: se agregó al final, que es obligatorio.");
  }
  cierre = { ...cierre, paso: 5, tipo: "cierre" };
  if (resto.length > MAX_ESCENAS_PROYECTO - 1) {
    resto = resto.slice(0, MAX_ESCENAS_PROYECTO - 1);
    avisos.push(`El plan pasaba de ${MAX_ESCENAS_PROYECTO} escenas: se recortó.`);
  }
  escenas = [...resto, cierre];

  escenas = escenas.map((e) => {
    const x = { ...e };
    if (x.tipo === "generada") {
      x.duracion = entre(x.duracion, 3, 15);
      if (!x.promptImagen.trim() || !x.promptVideo.trim()) {
        const est = d.formato.estructura.find((s) => s.paso === x.paso);
        const p = promptsDePlantilla(d, x.paso, est?.que_pasa ?? NOMBRE_PASO[x.paso], pasos.find((s) => s.paso === x.paso)?.texto ?? "", x.duracion, x.paso >= 4);
        x.promptImagen = x.promptImagen.trim() || p.promptImagen;
        x.promptVideo = x.promptVideo.trim() || p.promptVideo;
      }
    } else {
      x.duracion = x.tipo === "cierre" ? entre(x.duracion, 5, 10) : entre(x.duracion, 2, 8);
      if (!x.fotoUrl || !d.fotos.includes(x.fotoUrl)) x.fotoUrl = d.fotos[0] ?? null;
    }
    return x;
  });

  if (opciones.verificarVoz && pasos.length) {
    let corregidos = 0;
    for (const paso of [1, 2, 3, 4, 5]) {
      const delPaso = escenas.filter((e) => e.paso === paso);
      if (!delPaso.length) continue;
      const permitidas = new Set(palabras(vozDe(paso)));
      const dicho = palabras(delPaso.map((e) => e.voz).join(" "));
      const inventadas = dicho.filter((w) => !permitidas.has(w)).length;
      // Se tolera una palabra de enlace; más que eso es texto que no está en el guion.
      if (inventadas > 1 || (!dicho.length && permitidas.size)) {
        corregidos++;
        let primera = true;
        escenas = escenas.map((e) => {
          if (e.paso !== paso) return e;
          const voz = primera ? vozDe(paso) : "";
          primera = false;
          return { ...e, voz };
        });
      }
    }
    if (corregidos) avisos.push(`En ${corregidos} ${corregidos === 1 ? "paso" : "pasos"} la voz propuesta no coincidía con el guion: se dejó la frase del guion tal cual. Repártela entre las escenas si hace falta.`);
  }

  if (!d.fotos.length) avisos.push("No hay fotos del producto: las escenas de foto real y el cierre no se pueden armar hasta subir al menos una.");
  if (!escenas.some((e) => e.tipo === "foto-real") && d.fotos.length) {
    avisos.push("Solo el cierre muestra el producto real. Si el producto debe verse antes, cambia una escena del paso 4 a «Foto real animada».");
  }
  return { escenas: numerar(escenas), avisos };
}

/**
 * Lleva un proyecto a otra versión del guion (una corrección del cliente crea
 * versión nueva). Todo lo generado y aprobado se conserva; solo cambia lo que
 * se dice en los pasos que el guion nuevo tocó, y eso es de armado: no cuesta.
 */
export function heredarProyecto(
  p: ProyectoVideo,
  guionAntes: string,
  guionNuevo: string,
  contexto: ProyectoVideo["contexto"],
): { proyecto: ProyectoVideo; avisos: string[] } {
  const antes = pasosDelGuion(guionAntes);
  const nuevo = pasosDelGuion(guionNuevo);
  const cambiados = [1, 2, 3, 4, 5].filter((n) => {
    const b = nuevo.find((x) => x.paso === n);
    return !!b && (antes.find((x) => x.paso === n)?.voz ?? "") !== b.voz;
  });
  const visto = new Set<number>();
  const escenas = p.escenas.map((e) => {
    const copia = { ...e, imagen: { ...e.imagen }, clip: { ...e.clip } };
    if (!cambiados.includes(e.paso)) return copia;
    const primera = !visto.has(e.paso);
    visto.add(e.paso);
    return { ...copia, voz: primera ? (nuevo.find((x) => x.paso === e.paso)?.voz ?? "") : "" };
  });
  const avisos = cambiados.length
    ? [
        `Cambió lo que se dice en ${cambiados.length === 1 ? "el paso" : "los pasos"} ${cambiados.join(", ")}: la frase nueva quedó en la primera escena de cada paso. Solo hay que volver a armar; si además cambió lo que debe VERSE, márcalo en «Corregir».`,
      ]
    : ["Lo que se dice no cambió respecto de la versión anterior: revisa en «Corregir» si hay que rehacer alguna escena."];
  return {
    proyecto: {
      ...p,
      contexto: { ...contexto, fotos: contexto.fotos.length ? contexto.fotos : p.contexto.fotos },
      escenas,
      final: { estado: "pendiente", url: null, armados: 0, trabajoId: null, nota: "" },
      gastos: { ...p.gastos },
      trabajosAbiertos: [...p.trabajosAbiertos],
      avisos,
    },
    avisos,
  };
}

/** Frases habladas con datos sin completar entre [corchetes]. */
export function vozSinCompletar(p: Pick<ProyectoVideo, "escenas" | "contexto">): string[] {
  return corchetes([...p.escenas.map((e) => e.voz), p.contexto.cierre.oferta, p.contexto.cierre.llamadoALaAccion].join(" "));
}

// ------------------------------------------------------- correcciones ----

/** Lo que la persona marca en «Corregir». Solo se rehace lo que esto obligue. */
export type CorreccionProyecto = {
  /** Cambiar lo que se dice / el subtítulo de una escena. */
  textos: { n: number; voz: string }[];
  oferta: string | null;
  llamado: string | null;
  /** `undefined` = no se toca; null = sin música. */
  musica?: string | null;
  subtitulos?: boolean;
  /** Escenas de foto real o el cierre: otra foto, otro movimiento u otra duración. */
  fotos: { n: number; fotoUrl?: string; movimiento?: Movimiento; duracion?: number }[];
  /** Rehacer el clip de una escena (la imagen está bien). */
  clips: { n: number; nota: string }[];
  /** Rehacer la imagen de una escena (y por lo tanto su clip). */
  imagenes: { n: number; nota: string }[];
};

export const CORRECCION_VACIA: CorreccionProyecto = { textos: [], oferta: null, llamado: null, fotos: [], clips: [], imagenes: [] };

export type PasoCorreccion = { texto: string; cuesta: boolean };
export type PlanCorreccion = {
  pasos: PasoCorreccion[];
  /** Escenas cuya imagen se manda a generar ahora. */
  imagenes: number[];
  /** Escenas cuyo clip se manda a generar ahora. */
  clips: number[];
  /** Hay cambios que solo necesitan armar de nuevo. */
  cambiosDeArmado: boolean;
  /** Se puede armar ya (nada quedó esperando imagen o clip). */
  armarYa: boolean;
  bloqueos: string[];
  vacio: boolean;
};

/**
 * Traduce lo marcado a los trabajos MÍNIMOS:
 *   texto / subtítulo / oferta / música / foto real → solo armado (sin costo)
 *   una escena                                     → ese clip + armado
 *   la imagen de una escena                        → imagen + clip + armado
 */
export function planDeCorreccion(p: ProyectoVideo, c: CorreccionProyecto): PlanCorreccion {
  const pasos: PasoCorreccion[] = [];
  const bloqueos: string[] = [];
  const de = (n: number) => p.escenas.find((e) => e.n === n) ?? null;
  const imagenes: number[] = [];
  const clips: number[] = [];
  let cambiosDeArmado = false;

  for (const x of c.imagenes) {
    const e = de(x.n);
    if (!e || e.tipo !== "generada") continue;
    if (piezaEnCurso(e.imagen) || piezaEnCurso(e.clip)) bloqueos.push(`La escena ${e.n} ya se está generando: espera a que termine.`);
    else if (e.imagen.intentos >= TOPE_INTENTOS_ESCENA) bloqueos.push(`La imagen de la escena ${e.n} ya llegó al tope de ${TOPE_INTENTOS_ESCENA} intentos. Cámbiala a foto real o reescribe su prompt y pide al CEO reabrirla.`);
    else if (!x.nota.trim()) bloqueos.push(`Escribe qué está mal en la imagen de la escena ${e.n}.`);
    else {
      imagenes.push(e.n);
      pasos.push({ texto: `Imagen de la escena ${e.n}: se genera de nuevo (intento ${e.imagen.intentos + 1} de ${TOPE_INTENTOS_ESCENA}).`, cuesta: true });
      pasos.push({ texto: `Clip de la escena ${e.n}: se genera después de que apruebes la imagen nueva (${e.duracion} s).`, cuesta: true });
    }
  }
  for (const x of c.clips) {
    const e = de(x.n);
    if (!e || e.tipo !== "generada" || imagenes.includes(e.n) || c.imagenes.some((y) => y.n === e.n)) continue;
    if (piezaEnCurso(e.clip) || piezaEnCurso(e.imagen)) bloqueos.push(`La escena ${e.n} ya se está generando: espera a que termine.`);
    else if (e.imagen.estado !== "aprobada") bloqueos.push(`La escena ${e.n} no tiene imagen aprobada: primero aprueba su imagen.`);
    else if (e.clip.intentos >= TOPE_INTENTOS_ESCENA) bloqueos.push(`El clip de la escena ${e.n} ya llegó al tope de ${TOPE_INTENTOS_ESCENA} intentos. Cámbiala a foto real o pide al CEO reabrirla.`);
    else if (!x.nota.trim()) bloqueos.push(`Escribe qué está mal en el clip de la escena ${e.n}.`);
    else {
      clips.push(e.n);
      pasos.push({ texto: `Clip de la escena ${e.n}: se genera de nuevo desde su imagen aprobada (${e.duracion} s, intento ${e.clip.intentos + 1} de ${TOPE_INTENTOS_ESCENA}).`, cuesta: true });
    }
  }
  for (const x of c.textos) {
    const e = de(x.n);
    if (!e || x.voz.trim() === e.voz.trim()) continue;
    cambiosDeArmado = true;
    pasos.push({ texto: `Texto y subtítulo de la escena ${e.n}: se cambia al armar.`, cuesta: false });
  }
  if (c.oferta !== null && c.oferta.trim() !== p.contexto.cierre.oferta.trim()) {
    if (!c.oferta.trim()) bloqueos.push("La oferta no puede quedar vacía: el cierre la lleva siempre.");
    else {
      cambiosDeArmado = true;
      pasos.push({ texto: "Oferta del rótulo de cierre: se cambia al armar.", cuesta: false });
    }
  }
  if (c.llamado !== null && c.llamado.trim() !== p.contexto.cierre.llamadoALaAccion.trim()) {
    if (!c.llamado.trim()) bloqueos.push("El llamado a la acción no puede quedar vacío.");
    else {
      cambiosDeArmado = true;
      pasos.push({ texto: "Llamado a la acción del cierre: se cambia al armar.", cuesta: false });
    }
  }
  if (c.musica !== undefined && (c.musica?.trim() || null) !== p.opciones.musica) {
    cambiosDeArmado = true;
    pasos.push({ texto: c.musica?.trim() ? "Música: se mezcla la nueva al armar." : "Música: se quita al armar.", cuesta: false });
  }
  if (c.subtitulos !== undefined && c.subtitulos !== p.opciones.subtitulos) {
    cambiosDeArmado = true;
    pasos.push({ texto: c.subtitulos ? "Subtítulos: se ponen al armar." : "Subtítulos: se quitan al armar.", cuesta: false });
  }
  for (const x of c.fotos) {
    const e = de(x.n);
    if (!e || e.tipo === "generada") continue;
    const cambia =
      (x.fotoUrl !== undefined && x.fotoUrl !== e.fotoUrl) || (x.movimiento !== undefined && x.movimiento !== e.movimiento) || (x.duracion !== undefined && x.duracion !== e.duracion);
    if (!cambia) continue;
    if (x.fotoUrl !== undefined && !p.contexto.fotos.includes(x.fotoUrl)) {
      bloqueos.push(`La foto elegida para la escena ${e.n} no es una de las fotos del producto.`);
      continue;
    }
    cambiosDeArmado = true;
    pasos.push({ texto: `Escena ${e.n} (${e.tipo === "cierre" ? "cierre" : "foto real"}): se rehace con la foto, sin generar nada.`, cuesta: false });
  }

  const hayGeneracion = imagenes.length > 0 || clips.length > 0;
  const vacio = !pasos.length && !bloqueos.length;
  if (!vacio && !bloqueos.length) {
    pasos.push({
      texto: hayGeneracion ? "Armado: se vuelve a armar cuando apruebes lo regenerado. Las demás escenas no se tocan." : "Armado: se vuelve a armar ahora. Ninguna escena se regenera.",
      cuesta: false,
    });
  }
  return { pasos, imagenes, clips, cambiosDeArmado, armarYa: !hayGeneracion && cambiosDeArmado, bloqueos, vacio };
}
