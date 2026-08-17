"use server";

import { requireProfile } from "@/lib/auth";
import { currentTotpCode, secondsUntilNextCode } from "@/lib/totp";

/** Código vigente para borrar ingresos — solo el CEO puede verlo. */
export async function getIngresosDeleteCode(): Promise<{ code: string | null; secondsLeft: number }> {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return { code: null, secondsLeft: 30 };
  return { code: currentTotpCode(), secondsLeft: secondsUntilNextCode() };
}
