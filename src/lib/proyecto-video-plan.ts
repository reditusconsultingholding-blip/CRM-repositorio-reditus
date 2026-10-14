// Plan de escenas y correcciones del proyecto de video — funciones puras
// (seguro para componentes de cliente).
//
// Regla de costo por defecto: las escenas de producto/beneficios y el cierre
// salen como `foto-real` (se anima la foto real: el producto sale idéntico y
// cuesta cero). Solo se generan las escenas que la foto no puede mostrar.
import type { FormatoVideo } from "@/lib/video-formatos";
import { corchetes, pasosDelGuion, segundosDeTramo } from "@/lib/trabajos-video";
import {
  LOCUCIONES,
  MAX_SEGUNDOS_CLIP,
  cortesDeApertura,
  golpesPara,
  type Transicion,
  contarPalabras,
  palabrasQueCaben,
  type Locucion,
  type VozProyecto,
  MAX_ESCENAS_PROYECTO,
  MOVIMIENTOS,
  NOMBRE_PASO,
  TIPOS_ESCENA,
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
const MAX_CLIP = MAX_SEGUNDOS_CLIP;
/** Formatos narrados: nadie habla a cámara; la frase la dice un narrador fuera de cámara. */
const NARRADOS = new Set(["usos-del-producto", "historia", "explicativo-3d", "animacion-3d", "claymation", "crochet", "esqueleto", "historias-musicales"]);
export const locucionDeFormato = (slug: string): Locucion => (NARRADOS.has(slug) ? "narrador" : "camara");

export type DatosPlan = {
    guion: string;
    formato: FormatoPlan;
    fotos: string[];
    fichaTexto: string;
    producto: string;
    /** La voz del proyecto. Con motor `clip`, las escenas de foto real no hablan: su frase va solo escrita. */
    voz?: VozProyecto;
    /** Video automático: debe quedar bien sin que nadie lo retoque (mayoría de clips con voz, frases que caben, cierre dicho). */
    rico?: boolean;
  };

const ORACION = /[^.!?…]+[.!?…]+["”»]?|[^.!?…]+$/g;
const oraciones = (t: string) => (t.match(ORACION) ?? []).map((x) => x.trim()).filter(Boolean);

/**
 * La voz la genera el modelo dentro de cada clip, así que cada escena generada
 * lleva SU frase: lo que cabe dicho con naturalidad en su duración. Dentro de
 * cada paso se reparten las oraciones entre sus escenas generadas, sin partir
 * ninguna. Lo que no quepa se dice con claridad para que alguien lo recorte.
 */
export function repartirVoz(escenas: EscenaProyecto[], repartir: boolean): { escenas: EscenaProyecto[]; avisos: string[] } {
  const avisos: string[] = [];
  const salida = escenas.map((e) => ({ ...e }));
  if (repartir) {
    for (const paso of [1, 2, 3, 4, 5]) {
      const idx = salida.map((_, i) => i).filter((i) => salida[i].paso === paso && salida[i].tipo === "generada" && salida[i].locucion !== "sin-voz" && salida[i].locucion !== "texto");
      if (idx.length < 2) continue;
      const frases = idx.flatMap((i) => oraciones(salida[i].voz));
      const reparto = idx.map(() => [] as string[]);
      let k = 0;
      for (const f of frases) {
        const cabe = () => contarPalabras([...reparto[k], f].join(" ")) <= palabrasQueCaben(salida[idx[k]].duracion);
        while (!cabe() && reparto[k].length && k < idx.length - 1) k++;
        reparto[k].push(f);
      }
      idx.forEach((i, j) => {
        salida[i] = { ...salida[i], voz: reparto[j].join(" ") };
      });
    }
  }
  const largas = salida.map((e, i) => ({ ...e, n: i + 1 })).filter((e) => e.tipo === "generada" && e.locucion !== "texto" && contarPalabras(e.voz) > palabrasQueCaben(e.duracion));
  if (largas.length) {
    avisos.push(
      `La frase de la escena ${largas.map((e) => `${e.n} (${contarPalabras(e.voz)} palabras para ${e.duracion} s; caben ${palabrasQueCaben(e.duracion)})`).join(", ")} no cabe dicha con naturalidad en su clip: recórtala o repártela, o el modelo la dirá atropellada o cortada.`,
    );
  }
  return { escenas: salida, avisos };
}

// ------------------------------------------------ video automático: que quede bien ----
//
// Reglas del dueño para un video que nadie va a retocar («que quede muy bien, no
// cualquier cosa»):
//  · al menos el 60 % de la duración es clip generado con voz (persona usando el
//    producto o narrador); las fotos reales quedan para 1–2 inserciones cortas y el cierre;
//  · clips de 6 a 8 s (el proveedor cobra el de 8 igual), salvo el gancho, que es corto;
//  · ninguna frase se pasa de lo que cabe en su clip: se alarga la escena o se reparte;
//  · el cierre se DICE: una escena generada con la oferta y el llamado, y después el rótulo con la foto real;
//  · no se repite la misma foto en escenas seguidas.

export const PARTE_GENERADA_MINIMA = 0.6;
const MAX_INSERCIONES_DE_FOTO = 2;

const habla = (e: EscenaProyecto) => e.tipo === "generada" && e.locucion !== "sin-voz" && e.locucion !== "texto" && !!e.voz.trim();
const parteGenerada = (l: EscenaProyecto[]) => {
  const total = l.reduce((x, e) => x + e.duracion, 0);
  return total ? l.filter((e) => e.tipo === "generada").reduce((x, e) => x + e.duracion, 0) / total : 0;
};

/** Qué le falta a un plan para ser un buen video automático (vacío = cumple). Sirve para pedirle a la IA que lo corrija. */
/** Lo que se le agrega al prompt del clip de la apertura cuando la IA no lo escribió en momentos. */
export const APERTURA_EN_MOMENTOS =
  "APERTURA EN CUATRO MOMENTOS dentro del mismo clip de 8 s (luego se usan solo esos tramos, pegados; cada momento empieza con un cambio claro de encuadre o de acción y NO hay tiempos muertos): " +
  "0–1 s GOLPE VISUAL que frena el scroll: el producto real entra en plano de forma inesperada (cae sobre la superficie, se destapa, zoom brusco hasta él o una mano lo atrapa al vuelo); " +
  "2–3 s primerísimo plano del detalle más reconocible del producto, con movimiento; 4–5 s el producto en uso, desde otro ángulo; 6–7 s el resultado o la reacción, en un plano distinto. " +
  "Es una recreación propia del TIPO de toma: sin copiar material, marcas ni personas de terceros.";

/** La primera escena es la apertura: un clip de 8 s del que se usan 4 tramos cortos (3 o 4 s en total). Modifica la escena. Devuelve si cambió algo. */
export function ponerApertura(escenas: EscenaProyecto[]): boolean {
  const e = escenas[0];
  if (!e || e.tipo !== "generada" || (e.cortes?.length ?? 0) >= 3) return false;
  const segundos = contarPalabras(e.voz) > palabrasQueCaben(3) ? 4 : 3;
  e.duracion = segundos;
  e.duracionClip = MAX_CLIP;
  e.cortes = cortesDeApertura(segundos);
  if (!/APERTURA EN CUATRO MOMENTOS|0\s?[–-]\s?1 s/i.test(e.promptVideo)) e.promptVideo = `${e.promptVideo.trim()}\n\n${APERTURA_EN_MOMENTOS}`.trim();
  return true;
}

export function faltasDeRiqueza(escenas: EscenaProyecto[], vozEnElClip: boolean): string[] {
  const faltas: string[] = [];
  const parte = parteGenerada(escenas);
  if (parte < PARTE_GENERADA_MINIMA) faltas.push(`solo el ${Math.round(parte * 100)} % de la duración es clip generado; debe ser al menos el ${PARTE_GENERADA_MINIMA * 100} %`);
  const cortos = escenas.filter((e, i) => i > 0 && habla(e) && e.duracion < 6);
  if (cortos.length) faltas.push(`hay ${cortos.length} clips con voz de menos de 6 s (deben durar de 6 a 8 s; solo el gancho puede ser más corto)`);
  const largas = escenas.filter((e) => habla(e) && contarPalabras(e.voz) > palabrasQueCaben(e.duracion));
  if (largas.length) faltas.push(`${largas.length} escenas tienen una frase que no cabe en su duración`);
  if (vozEnElClip && !escenas.some((e) => e.paso === 5 && habla(e))) faltas.push("el cierre no se dice en voz: falta una escena generada en el paso 5 con la oferta y el llamado, antes del rótulo");
  const fotos = escenas.filter((e) => e.tipo === "foto-real").length;
  if (fotos > MAX_INSERCIONES_DE_FOTO) faltas.push(`hay ${fotos} escenas de foto real; como mucho ${MAX_INSERCIONES_DE_FOTO} inserciones cortas del producto, además del cierre`);
  if (escenas.some((e, i) => i > 0 && e.tipo !== "generada" && escenas[i - 1].tipo !== "generada" && e.fotoUrl && e.fotoUrl === escenas[i - 1].fotoUrl)) faltas.push("se repite la misma foto en escenas seguidas");
  return faltas;
}

/** Parte un texto en trozos de oraciones enteras que caben en un clip de 8 s. Una oración sola más larga queda entera. */
function trozosQueCaben(texto: string): string[] {
  const tope = palabrasQueCaben(MAX_CLIP);
  const trozos: string[] = [];
  let actual: string[] = [];
  for (const o of oraciones(texto)) {
    if (actual.length && contarPalabras([...actual, o].join(" ")) > tope) {
      trozos.push(actual.join(" "));
      actual = [];
    }
    actual.push(o);
  }
  if (actual.length) trozos.push(actual.join(" "));
  return trozos;
}

/** Los segundos que necesita una frase para decirse con naturalidad, entre un mínimo y los 8 s del clip. */
const segundosPara = (texto: string, minimo: number) => entre(Math.max(minimo, Math.ceil(contarPalabras(texto) / 2.6) + 1), 3, MAX_CLIP);

/**
 * Deja un plan dentro de las reglas del video automático SIN IA: alarga o reparte
 * las frases, dice el cierre, convierte fotos en clips hasta llegar al 60 % y
 * alterna las fotos. Es el último recurso cuando la IA, tras un reintento, no
 * cumplió; también sirve para arreglar un plan viejo. Devuelve qué cambió.
 */
export function enriquecerPlan(entrada: EscenaProyecto[], d: DatosPlan): { escenas: EscenaProyecto[]; cambios: string[] } {
  const cambios: string[] = [];
  const pasos = pasosDelGuion(d.guion);
  const quien = locucionDeFormato(d.formato.slug);
  const vozEnElClip = !d.voz || d.voz.motor === "clip";
  const quePasa = (paso: number) => d.formato.estructura.find((x) => x.paso === paso)?.que_pasa ?? NOMBRE_PASO[paso];
  const nueva = (base: EscenaProyecto, voz: string, titulo: string, minimo: number): EscenaProyecto => {
    const duracion = segundosPara(voz, minimo);
    const p = promptsDePlantilla(d, base.paso, quePasa(base.paso), pasos.find((x) => x.paso === base.paso)?.texto ?? "", duracion, base.paso >= 4);
    return {
      ...base,
      n: 0,
      tipo: "generada",
      titulo,
      duracion,
      voz,
      locucion: base.tipo === "generada" && base.locucion !== "texto" && base.locucion !== "sin-voz" ? base.locucion : quien,
      fotoUrl: null,
      promptImagen: base.tipo === "generada" && base.promptImagen.trim() ? base.promptImagen : `${p.promptImagen}\nSituación que ilustra esta frase: «${voz}»`,
      promptVideo: base.tipo === "generada" && base.promptVideo.trim() ? base.promptVideo : p.promptVideo,
      imagen: piezaNueva(),
      clip: piezaNueva(),
    };
  };
  let escenas = entrada.map((e) => ({ ...e }));

  // 1) El cierre se dice: una escena generada con la oferta y el llamado, justo antes del rótulo.
  const iCierre = escenas.findIndex((e) => e.tipo === "cierre");
  if (vozEnElClip && iCierre >= 0 && !escenas.some((e) => e.paso === 5 && habla(e))) {
    const frase = escenas[iCierre].voz.trim() || (pasos.find((x) => x.paso === 5)?.voz ?? "");
    if (frase) {
      const dicha = nueva({ ...escenas[iCierre], paso: 5 }, frase, "Cierre dicho", 6);
      escenas = [...escenas.slice(0, iCierre), dicha, { ...escenas[iCierre], voz: "", locucion: "sin-voz" as const }, ...escenas.slice(iCierre + 1)];
      cambios.push("se agregó una escena hablada con la oferta y el llamado antes del rótulo de cierre");
    }
  }

  // 2) Fotos reales: como mucho dos inserciones cortas. Las que llevan frase pasan a clip con voz.
  const conFrase = escenas.filter((e) => e.tipo === "foto-real" && e.voz.trim());
  let convertidas = 0;
  for (const f of conFrase) {
    const fotos = escenas.filter((e) => e.tipo === "foto-real").length;
    if (parteGenerada(escenas) >= PARTE_GENERADA_MINIMA && fotos <= MAX_INSERCIONES_DE_FOTO) break;
    escenas = escenas.map((e) => (e === f ? nueva(e, e.voz, e.titulo, 6) : e));
    convertidas++;
  }
  if (convertidas) cambios.push(`${convertidas} ${convertidas === 1 ? "escena de foto pasó" : "escenas de foto pasaron"} a clip generado con voz (el producto se sigue viendo en las inserciones y en el cierre)`);
  // Fotos mudas de sobra: se quitan; las que quedan son inserciones cortas.
  const mudas = escenas.filter((e) => e.tipo === "foto-real" && !e.voz.trim());
  const sobran = escenas.filter((e) => e.tipo === "foto-real").length - MAX_INSERCIONES_DE_FOTO;
  if (sobran > 0) {
    const quitar = new Set(mudas.slice(0, sobran));
    if (quitar.size) {
      escenas = escenas.filter((e) => !quitar.has(e));
      cambios.push(`se quitaron ${quitar.size} inserciones de foto repetidas`);
    }
  }
  escenas = escenas.map((e) => (e.tipo === "foto-real" ? { ...e, duracion: Math.min(e.duracion, 3) } : e));

  // 3) Frases y duraciones: cada clip con voz dura lo que su frase necesita (6–8 s; el gancho puede ser corto);
  //    lo que no cabe ni en 8 s se reparte por oraciones en otra escena.
  let alargadas = 0;
  let repartidas = 0;
  escenas = escenas.flatMap((e, i) => {
    if (!habla(e)) return [e];
    const trozos = trozosQueCaben(e.voz);
    const minimo = i === 0 ? 3 : 6;
    const primera = { ...e, voz: trozos[0], duracion: segundosPara(trozos[0], minimo) };
    if (primera.duracion !== e.duracion) alargadas++;
    if (trozos.length === 1) return [primera];
    repartidas++;
    return [primera, ...trozos.slice(1).map((t, k) => nueva({ ...e, promptImagen: `${e.promptImagen}\nMisma situación y mismo personaje, otro ángulo (continuación ${k + 2}).`, promptVideo: e.promptVideo }, t, `${e.titulo} (sigue)`, 6))];
  });
  if (alargadas) cambios.push(`${alargadas} ${alargadas === 1 ? "clip se ajustó" : "clips se ajustaron"} a la duración que su frase necesita (6–8 s)`);
  if (repartidas) cambios.push(`${repartidas} ${repartidas === 1 ? "frase larga se repartió" : "frases largas se repartieron"} en dos escenas, por oraciones`);

  // 4) Si todavía falta clip generado, las fotos sin frase que queden también pasan a clip (con narración vacía no: se dejan).
  // 5) No repetir la misma foto en escenas seguidas.
  if (d.fotos.length > 1) {
    let anterior: string | null = null;
    let alternadas = 0;
    escenas = escenas.map((e) => {
      if (e.tipo === "generada") {
        anterior = null;
        return e;
      }
      let foto = e.fotoUrl;
      if (foto && foto === anterior) {
        foto = d.fotos[(d.fotos.indexOf(foto) + 1) % d.fotos.length];
        alternadas++;
      }
      anterior = foto;
      return { ...e, fotoUrl: foto };
    });
    // El cierre y la inserción anterior tampoco comparten foto si hay otra.
    if (alternadas) cambios.push("se alternaron las fotos para no repetir la misma en escenas seguidas");
  }
  // Ritmo: cada escena entra con una transición distinta a la anterior y ninguna toma pasa de ~3 s sin un cambio visual.
  const CICLO: Transicion[] = ["zoom", "barrido", "deslizar", "flash", "glitch"];
  let puestas = 0;
  escenas = escenas.map((e, i) => {
    const x = { ...e };
    if (i > 0 && !x.transicion) {
      x.transicion = x.tipo === "cierre" ? "fundido" : CICLO[(i - 1) % CICLO.length];
      puestas++;
    }
    if (x.tipo !== "cierre" && !x.cortes?.length && !x.golpesVisuales?.length && x.duracion > 3.4) x.golpesVisuales = golpesPara(x.duracion);
    return x;
  });
  if (puestas) cambios.push(`${puestas} escenas recibieron su transición de entrada (variadas, no solo corte seco) y cambios visuales cada ~3 s`);
  // La apertura: un solo clip de 8 s del que se usan cuatro tramos cortos (golpe + tres tomas).
  if (ponerApertura(escenas)) cambios.push("la primera escena pasó a ser la apertura de 3 s en cuatro tomas cortas (sale de un solo clip)");
  return { escenas: numerar(escenas.slice(0, MAX_ESCENAS_PROYECTO)), cambios };
}

/** El bloque de audio que se agrega al prompt del clip: quién habla, qué dice, en qué acento y con qué voz (siempre la misma). */
export function bloqueDeAudio(e: Pick<EscenaProyecto, "voz" | "locucion">, voz: VozProyecto): string {
  const frase = e.voz.trim();
  if (!frase || e.locucion === "sin-voz" || e.locucion === "texto") return "AUDIO: nadie habla en esta toma; solo sonido ambiente suave. Sin música y sin voces.";
  const quien =
    e.locucion === "narrador"
      ? "una voz narradora fuera de cámara (nadie en pantalla mueve los labios)"
      : "la persona en pantalla, mirando a cámara, con los labios sincronizados";
  return [
    `AUDIO: habla ${quien} y dice exactamente, una sola vez y sin agregar nada: «${frase}»`,
    `Idioma y acento: ${voz.acento} (${voz.idioma}).`,
    `Voz (la misma en todo el video): ${voz.descripcion}.`,
    "Sin música, sin otras voces y sin texto en pantalla. La frase termina antes del final del clip.",
  ].join("\n");
}

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
    locucion: base.tipo === "generada" ? "camara" : "texto",
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
  const quien = locucionDeFormato(d.formato.slug);
  for (const e of escenas) e.locucion = e.tipo === "generada" ? quien : "texto";
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
      ...((LOCUCIONES as readonly string[]).includes(o.locucion as string) ? { locucion: o.locucion as Locucion } : tipo === "generada" ? { locucion: locucionDeFormato(d.formato.slug) } : {}),
      promptImagen: s("promptImagen", 4000),
      promptVideo: s("promptVideo", 4000),
      fotoUrl: d.fotos.includes(pedida) ? pedida : (d.fotos[indice] ?? null),
      movimiento: (MOVIMIENTOS as readonly string[]).includes(o.movimiento as string) ? (o.movimiento as Movimiento) : "acercar",
      ...(Array.isArray(o.cortes) && o.cortes.length >= 2 ? { cortes: o.cortes as EscenaProyecto["cortes"], duracionClip: n("duracionClip", MAX_CLIP) } : {}),
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
      x.duracion = entre(x.duracion, 3, MAX_CLIP);
      if (x.locucion === "texto") x.locucion = "sin-voz";
      // Con narración aparte nadie habla a cámara: la frase la dice el narrador (una sola voz en todo el video).
      if (d.voz?.motor === "narracion" && x.locucion === "camara") x.locucion = "narrador";
      if (!x.promptImagen.trim() || !x.promptVideo.trim()) {
        const est = d.formato.estructura.find((s) => s.paso === x.paso);
        const p = promptsDePlantilla(d, x.paso, est?.que_pasa ?? NOMBRE_PASO[x.paso], pasos.find((s) => s.paso === x.paso)?.texto ?? "", x.duracion, x.paso >= 4);
        x.promptImagen = x.promptImagen.trim() || p.promptImagen;
        x.promptVideo = x.promptVideo.trim() || p.promptVideo;
      }
    } else {
      x.duracion = x.tipo === "cierre" ? entre(x.duracion, 5, 10) : entre(x.duracion, 2, 8);
      // Una foto animada no habla: con la voz dentro del clip, su frase va solo escrita.
      if (!d.voz || d.voz.motor === "clip") x.locucion = x.voz.trim() ? "texto" : "sin-voz";
      else if (x.locucion === "camara") x.locucion = "narrador";
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

  const reparto = repartirVoz(escenas, opciones.verificarVoz);
  escenas = reparto.escenas;
  avisos.push(...reparto.avisos);
  if ((!d.voz || d.voz.motor === "clip") && escenas.some((e) => e.tipo === "cierre" && e.voz.trim()) && !escenas.some((e) => e.tipo === "generada" && e.paso === 5)) {
    avisos.push("La frase del cierre no se dice en voz (el cierre es una foto real): va en subtítulo y en el rótulo. Si quieres que alguien la diga, agrega una escena generada en el paso 5.");
  }
  // Estructura obligatoria: arranque rápido con el gancho, y cierre con oferta + llamado (el cierre ya se garantizó arriba).
  const primera = escenas[0];
  if (primera && primera.paso !== 1) avisos.push("La primera escena no es el gancho (paso 1): el video debe abrir con el gancho en el primer segundo, sin presentación.");
  else if (primera && primera.duracion > 4) avisos.push(`La primera toma dura ${primera.duracion} s: el arranque debe ser rápido. Déjala en 4 s o menos, o pártela en dos tomas cortas.`);
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
      auto: { ...p.auto, parada: null },
      gastos: { ...p.gastos },
      trabajosAbiertos: [...p.trabajosAbiertos],
      avisos,
    },
    avisos,
  };
}

/** Los ganchos que ya propuso la investigación (bloque «GANCHOS A PROBAR»), uno por línea. */
export function ganchosDeInvestigacion(analisis: string): string[] {
  const i = analisis.search(/GANCHOS A PROBAR/i);
  if (i < 0) return [];
  const resto = analisis.slice(i).split("\n").slice(0, 14);
  const salida: string[] = [];
  resto.forEach((linea, k) => {
    const sinTitulo = k === 0 ? linea.replace(/^.*GANCHOS A PROBAR\s*:?/i, "") : linea;
    if (k > 0 && /^[A-ZÁÉÍÓÚÑ¿ ]{6,}:/.test(sinTitulo.trim())) resto.length = 0; // empieza el bloque siguiente
    const t = sinTitulo.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, "").replace(/\[A\d+\]/g, "").replace(/^["“«]|["”»]$/g, "").trim();
    if (resto.length && t.length >= 8 && t.length <= 220) salida.push(t);
  });
  return [...new Set(salida)].slice(0, 5);
}

/** Lo que una variación cambia respecto del proyecto del que sale. */
export type PedidoVariacion = {
  /** Texto nuevo de la escena 1 (el gancho). Vacío = no cambia. */
  gancho: string;
  /** Además del texto, se genera de nuevo la imagen y el clip de la escena 1. */
  regenerarGancho: boolean;
  /** Qué debe verse en el gancho nuevo (va al generador). */
  notaGancho: string;
  /** Otra oferta u otro llamado a la acción. Vacío = no cambia. */
  oferta: string;
  llamado: string;
};

export type CostoVariaciones = { imagenes: number; clips: number; segundos: number; armados: number; texto: string };

/** Lo que cuestan N variaciones ANTES de crearlas: solo lo nuevo; todo lo demás se reutiliza. */
export function costoDeVariaciones(p: ProyectoVideo, pedidos: PedidoVariacion[]): CostoVariaciones {
  const primera = p.escenas[0];
  const generable = primera?.tipo === "generada";
  const hablaElClip = generable && p.contexto.voz.motor === "clip" && p.opciones.voz && primera.locucion !== "texto" && primera.locucion !== "sin-voz";
  const conImagen = generable ? pedidos.filter((v) => v.regenerarGancho).length : 0;
  // Con la voz dentro del clip, un gancho nuevo se dice en un clip nuevo (sobre la misma imagen).
  const conClip = generable ? pedidos.filter((v) => v.regenerarGancho || (hablaElClip && v.gancho.trim() && v.gancho.trim() !== primera.voz.trim())).length : 0;
  const c = { imagenes: conImagen, clips: conClip, segundos: conClip * (primera?.duracion ?? 0), armados: pedidos.length };
  const n = pedidos.length;
  const partes = [
    c.imagenes ? `${c.imagenes} ${c.imagenes === 1 ? "imagen nueva" : "imágenes nuevas"}` : "",
    c.clips ? `${c.clips} ${c.clips === 1 ? "clip nuevo" : "clips nuevos"} (${c.segundos} s)` : "",
    `${c.armados} ${c.armados === 1 ? "armado" : "armados"} (sin costo)`,
  ].filter(Boolean);
  return { ...c, texto: `${n} ${n === 1 ? "variación" : "variaciones"} = ${partes.join(" + ")}` };
}

/**
 * El proyecto de una variación: copia del original con TODAS sus piezas
 * aprobadas (no se vuelven a pagar) y solo el cambio pedido. El costo empieza
 * en cero: lo heredado ya está pagado en el original.
 */
export function proyectoDeVariacion(p: ProyectoVideo, v: PedidoVariacion, origen: { guionId: string; producto: string }, ahora: string, quien: string): ProyectoVideo {
  const cambia: string[] = [];
  const escenas = p.escenas.map((e, i) => {
    const copia: EscenaProyecto = { ...e, imagen: { ...e.imagen, trabajoId: null }, clip: { ...e.clip, trabajoId: null } };
    if (i !== 0) return copia;
    if (v.gancho.trim()) {
      const hablaElClip = e.tipo === "generada" && p.contexto.voz.motor === "clip" && p.opciones.voz && e.locucion !== "texto" && e.locucion !== "sin-voz";
      if (hablaElClip && v.gancho.trim() !== e.voz.trim() && !v.regenerarGancho) {
        // La frase la dice el clip: se genera ese clip de nuevo sobre la misma imagen aprobada.
        copia.clip = piezaNueva();
        cambia.push("clip del gancho (lo dice el clip)");
      }
      copia.voz = v.gancho.trim();
      cambia.push("gancho");
    }
    if (v.regenerarGancho && e.tipo === "generada") {
      const nota = [v.notaGancho.trim(), v.gancho.trim() ? `Gancho nuevo que se dice: «${v.gancho.trim()}»` : ""].filter(Boolean).join(" · ");
      copia.imagen = { ...piezaNueva(), nota };
      copia.clip = piezaNueva();
      cambia.push("imagen y clip del gancho");
    }
    return copia;
  });
  const cierre = { oferta: v.oferta.trim() || p.contexto.cierre.oferta, llamadoALaAccion: v.llamado.trim() || p.contexto.cierre.llamadoALaAccion };
  if (v.oferta.trim() && v.oferta.trim() !== p.contexto.cierre.oferta) cambia.push("oferta");
  if (v.llamado.trim() && v.llamado.trim() !== p.contexto.cierre.llamadoALaAccion) cambia.push("llamado a la acción");
  return {
    ...p,
    contexto: { ...p.contexto, cierre },
    escenas,
    costo: { creditos: 0, segundosGenerados: 0, imagenes: 0 },
    final: { estado: "pendiente", url: null, armados: 0, trabajoId: null, nota: "" },
    gastos: {},
    trabajosAbiertos: [],
    registro: [{ fecha: ahora, texto: `Variación creada por ${quien}: cambia ${cambia.join(", ") || "nada"}. Las demás escenas se reutilizan del original.` }],
    avisos: [],
    auto: { ...p.auto, activo: true, parada: null },
    variacionDe: { ...origen, cambia: cambia.join(", ") || "nada" },
    creadoAt: ahora,
    creadoPor: quien,
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
    else if (e.imagen.intentos >= p.topeIntentos) bloqueos.push(`La imagen de la escena ${e.n} ya llegó al tope de ${p.topeIntentos} intentos. Cámbiala a foto real o reescribe su prompt y pide al CEO reabrirla.`);
    else if (!x.nota.trim()) bloqueos.push(`Escribe qué está mal en la imagen de la escena ${e.n}.`);
    else {
      imagenes.push(e.n);
      pasos.push({ texto: `Imagen de la escena ${e.n}: se genera de nuevo (intento ${e.imagen.intentos + 1} de ${p.topeIntentos}).`, cuesta: true });
      pasos.push({ texto: `Clip de la escena ${e.n}: se genera después de que apruebes la imagen nueva (${e.duracion} s).`, cuesta: true });
    }
  }
  for (const x of c.clips) {
    const e = de(x.n);
    if (!e || e.tipo !== "generada" || imagenes.includes(e.n) || c.imagenes.some((y) => y.n === e.n)) continue;
    if (piezaEnCurso(e.clip) || piezaEnCurso(e.imagen)) bloqueos.push(`La escena ${e.n} ya se está generando: espera a que termine.`);
    else if (e.imagen.estado !== "aprobada") bloqueos.push(`La escena ${e.n} no tiene imagen aprobada: primero aprueba su imagen.`);
    else if (e.clip.intentos >= p.topeIntentos) bloqueos.push(`El clip de la escena ${e.n} ya llegó al tope de ${p.topeIntentos} intentos. Cámbiala a foto real o pide al CEO reabrirla.`);
    else if (!x.nota.trim()) bloqueos.push(`Escribe qué está mal en el clip de la escena ${e.n}.`);
    else {
      clips.push(e.n);
      pasos.push({ texto: `Clip de la escena ${e.n}: se genera de nuevo desde su imagen aprobada (${e.duracion} s, intento ${e.clip.intentos + 1} de ${p.topeIntentos}).`, cuesta: true });
    }
  }
  for (const x of c.textos) {
    const e = de(x.n);
    if (!e || x.voz.trim() === e.voz.trim()) continue;
    const vozEnElClip = e.tipo === "generada" && p.contexto.voz.motor === "clip" && p.opciones.voz && e.locucion !== "texto" && e.locucion !== "sin-voz";
    if (vozEnElClip) {
      // La voz la dice el propio clip: una frase nueva obliga a generar ese clip otra vez (la imagen se conserva).
      if (imagenes.includes(e.n) || clips.includes(e.n)) {
        pasos.push({ texto: `Frase de la escena ${e.n}: la dirá el clip que ya se va a generar.`, cuesta: false });
        continue;
      }
      if (piezaEnCurso(e.clip) || piezaEnCurso(e.imagen)) bloqueos.push(`La escena ${e.n} ya se está generando: espera a que termine.`);
      else if (e.imagen.estado !== "aprobada") bloqueos.push(`La escena ${e.n} no tiene imagen aprobada: primero aprueba su imagen.`);
      else if (e.clip.intentos >= p.topeIntentos) bloqueos.push(`El clip de la escena ${e.n} ya llegó al tope de ${p.topeIntentos} intentos: su frase no se puede cambiar sin reabrirlo.`);
      else {
        clips.push(e.n);
        pasos.push({ texto: `Frase de la escena ${e.n}: la voz sale del clip, así que se genera ese clip de nuevo (${e.duracion} s, intento ${e.clip.intentos + 1} de ${p.topeIntentos}). La imagen se conserva.`, cuesta: true });
      }
      continue;
    }
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
