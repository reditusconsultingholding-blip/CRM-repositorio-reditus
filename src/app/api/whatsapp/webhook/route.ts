import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runSalesAgentTurn } from "@/lib/whatsapp-agent";
import { sendWhatsAppMessage } from "@/lib/whatsapp-send";
import { notify } from "@/lib/notify";

export const runtime = "nodejs";

// Webhook de la WhatsApp Cloud API (Meta) para la línea de ventas. No hace
// nada útil hasta que existan las variables de entorno WHATSAPP_*
// (Meta Business Manager, gestionado por Sebastian) — hasta entonces solo
// responde 200 sin procesar nada, para no romper si Meta llega a llamarlo
// antes de tiempo.

// 1) Verificación del webhook: Meta llama GET una sola vez al conectar,
// comparando el token que tú eliges (WHATSAPP_VERIFY_TOKEN) con el que le
// diste a Meta al configurar el webhook.
export async function GET(request: NextRequest) {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (verifyToken && mode === "subscribe" && token === verifyToken) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Token de verificación inválido." }, { status: 403 });
}

// 2) Mensajes entrantes: Meta hace POST cada vez que alguien escribe.
export async function POST(request: NextRequest) {
  const salesPhoneNumberId = process.env.WHATSAPP_SALES_PHONE_NUMBER_ID;
  if (!salesPhoneNumberId) {
    // Credenciales no configuradas todavía — responder 200 igual (Meta
    // reintenta si no le devolvemos 200) pero sin procesar nada.
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  const body = await request.json().catch(() => null);
  const entry = body?.entry?.[0]?.changes?.[0]?.value;
  const message = entry?.messages?.[0];

  // No es un mensaje de texto entrante (puede ser un "status" de entrega,
  // reacción, etc.) — no hay nada que responder.
  if (!message || message.type !== "text") {
    return NextResponse.json({ ok: true, skipped: "not_a_text_message" });
  }

  // Solo la línea de ventas tiene agente de IA — la línea de clientes
  // actuales (soporte/recompra) todavía no tiene bandeja automatizada.
  if (entry?.metadata?.phone_number_id !== salesPhoneNumberId) {
    return NextResponse.json({ ok: true, skipped: "not_sales_line" });
  }

  const fromWhatsappNumber: string = message.from;
  const incomingText: string = message.text?.body ?? "";

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: existing } = await admin
    .from("prospectos")
    .select("id, historial_whatsapp, bot_activo")
    .eq("whatsapp_number", fromWhatsappNumber)
    .eq("origen", "whatsapp")
    .maybeSingle();

  const history = (existing?.historial_whatsapp as { role: "user" | "assistant"; content: string }[]) ?? [];
  const botActivo = existing?.bot_activo ?? true;

  // Si alguien apagó el bot en esta conversación (tomó el control manual),
  // igual guardamos el mensaje entrante para que se vea en el hilo, pero
  // no generamos ni mandamos respuesta automática.
  const result = botActivo
    ? await runSalesAgentTurn({ fromWhatsappNumber, incomingMessage: incomingText, history })
    : null;

  const newHistory = [
    ...history,
    { role: "user" as const, content: incomingText },
    ...(result ? [{ role: "assistant" as const, content: result.reply }] : []),
  ].slice(-40); // cap para no crecer sin límite

  if (existing) {
    await admin
      .from("prospectos")
      .update({
        historial_whatsapp: newHistory,
        ...(result ? { estado: result.prospectoEstado } : {}),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("prospectos").insert({
      nombre: `WhatsApp ${fromWhatsappNumber}`,
      whatsapp_number: fromWhatsappNumber,
      origen: "whatsapp",
      estado: result?.prospectoEstado ?? "calificando",
      historial_whatsapp: newHistory,
    });

    // Nuevo prospecto por primera vez — avisar al equipo comercial.
    const { data: comerciales } = await admin
      .from("users")
      .select("id")
      .in("role", ["ceo", "gerente_comercial"])
      .eq("active", true);
    for (const u of comerciales ?? []) {
      await notify(admin, u.id, "nuevo_pedido", `Nuevo prospecto por WhatsApp: ${fromWhatsappNumber}`, "/prospectos");
    }
  }

  if (result) {
    await sendWhatsAppMessage(fromWhatsappNumber, result.reply);
  }

  return NextResponse.json({ ok: true });
}
