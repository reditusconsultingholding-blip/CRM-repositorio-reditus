import { Badge } from "@/components/ui/badge";
import {
  INGRESO_ESTADO_COLORS,
  REQUERIMIENTO_ESTADO_COLORS,
  type IngresoEstado,
  type RequerimientoEstado,
} from "@/lib/statuses";

export function IngresoEstadoBadge({ estado }: { estado: IngresoEstado }) {
  return (
    <Badge className={INGRESO_ESTADO_COLORS[estado]} variant="secondary">
      {estado}
    </Badge>
  );
}

export function RequerimientoEstadoBadge({ estado }: { estado: RequerimientoEstado }) {
  return (
    <Badge className={REQUERIMIENTO_ESTADO_COLORS[estado]} variant="secondary">
      {estado}
    </Badge>
  );
}
