import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Ping diario a Supabase para que el proyecto free-tier nunca llegue a los
// 7 días de inactividad que disparan el auto-pause. Vercel Cron llama esta
// ruta una vez al día (ver vercel.json). Si CRON_SECRET está configurado en
// el proyecto (Vercel lo agrega solo cuando usas Cron Jobs), verificamos el
// header Authorization que Vercel envía automáticamente.
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

  const { error } = await supabase.from("users").select("id").limit(1);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
