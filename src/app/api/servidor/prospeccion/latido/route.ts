import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { atender } from "@/lib/servidor-api";
import { relojDe } from "@/lib/prospeccion-correo-server";
import { recibirLatido } from "@/lib/prospeccion-auto-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Con `tareas: true` prepara entregas (puede llamar a la IA para redactar).
export const maxDuration = 300;

// Prospección automática — API del trabajador. Misma autenticación que el
// resto de `/api/servidor` (Bearer SERVIDOR_SECRET). Todas son POST con JSON.
//
//   POST …/latido   { trabajador, version, modo, busqueda, cuentas: { video: { ok, detalle } },
//                     reportesPendientes, ultimoError, tareas? }
//     200 { ok, pausa, busqueda: { activa, cadaHoras }, envio: { activo, nuevosPorDia }, hoja: { activa }, hecho }
//          Cada minuto. Con `tareas: true` (cada 5 min) el CRM prepara las entregas de los
//          videos ya aprobados por una persona y agenda videos si esa pregunta está apagada.
//
//   POST …/busqueda/permiso     {}
//     200 { ok, permitido: false, motivo, proxima } | { ok, permitido: true, corrida: { id, pais, nombrePais,
//           palabras[], anunciosMax, porPalabra, soloShopify } }
//          El CRM lleva el reloj (cada N horas) y el tope de costo por corrida y por día.
//   POST …/busqueda/dominios    { dominios[] }           → 200 { ok, nuevos[] }   (los que el CRM no conoce)
//   POST …/busqueda/resultado   { corridaId, fuente, anuncios, usd?, nota?, hallazgos[], vistos[{ dominio, motivo }] }
//     200 { ok, agregados, descartados, motivos, usd }   califica, quita repetidos y encola.
//
//   POST …/hoja                 {}                       → 200 { ok, ...resultado de la sincronización }
//
//   Los correos siguen saliendo por `pendientes-envio` y `campanas/siguientes`; cada envío trae
//   ahora `bajaUrl` (para las cabeceras List-Unsubscribe) y puede ser `tipo: "respuesta"`.
export async function POST(request: NextRequest) {
  return atender(request, async (cuerpo) => NextResponse.json(await recibirLatido(createAdminClient(), cuerpo, relojDe(cuerpo))));
}
