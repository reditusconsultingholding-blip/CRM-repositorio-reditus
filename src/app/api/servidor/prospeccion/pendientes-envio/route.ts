import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { pendientesEnvio, relojDe } from "@/lib/prospeccion-correo-server";
import { respuestasAprobadas } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// API del trabajador de prospección por correo (`/api/servidor/prospeccion/**`).
//
// Misma autenticación que el resto de `/api/servidor`: cabecera
// `Authorization: Bearer <SERVIDOR_SECRET>`; sin la variable, 503. Todas son
// POST con cuerpo JSON. El CRM decide qué puede salir (aprobación, tope del
// día con calentamiento, horario del país, exclusiones, bajas, rebotes, un
// solo correo por dirección al día); el trabajador entrega de uno en uno.
//
//   POST …/pendientes-envio      { linea?: "video"|"landing", max?: 1..5 }
//   POST …/campanas/siguientes   { linea?, max? }
//     200 { ok, envios: [{ id, tipo: "prospecto"|"campana", paso: "entrega"|"seguimiento_1..3"|"inicial",
//             linea, para, asunto, cuerpo, enRespuestaA, referencias[], pais }],
//           cuentas: [{ linea, tope, semana, usados, restantes }], motivo? }
//          Cada envío entregado queda reservado: NO se vuelve a entregar hasta
//          que llegue su reporte en …/enviado.
//
//   POST …/enviado   { id, resultado: "ok"|"fallo"|"incierto", messageId?, fecha?, asunto?, cuerpo?, error? }
//     200 { ok, estado, siguiente? }   "ok" registra el envío (y programa el siguiente seguimiento);
//          "fallo" lo devuelve a la cola (3 intentos); "incierto" lo deja sin confirmar para una persona.
//
//   POST …/respuesta { linea, de, asunto, texto, messageId, enRespuestaA?, referencias?[], fecha?, automatica? }
//     200 { ok, coincidencia: "prospecto"|"lead"|"ninguna", clasificacion?, prospectoId?, creado?, duplicado?, aviso? }
//
//   POST …/rebote    { destinatario?, messageIdOriginal?, referencias?[], diagnostico?, permanente?, messageId?, fecha? }
//     200 { ok, coincidencia, suprimido }
//
//   POST …/baja      { correo, motivo? }
//     200 { ok, coincidencia }
//
//   Errores: 400 { error } · 401 secreto incorrecto · 404 no existe · 409 ya no está en curso ·
//   500 fallo del almacenamiento (se puede reintentar) · 503 falta SERVIDOR_SECRET.
//   Solo en `next dev`: el campo `ahora` (ISO) del cuerpo dicta la hora, para pruebas.

// Correos a prospectos: respuestas aprobadas, entrega aprobada y seguimientos que tocan hoy. Contrato en `pendientes-envio/route.ts`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => {
    const admin = createAdminClient();
    // Primero, las respuestas que una persona ya aprobó: alguien las está esperando.
    const aprobadas = await respuestasAprobadas(admin, cuerpo, relojDe(cuerpo));
    if (aprobadas.envios.length || aprobadas.motivo) return NextResponse.json({ ok: true, ...aprobadas });
    const r = await pendientesEnvio(admin, cuerpo, relojDe(cuerpo));
    return NextResponse.json({ ok: true, ...r });
  });
}
