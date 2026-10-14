"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { correoDeTokenBaja, registrarBaja } from "@/lib/prospeccion-correo-server";

/** La persona pulsó «Darme de baja». No lanza: devuelve si quedó hecho. */
export async function darDeBaja(token: string): Promise<{ ok: boolean }> {
  try {
    const admin = createAdminClient();
    const correo = await correoDeTokenBaja(admin, String(token ?? ""));
    if (!correo) return { ok: false };
    const r = await registrarBaja(admin, { correo, motivo: "Se dio de baja con el enlace del correo" }, new Date());
    return { ok: r.ok };
  } catch {
    return { ok: false };
  }
}
