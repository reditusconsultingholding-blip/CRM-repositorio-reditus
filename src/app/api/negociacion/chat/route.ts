import { NextResponse, type NextRequest } from "next/server";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { abrirTurno } from "@/lib/negociacion-server";
import type { Mensaje } from "@/lib/negociacion";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_TEXTO = 2000;
const MAX_MENSAJES = 120;

/** Un turno del juego de rol de /maestria. Recibe `{ sesionId, texto? }` y
 * devuelve la respuesta de la IA como texto plano que va llegando a medida
 * que se escribe. Sin `texto` pide el mensaje que abre la escena. La
 * conversación se guarda solo cuando la respuesta termina bien: si algo falla
 * a mitad, el turno no cuenta y se puede repetir. */
export async function POST(request: NextRequest) {
  const profile = await requireProfile();
  if (profile.role !== "ceo") return NextResponse.json({ error: "No autorizado." }, { status: 403 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "La IA no está activada: falta ANTHROPIC_API_KEY en las variables de entorno." }, { status: 501 });
  }

  const body = await request.json().catch(() => null);
  const sesionId = typeof body?.sesionId === "string" ? body.sesionId : "";
  const texto = typeof body?.texto === "string" ? body.texto.trim().slice(0, MAX_TEXTO) : "";
  if (!sesionId) return NextResponse.json({ error: "Falta la sesión." }, { status: 400 });

  const supabase = await createClient();
  const { data: sesion } = await supabase
    .from("negociacion_sesiones")
    .select("id, contexto, mensajes, nota")
    .eq("id", sesionId)
    .eq("user_id", profile.id)
    .single();
  if (!sesion) return NextResponse.json({ error: "No se encontró la sesión." }, { status: 404 });
  if (sesion.nota != null) return NextResponse.json({ error: "Esta sesión ya fue calificada." }, { status: 409 });

  const previos = (sesion.mensajes ?? []) as Mensaje[];
  if (!texto && previos.length > 0) return NextResponse.json({ error: "Escribe tu mensaje." }, { status: 400 });
  if (previos.length >= MAX_MENSAJES) {
    return NextResponse.json({ error: "Esta sesión ya es muy larga. Termínala y califícala." }, { status: 409 });
  }
  const mensajes: Mensaje[] = texto ? [...previos, { role: "user", content: texto }] : previos;

  const upstream = await abrirTurno(apiKey, sesion, mensajes).catch(() => null);
  if (!upstream?.ok || !upstream.body) {
    const detalle = upstream ? await upstream.text().catch(() => "") : "sin conexión";
    return NextResponse.json({ error: `La IA no respondió (${upstream?.status ?? "red"}). ${detalle.slice(0, 160)}`.trim() }, { status: 502 });
  }

  const lector = upstream.body.getReader();
  const decodificador = new TextDecoder();
  const codificador = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let pendiente = "";
      let respuesta = "";
      let fallo = false;
      try {
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          pendiente += decodificador.decode(value, { stream: true });
          const lineas = pendiente.split("\n");
          pendiente = lineas.pop() ?? "";
          for (const linea of lineas) {
            if (!linea.startsWith("data:")) continue;
            let evento;
            try {
              evento = JSON.parse(linea.slice(5));
            } catch {
              continue;
            }
            if (evento.type === "content_block_delta" && evento.delta?.type === "text_delta") {
              respuesta += evento.delta.text;
              controller.enqueue(codificador.encode(evento.delta.text));
            } else if (evento.type === "error" || (evento.type === "message_delta" && evento.delta?.stop_reason === "refusal")) {
              fallo = true;
            }
          }
        }
      } catch {
        fallo = true;
      }

      if (fallo || !respuesta.trim()) {
        controller.error(new Error("La respuesta se cortó."));
        return;
      }
      await supabase
        .from("negociacion_sesiones")
        .update({ mensajes: [...mensajes, { role: "assistant", content: respuesta.trim() }] })
        .eq("id", sesionId)
        .eq("user_id", profile.id);
      controller.close();
    },
    cancel() {
      lector.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
