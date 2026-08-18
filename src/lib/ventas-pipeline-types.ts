// Tipos y constantes compartidos entre el lado servidor (ventas-pipeline.ts,
// que sí puede tocar la base de datos) y componentes cliente (el tablero) —
// separado del archivo "server-only" para que el bundle de cliente no
// intente arrastrar código de servidor solo por los tipos.
import type { ProspectoEstado } from "@/lib/statuses";

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type VentasPipelineStage =
  | "interesados"
  | "agendados"
  | "convertidos"
  | "pendientes"
  | "compraron"
  | "descartados";

export const STAGE_LABELS: Record<VentasPipelineStage, string> = {
  interesados: "Interesados",
  agendados: "Agendados",
  convertidos: "Convertidos a cliente",
  pendientes: "Con requerimientos pendientes",
  compraron: "Compraron",
  descartados: "Descartados",
};

export type VentasPipelineItem = {
  id: string;
  nombre: string;
  whatsappNumber: string | null;
  estado: ProspectoEstado;
  botActivo: boolean;
  historial: ChatMsg[];
  stage: VentasPipelineStage;
  clientId: string | null;
  updatedAt: string;
};
