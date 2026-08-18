// Status catalogs and colors reconciled from Reditus's existing spreadsheet
// dropdowns. Keep these in sync with the CHECK constraints in
// supabase/migrations (estado ya no es un enum de Postgres, es texto libre
// con constraint — más fácil de ajustar sin migraciones de enum).

export const INGRESO_ESTADOS = [
  "Nuevo pedido",
  "En progreso",
  "Terminado",
  "NADA",
  "ESPERANDO",
  "Por revisión",
  "Corregir",
  "CORREGIDO",
  "ENTREGADO",
  "ASIGNANDO",
  "NO APROBADO",
  "ESPERANDO INFO",
] as const;

export type IngresoEstado = (typeof INGRESO_ESTADOS)[number];

// Réplica exacta del dropdown "ESTADO" de la hoja de cálculo original.
export const REQUERIMIENTO_ESTADOS = [
  "Nuevo pedido",
  "En progreso",
  "Por revisión",
  "Corregir",
  "Terminado",
  "ENTREGADO",
  "NO LABORADO",
  "POR SUBIR",
  "ESPERA INFO",
  "CORREGIDO",
  "NO APROBADO",
  "SUBIDA",
] as const;

export type RequerimientoEstado = (typeof REQUERIMIENTO_ESTADOS)[number];

// Estados que cuentan como "ya está listo" — para Prueba Social, la
// encuesta de calidad, y filtros de "sigue activo" en otras pantallas.
export const REQUERIMIENTO_TERMINADOS: RequerimientoEstado[] = ["Terminado", "ENTREGADO", "SUBIDA"];

// Tailwind bg/text classes approximating the original spreadsheet colors.
export const INGRESO_ESTADO_COLORS: Record<IngresoEstado, string> = {
  "Nuevo pedido": "bg-yellow-300 text-yellow-950",
  "En progreso": "bg-orange-300 text-orange-950",
  Terminado: "bg-green-300 text-green-950",
  NADA: "bg-neutral-200 text-neutral-700",
  ESPERANDO: "bg-slate-800 text-white",
  "Por revisión": "bg-indigo-200 text-indigo-950",
  Corregir: "bg-red-500 text-white",
  CORREGIDO: "bg-emerald-200 text-emerald-950",
  ENTREGADO: "bg-cyan-300 text-cyan-950",
  ASIGNANDO: "bg-purple-400 text-purple-950",
  "NO APROBADO": "bg-red-800 text-white",
  "ESPERANDO INFO": "bg-neutral-800 text-white",
};

export const REQUERIMIENTO_ESTADO_COLORS: Record<RequerimientoEstado, string> = {
  "Nuevo pedido": "bg-yellow-300 text-yellow-950",
  "En progreso": "bg-orange-400 text-orange-950",
  "Por revisión": "bg-indigo-200 text-indigo-950",
  Corregir: "bg-red-500 text-white",
  Terminado: "bg-green-300 text-green-950",
  ENTREGADO: "bg-cyan-300 text-cyan-950",
  "NO LABORADO": "bg-neutral-300 text-neutral-700",
  "POR SUBIR": "bg-purple-500 text-white",
  "ESPERA INFO": "bg-neutral-800 text-white",
  CORREGIDO: "bg-emerald-300 text-emerald-950",
  "NO APROBADO": "bg-red-800 text-white",
  SUBIDA: "bg-blue-900 text-white",
};

export const PROSPECTO_ESTADOS = [
  "nuevo",
  "calificando",
  "agendado",
  "calificado",
  "descartado",
  "convertido",
] as const;
export type ProspectoEstado = (typeof PROSPECTO_ESTADOS)[number];
export const PROSPECTO_ESTADO_COLORS: Record<ProspectoEstado, string> = {
  nuevo: "bg-yellow-300 text-yellow-950",
  calificando: "bg-orange-300 text-orange-950",
  agendado: "bg-indigo-300 text-indigo-950",
  calificado: "bg-emerald-300 text-emerald-950",
  descartado: "bg-neutral-300 text-neutral-700",
  convertido: "bg-green-500 text-white",
};

// Prueba Social: se decide una vez el requerimiento está Terminado — si el
// contenido sirve como testimonio/prueba social para redes, y si ya se
// subió. Gerente Comercial lo gestiona.
export const PRUEBA_SOCIAL_ESTADOS = ["Pendiente", "Apto", "No apto", "Subido"] as const;
export type PruebaSocialEstado = (typeof PRUEBA_SOCIAL_ESTADOS)[number];
export const PRUEBA_SOCIAL_COLORS: Record<PruebaSocialEstado, string> = {
  Pendiente: "bg-neutral-200 text-neutral-700",
  Apto: "bg-emerald-200 text-emerald-950",
  "No apto": "bg-red-200 text-red-950",
  Subido: "bg-green-500 text-white",
};

// "Pagado" a nivel de requerimiento (además del pago a nivel de ingreso) —
// tal cual el dropdown original de 3 opciones.
export const REQUERIMIENTO_PAGADO_ESTADOS = ["Sí", "No", "Por terminar"] as const;
export type RequerimientoPagadoEstado = (typeof REQUERIMIENTO_PAGADO_ESTADOS)[number];
export const REQUERIMIENTO_PAGADO_COLORS: Record<RequerimientoPagadoEstado, string> = {
  Sí: "bg-green-500 text-white",
  No: "bg-red-500 text-white",
  "Por terminar": "bg-neutral-200 text-neutral-700",
};

export const ESTADOS_PAGO = ["Pendiente", "Pagado"] as const;
export type EstadoPago = (typeof ESTADOS_PAGO)[number];
export const ESTADO_PAGO_COLORS: Record<EstadoPago, string> = {
  Pendiente: "bg-amber-200 text-amber-950",
  Pagado: "bg-green-300 text-green-950",
};

// Etapas 2 (Cotización) y 3 (Cierre) del flujo comercial — separadas para
// poder distinguir un pedido que ya se confirmó (Cerrado, cuenta como
// ingreso real) de una cotización enviada que el cliente todavía no
// confirma (Cotizado, no cuenta en las sumas de ingresos/rentabilidad).
export const ESTADOS_COMERCIALES = ["Cotizado", "Cerrado"] as const;
export type EstadoComercial = (typeof ESTADOS_COMERCIALES)[number];
export const ESTADO_COMERCIAL_COLORS: Record<EstadoComercial, string> = {
  Cotizado: "bg-sky-200 text-sky-950",
  Cerrado: "bg-green-300 text-green-950",
};

export const PIPELINES = [
  { value: "video", label: "Videos Creativos" },
  { value: "landing", label: "Landing Pages" },
  { value: "claude", label: "Claude" },
] as const;

export type Pipeline = (typeof PIPELINES)[number]["value"];

// Servicios que se pueden elegir al crear un ingreso — un desplegable
// cerrado en vez de texto libre, así el sistema sabe con certeza qué
// requerimiento crear (antes se adivinaba por palabras clave del texto).
export const INGRESO_SERVICIOS = ["Videos IA", "Landing page", "Claude"] as const;
export type IngresoServicio = (typeof INGRESO_SERVICIOS)[number];

export const SERVICIO_TO_PIPELINE: Record<IngresoServicio, Pipeline> = {
  "Videos IA": "video",
  "Landing page": "landing",
  Claude: "claude",
};

// Secuencia "normal" de avance por pipeline, para el botón de "pasar a la
// siguiente fase". No incluye los estados de excepción (Corregir, NO
// LABORADO, ESPERA INFO, NO APROBADO) — esos se siguen eligiendo a mano
// desde el selector de estado.
export const PIPELINE_FLOW: Record<Pipeline, RequerimientoEstado[]> = {
  video: ["Nuevo pedido", "En progreso", "Por revisión", "Terminado", "ENTREGADO"],
  landing: ["Nuevo pedido", "En progreso", "Por revisión", "POR SUBIR", "Terminado", "ENTREGADO"],
  claude: ["Nuevo pedido", "En progreso", "Por revisión", "Terminado", "ENTREGADO"],
};

export function getNextEstado(
  pipeline: Pipeline,
  current: RequerimientoEstado,
): RequerimientoEstado | null {
  const flow = PIPELINE_FLOW[pipeline];
  const idx = flow.indexOf(current);
  if (idx === -1 || idx === flow.length - 1) return null;
  return flow[idx + 1];
}
