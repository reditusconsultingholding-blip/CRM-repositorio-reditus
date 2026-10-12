// Biblioteca de formatos de video de Reditus, tal como la consume el CRM.
//
// `formatos.json` es una COPIA GENERADA: no se edita a mano. La fuente es el
// repositorio `reditus-video-formatos` (un .md por formato). Para traer los
// cambios:
//
//   node scripts/sincronizar-video-formatos.mjs
//
// (valida los formatos, regenera el índice allá y lo copia aquí).
//
// Este módulo pesa (trae el texto completo de cada formato): impórtalo solo
// desde el servidor. Los componentes de cliente usan `import type` y reciben
// por props lo que necesitan.
import datos from "./formatos.json";

export type EstadoFormato = "confirmado" | "por confirmar";

export type EscenaFormato = { tiempo: string; escena: string; que_pasa: string; fuente: string };
export type PromptEscena = { escena: string; prompt: string };

export type FormatoVideo = {
  slug: string;
  nombre: string;
  estado: EstadoFormato;
  confianza: string;
  para_que_sirve: string;
  duracion: string;
  relacion_aspecto: string;
  etapa_embudo: string;
  necesita: string[];
  riesgos: string[];
  fuentes: string[];
  que_es: string;
  cuando_si: string[];
  cuando_no: string[];
  estructura: EscenaFormato[];
  reglas_visuales: string[];
  plantilla: string;
  prompts: PromptEscena[];
};

/** Lo que viaja a la pantalla: todo menos los textos largos que solo usa la IA (qué es, reglas visuales, fuentes). */
export type FormatoTarjeta = Pick<
  FormatoVideo,
  | "slug"
  | "nombre"
  | "estado"
  | "confianza"
  | "para_que_sirve"
  | "duracion"
  | "relacion_aspecto"
  | "etapa_embudo"
  | "necesita"
  | "riesgos"
  | "cuando_si"
  | "cuando_no"
  | "estructura"
  | "plantilla"
  | "prompts"
>;

export const FORMATOS_VERSION: string = datos.version;
export const REGLAS_COMUNES: string = datos.reglas_comunes;
export const FORMATOS: FormatoVideo[] = datos.formatos as FormatoVideo[];

export function buscarFormato(slug: string): FormatoVideo | null {
  return FORMATOS.find((f) => f.slug === slug) ?? null;
}

export function tarjetas(): FormatoTarjeta[] {
  return FORMATOS.map((f) => ({
    slug: f.slug,
    nombre: f.nombre,
    estado: f.estado,
    confianza: f.confianza,
    para_que_sirve: f.para_que_sirve,
    duracion: f.duracion,
    relacion_aspecto: f.relacion_aspecto,
    etapa_embudo: f.etapa_embudo,
    necesita: f.necesita,
    riesgos: f.riesgos,
    cuando_si: f.cuando_si,
    cuando_no: f.cuando_no,
    estructura: f.estructura,
    plantilla: f.plantilla,
    prompts: f.prompts,
  }));
}
