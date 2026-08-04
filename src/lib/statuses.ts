// Status catalogs and colors reconciled from Reditus's existing spreadsheet
// dropdowns. Keep these in sync with the `ingreso_estado` / `requerimiento_estado`
// Postgres enums in supabase/migrations/0001_init.sql.

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

export const REQUERIMIENTO_ESTADOS = [
  "Nuevo pedido",
  "En tabla",
  "Asignado",
  "En progreso",
  "Por revisión",
  "Corregir",
  "Por subir",
  "Terminado",
  "ENTREGADO",
  "Sin nada",
  "POR CONFIRMAR",
  "ESPERA INFO",
] as const;

export type RequerimientoEstado = (typeof REQUERIMIENTO_ESTADOS)[number];

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
  "En tabla": "bg-orange-200 text-orange-950",
  Asignado: "bg-amber-800 text-white",
  "En progreso": "bg-orange-400 text-orange-950",
  "Por revisión": "bg-indigo-200 text-indigo-950",
  Corregir: "bg-red-500 text-white",
  "Por subir": "bg-purple-500 text-white",
  Terminado: "bg-cyan-300 text-cyan-950",
  ENTREGADO: "bg-blue-900 text-white",
  "Sin nada": "bg-neutral-200 text-neutral-700",
  "POR CONFIRMAR": "bg-purple-200 text-purple-900",
  "ESPERA INFO": "bg-neutral-800 text-white",
};

export const PIPELINES = [
  { value: "video", label: "Videos Creativos" },
  { value: "landing", label: "Landing Pages" },
] as const;

export type Pipeline = (typeof PIPELINES)[number]["value"];
