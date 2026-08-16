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

export const INGRESOS_ROLES: UserRole[] = ["ceo", "gerente_comercial"];
export const ADMIN_ROLES: UserRole[] = ["ceo"];
