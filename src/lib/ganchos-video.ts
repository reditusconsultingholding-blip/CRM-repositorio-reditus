// Banco de ganchos: las aperturas de 3 segundos que frenan el scroll — funciones puras.
//
// `video-formatos/ganchos.json` es una COPIA: la fuente se edita en
// `formatos-video/ganchos/ganchos.json` y se copia con
// `node formatos-video/ganchos/construir-ganchos.cjs` (ahí está cómo refrescar la investigación).
// Cada gancho es un TIPO de toma que se recrea con el producto real: nunca material de terceros.
import banco from "@/lib/video-formatos/ganchos.json";
import { cortesDeApertura, piezaNueva, type EscenaProyecto } from "@/lib/proyecto-video";

export type Gancho = { id: string; nombre: string; cuando: string; como: string; promptImagen: string; promptClip: string; frase: string; riesgos: string; palabras: string[]; transicion?: string };

export const GANCHOS: Gancho[] = banco.ganchos;
export const GANCHOS_VERSION = `v${banco.version} · ${banco.investigado}`;
export const buscarGancho = (id: string) => GANCHOS.find((g) => g.id === id) ?? null;

/** Lo que guarda el proyecto: el gancho activo, las alternativas que se ofrecen y por qué se eligió. */
export type GanchoDeProyecto = { id: string; opciones: string[]; porque: string };

const limpio = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Elige el gancho con criterio y deja tres a la vista. Puntúa cada uno por cuánto encaja con el
 * producto, su dolor y lo que dicen los anuncios consultados (`texto` = todo eso junto), descarta
 * los que no se pueden usar con verdad (la cifra, sin cifra) y manda al final los que este cliente
 * ya usó (`usados`), para no repetir entre sus videos.
 */
export function elegirGanchos(texto: string, usados: string[] = [], formato = ""): GanchoDeProyecto {
  const t = limpio(texto);
  const hayCifra = /\d{2,3}([.,]\d+)?\s?%|por ciento/.test(t);
  const conPersona = ["ugc", "testimonio", "entrevista", "podcast"].includes(formato);
  const puntuados = GANCHOS.filter((g) => (g.id === "cifra-real" ? hayCifra : g.id === "reaccion" ? conPersona : true))
    .map((g, i) => {
      const aciertos = g.palabras.filter((p) => t.includes(limpio(p)));
      return { g, aciertos, puntos: aciertos.length * 2 - (usados.includes(g.id) ? 100 : 0) - i * 0.01 };
    })
    .sort((a, b) => b.puntos - a.puntos);
  const tres = puntuados.slice(0, 3);
  const primero = tres[0];
  const porque = primero
    ? `«${primero.g.nombre}»: ${primero.aciertos.length ? `encaja con ${primero.aciertos.slice(0, 3).join(", ")}` : "es el que mejor sirve cuando no hay una pista clara"}${usados.length ? "; no repite el de los videos anteriores de este cliente" : ""}.`
    : "";
  return { id: primero?.g.id ?? "", opciones: tres.map((x) => x.g.id), porque };
}

const rellenar = (plantilla: string, producto: string, dolor: string) => plantilla.replaceAll("{producto}", producto || "el producto").replaceAll("{dolor}", dolor || "la situación del problema");

/**
 * Convierte la primera escena en la apertura de ese gancho: imagen base y clip de 8 s en cuatro
 * momentos, de los que se usan cuatro tramos cortos. La frase no se toca si ya hay una (es la del
 * guion); sin frase, va la frase tipo. La imagen y el clip anteriores dejan de valer.
 */
export function aplicarGancho(e: EscenaProyecto, g: Gancho, d: { producto: string; dolor: string; fichaTexto: string; relacion: string }): EscenaProyecto {
  const producto = d.producto.split(/\s[–—|·:-]\s/)[0].trim() || d.producto;
  const fiel = `El producto es EXACTAMENTE el de las fotos de referencia (${producto}): misma forma, mismos colores y misma etiqueta, tamaño real, sin inventar texto ni logotipos.${d.fichaTexto ? ` ${d.fichaTexto.replace(/\s+/g, " ").slice(0, 400)}` : ""}`;
  const segundos = e.duracion >= 4 ? 4 : 3;
  return {
    ...e,
    tipo: "generada",
    titulo: `Apertura · ${g.nombre}`.slice(0, 80),
    voz: e.voz.trim() || g.frase,
    duracion: segundos,
    duracionClip: 8,
    cortes: cortesDeApertura(segundos),
    promptImagen: `${rellenar(g.promptImagen, producto, d.dolor)}\n${fiel}\nVertical ${d.relacion || "9:16"}, fotografía realista y cinematográfica, alto contraste. Sin texto, sin subtítulos y sin logotipos añadidos.`,
    promptVideo: `APERTURA EN CUATRO MOMENTOS dentro del mismo clip de 8 s (luego se usan solo esos tramos, pegados; cada momento empieza con un cambio claro de encuadre o de acción, sin tiempos muertos): ${rellenar(g.promptClip, producto, d.dolor)} El producto no cambia de forma, tamaño ni color. Recreación propia: sin marcas, personas ni material de terceros.`,
    imagen: { ...piezaNueva(), intentos: e.imagen.intentos },
    clip: { ...piezaNueva(), intentos: e.clip.intentos },
  };
}
