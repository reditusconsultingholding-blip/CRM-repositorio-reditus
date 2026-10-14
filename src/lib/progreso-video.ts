// Barra de progreso de un video — funciones puras (seguro para componentes de cliente).
//
// Etapas: página y fotos → investigación → guion → plan → imágenes n/N → clips n/N →
// armado → listo. El porcentaje y el tiempo restante se calculan con lo que tarda
// cada cosa: los tiempos REALES medidos en trabajos anteriores cuando existen, y
// valores por defecto si todavía no hay historia.
import { estimado, hayTrabajoEnCurso, type ProyectoVideo } from "@/lib/proyecto-video";
import type { EtapaVideoProspecto } from "@/lib/videos-prospecto";

/** Segundos que tarda cada cosa. `medidos`: salieron de trabajos reales (si no, son los valores por defecto). */
export type TiemposVideo = {
  pagina: number;
  investigacion: number;
  guion: number;
  plan: number;
  imagen: number;
  clip: number;
  armado: number;
  medidos: boolean;
  /** Créditos que cuesta una imagen y un clip (promedio de los trabajos terminados; si no hay, lo medido en el primer video real). */
  creditosImagen: number;
  creditosClip: number;
};

export const TIEMPOS_BASE: TiemposVideo = { pagina: 45, investigacion: 90, guion: 70, plan: 50, imagen: 50, clip: 170, armado: 100, medidos: false, creditosImagen: 6, creditosClip: 60 };

/** Lo que vale un crédito del proveedor de video (462 créditos ≈ 2,31 USD). */
export const USD_POR_CREDITO = 0.005;
const usd = (creditos: number) => (creditos * USD_POR_CREDITO).toLocaleString("es-CO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const miles = (n: number) => Math.round(n).toLocaleString("es-CO");

/**
 * El costo de un video, dicho en claro: lo que ya costó cuando está armado
 * («Este video costó 462 créditos ≈ 2,31 USD») o lo gastado y lo que falta por gastar mientras se produce.
 */
export function costoDeVideo(p: ProyectoVideo, t: TiemposVideo = TIEMPOS_BASE): string {
  const f = p.final.estado;
  const gastado = p.costo.creditos;
  if (f === "por-aprobar" || f === "aprobada") return gastado ? `Este video costó ${miles(gastado)} créditos ≈ ${usd(gastado)} USD.` : "";
  const e = estimado(p);
  const falta = e.imagenes * t.creditosImagen + e.clips * t.creditosClip;
  if (!falta && !gastado) return "";
  const partes = [gastado ? `Gastado: ${miles(gastado)} créditos (≈ ${usd(gastado)} USD)` : "", falta ? `falta por gastar ≈ ${miles(falta)} créditos (≈ ${usd(falta)} USD): ${e.imagenes} ${e.imagenes === 1 ? "imagen" : "imágenes"} a ~${miles(t.creditosImagen)} y ${e.clips} ${e.clips === 1 ? "clip" : "clips"} a ~${miles(t.creditosClip)}` : ""].filter(Boolean);
  const texto = partes.join(" · ");
  return texto.charAt(0).toUpperCase() + texto.slice(1) + ".";
}

export type EstadoEtapa = "hecha" | "en-curso" | "pendiente" | "detenida";
export type EtapaProgreso = { clave: string; nombre: string; estado: EstadoEtapa; detalle: string };
export type Progreso = {
  etapas: EtapaProgreso[];
  /** 0 a 100. */
  pct: number;
  /** Segundos que faltan, o null si no se puede decir (está detenido esperando a una persona). */
  restanteSeg: number | null;
  /** Ya hay video armado (por aprobar o aprobado). */
  listo: boolean;
  /** Por qué no avanza, si espera a una persona. */
  espera: string;
};

const PREVIAS: { clave: keyof Pick<TiemposVideo, "pagina" | "investigacion" | "guion" | "plan">; nombre: string }[] = [
  { clave: "pagina", nombre: "Página y fotos" },
  { clave: "investigacion", nombre: "Investigación" },
  { clave: "guion", nombre: "Guion" },
  { clave: "plan", nombre: "Plan" },
];

/**
 * El progreso de un video. `previa` es la etapa del video de un prospecto mientras
 * todavía no hay proyecto (página, investigación…); con proyecto, esas cuatro ya están hechas.
 */
export function progresoDeVideo(p: ProyectoVideo | null, t: TiemposVideo = TIEMPOS_BASE, previa?: { etapa: EtapaVideoProspecto; retomarEn: string; detalle: string }): Progreso {
  const etapas: EtapaProgreso[] = [];
  let hecho = 0;
  let total = 0;
  let espera = "";

  // ---- antes del proyecto
  const iPrevia = p ? PREVIAS.length : !previa ? 0 : previa.etapa === "pagina" ? 1 : previa.etapa === "investigacion" ? 2 : previa.etapa === "lanzado" ? PREVIAS.length : previa.etapa === "detenido" ? (previa.retomarEn === "pagina" ? 1 : previa.retomarEn === "investigacion" ? 2 : 0) : 0;
  const detenidaAntes = !p && previa?.etapa === "detenido";
  const sinEmpezar = !p && (!previa || previa.etapa === "sin-decidir" || previa.etapa === "no");
  PREVIAS.forEach((x, i) => {
    total += t[x.clave];
    // Guion y plan se hacen en la misma etapa del prospecto: los dos quedan «en curso» a la vez.
    const enCurso = !sinEmpezar && !detenidaAntes && (i === iPrevia || (iPrevia === 2 && i === 3));
    const estado: EstadoEtapa = i < iPrevia ? "hecha" : detenidaAntes && i === iPrevia ? "detenida" : enCurso ? "en-curso" : "pendiente";
    if (estado === "hecha") hecho += t[x.clave];
    else if (estado === "en-curso") hecho += t[x.clave] * 0.4;
    etapas.push({ clave: x.clave, nombre: x.nombre, estado, detalle: "" });
  });
  if (detenidaAntes) espera = previa?.detalle ?? "";

  // ---- el proyecto
  const generadas = p ? p.escenas.filter((e) => e.tipo === "generada") : [];
  const n = p ? generadas.length : 4; // sin plan todavía, se supone un video típico
  const lista = (estado: string) => estado === "aprobada" || estado === "por-aprobar";
  const img = generadas.filter((e) => lista(e.imagen.estado)).length;
  const clips = generadas.filter((e) => lista(e.clip.estado) && e.clip.url).length;
  const imgEnCurso = generadas.some((e) => e.imagen.estado === "en-cola" || e.imagen.estado === "generando");
  const clipEnCurso = generadas.some((e) => e.clip.estado === "en-cola" || e.clip.estado === "generando");
  const final = p?.final.estado ?? "pendiente";
  const listo = final === "por-aprobar" || final === "aprobada";
  const armando = final === "en-cola" || final === "generando";
  const parada = p?.auto.parada ?? null;
  const porRevisar = generadas.filter((e) => e.imagen.estado === "por-aprobar").length;
  if (p && !listo && !hayTrabajoEnCurso(p)) {
    if (parada) espera = parada.texto;
    else if (!p.auto.activo) espera = "El modo automático está apagado: avanza cuando alguien pida la etapa siguiente.";
    else if (porRevisar) espera = `${porRevisar} ${porRevisar === 1 ? "imagen espera" : "imágenes esperan"} revisión.`;
  }
  const detenidaEn = espera && p ? (img < n ? "imagenes" : clips < n ? "clips" : "armado") : "";
  const etapa = (clave: string, nombre: string, hechas: number, de: number, enCurso: boolean, cada: number, sufijo: string) => {
    total += de * cada;
    hecho += hechas * cada + (enCurso && hechas < de ? cada * 0.3 : 0);
    const estado: EstadoEtapa = listo || (de > 0 && hechas >= de) || (p && de === 0) ? "hecha" : detenidaEn === clave ? "detenida" : enCurso ? "en-curso" : "pendiente";
    etapas.push({ clave, nombre: de ? `${nombre} ${Math.min(hechas, de)}/${de}` : nombre, estado, detalle: sufijo });
  };
  etapa("imagenes", "Imágenes", listo ? n : img, n, imgEnCurso, t.imagen, "");
  etapa("clips", "Clips", listo ? n : clips, n, clipEnCurso, t.clip, "");
  total += t.armado;
  if (listo) hecho += t.armado;
  else if (armando) hecho += t.armado * 0.3;
  etapas.push({ clave: "armado", nombre: "Armado", estado: listo ? "hecha" : detenidaEn === "armado" ? "detenida" : armando ? "en-curso" : "pendiente", detalle: "" });
  etapas.push({ clave: "listo", nombre: final === "aprobada" ? "Aprobado" : "Listo para aprobar", estado: listo ? "hecha" : "pendiente", detalle: "" });

  const pct = listo ? 100 : Math.max(sinEmpezar ? 0 : 2, Math.min(99, Math.round((hecho / Math.max(1, total)) * 100)));
  return { etapas, pct, restanteSeg: listo ? 0 : espera || sinEmpezar ? null : Math.max(20, Math.round(total - hecho)), listo, espera };
}

/** «≈ 6 min», «menos de 1 min». */
export function tiempoRestante(seg: number | null): string {
  if (seg === null) return "";
  if (seg <= 0) return "listo";
  if (seg < 60) return "menos de 1 min";
  const min = Math.round(seg / 60);
  return min >= 60 ? `≈ ${Math.floor(min / 60)} h ${min % 60} min` : `≈ ${min} min`;
}

/** Un proyecto que todavía se está produciendo (para listarlo con su barra). */
export function enProduccion(p: ProyectoVideo): boolean {
  const f = p.final.estado;
  if (f === "por-aprobar" || f === "aprobada") return false;
  return hayTrabajoEnCurso(p) || p.auto.activo || p.escenas.some((e) => e.tipo === "generada" && e.imagen.intentos > 0);
}
