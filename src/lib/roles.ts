// Pure role constants/types — safe to import from client components.
// Anything that touches next/headers or the Supabase server client belongs
// in lib/auth.ts instead, to keep that code out of the client bundle.

export type UserRole =
  | "ceo"
  | "gerente_comercial"
  | "directora_operativa"
  | "editor_video"
  | "disenador_landing"
  | "programador";

export const ROLE_LABELS: Record<UserRole, string> = {
  ceo: "CEO",
  gerente_comercial: "Gerente Comercial",
  directora_operativa: "Directora Operativa",
  editor_video: "Editor de Video",
  disenador_landing: "Diseñador de Landing",
  programador: "Programador",
};

export const INGRESOS_ROLES: UserRole[] = ["ceo", "gerente_comercial", "directora_operativa"];
export const ADMIN_ROLES: UserRole[] = ["ceo"];
// Pulso muestra ventas y conversión de los clientes: mismo criterio que Ingresos.
export const PULSO_ROLES: UserRole[] = INGRESOS_ROLES;
// «Crear video» (/videos): los roles de Ingresos y quien edita video.
export const VIDEOS_ROLES: UserRole[] = [...INGRESOS_ROLES, "editor_video"];
