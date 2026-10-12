import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { AsistenteEntregaPanel } from "./panel";

/** Botón «Asistente de entrega». Solo lo ven CEO, Gerente Comercial y
 * Directora Operativa; para el resto no pinta nada. */
export async function AsistenteEntrega({ className }: { className?: string }) {
  const profile = await requireProfile();
  if (!(INGRESOS_ROLES as string[]).includes(profile.role)) return null;
  return <AsistenteEntregaPanel className={className} />;
}
