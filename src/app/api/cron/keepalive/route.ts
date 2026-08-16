import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Tarea diaria única (Vercel Hobby solo permite cron una vez al día):
// 1) Ping a Supabase para que el proyecto free-tier nunca llegue a los 7
//    días de inactividad que disparan el auto-pause.
// 2) Día 1 del mes: recordatorio al CEO para pagar los costos fijos SaaS.
// 3) Lunes: aviso al CEO de que el checklist de nómina de la semana pasada
//    ya está listo para revisar en /ceo.
// Si CRON_SECRET está configurado (Vercel lo agrega solo con Cron Jobs),
// verificamos el header Authorization que Vercel envía automáticamente.
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "No autorizado." }, { status: 401 });
    }
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: users, error } = await supabase.from("users").select("id, role").eq("active", true);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const ceoIds = (users ?? []).filter((u) => u.role === "ceo").map((u) => u.id);
  const tasks: string[] = ["keepalive"];

  // Día 1 del mes: recordatorio de costos fijos SaaS (evita duplicados
  // revisando si ya se envió hoy).
  if (now.getUTCDate() === 1 && ceoIds.length) {
    const { data: yaEnviado } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "recordatorio_costos")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    if (!yaEnviado?.length) {
      for (const id of ceoIds) {
        await supabase.from("notifications").insert({
          user_id: id,
          type: "recordatorio_costos",
          title: "Recordatorio: pagar hoy los costos fijos SaaS (ElevenLabs + Google Storage)",
          link: "/ceo",
        });
      }
      tasks.push("recordatorio_costos");
    }
  }

  // Lunes: avisar que el checklist de nómina de la semana pasada está listo.
  if (now.getUTCDay() === 1 && ceoIds.length) {
    const { data: yaEnviado } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "nomina_lista")
      .gte("created_at", `${today}T00:00:00Z`)
      .limit(1);

    if (!yaEnviado?.length) {
      for (const id of ceoIds) {
        await supabase.from("notifications").insert({
          user_id: id,
          type: "nomina_lista",
          title: "El checklist de nómina de la semana pasada ya está listo para revisar",
          link: "/ceo",
        });
      }
      tasks.push("nomina_lista");
    }
  }

  return NextResponse.json({ ok: true, pingedAt: now.toISOString(), tasks });
}
