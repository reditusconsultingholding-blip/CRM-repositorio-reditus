import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Endpoint público y liviano para monitoreo externo (ej. UptimeRobot,
// Better Stack) — confirma que la app responde Y que Supabase está
// disponible. No requiere sesión, así un servicio externo puede pegarle
// cada pocos minutos sin login.
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const start = Date.now();
    const { error } = await supabase.from("users").select("id", { count: "exact", head: true }).limit(1);
    if (error) {
      return NextResponse.json({ ok: false, db: false, error: error.message }, { status: 503 });
    }
    return NextResponse.json({
      ok: true,
      db: true,
      dbMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      // Presencia de cada variable de entorno — no valida que la
      // credencial sea correcta, solo que la herramienta está conectada.
      sentry: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
      whatsapp: !!process.env.WHATSAPP_ACCESS_TOKEN,
      push: !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
      asistenteCeo: !!process.env.ANTHROPIC_API_KEY,
      vozElevenlabs: !!process.env.ELEVENLABS_API_KEY && !!process.env.ELEVENLABS_VOICE_ID,
      calendly: !!process.env.CALENDLY_API_TOKEN,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "unknown" },
      { status: 503 },
    );
  }
}
