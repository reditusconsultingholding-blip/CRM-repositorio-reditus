import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import type { RespuestaServidor } from "@/lib/trabajos-video-server";

// API del servidor externo de Reditus (`/api/servidor/**`).
//
// Quien llama es un proceso, no una persona: no hay sesión. Se autentica con
// el secreto de entorno SERVIDOR_SECRET en la cabecera
//
//   Authorization: Bearer <SERVIDOR_SECRET>
//
// La ruta está en PUBLIC_PATHS del middleware justamente por eso. Sin la
// variable configurada todo responde 503: la cola no se entrega a nadie.
//
// Contrato (todas son POST con cuerpo JSON y responden JSON):
//
//   POST /api/servidor/trabajos/tomar
//        { "trabajador": "nombre-del-equipo" }
//     200 { ok: true, trabajo: null }                 no hay nada pendiente
//     200 { ok: true, trabajo: { id, toma, guionId, version, formato, relacionAspecto,
//            duracionObjetivo, escenas[{ n, nombre, prompt, duracion, usaImagenProducto, voz }],
//            imagenesProducto[], opciones{ subtitulos, voz, modelo }, pedidoPor{ id, nombre },
//            intentos, maxIntentos, … } }
//          El trabajo queda `tomado` y bloqueado para los demás. `toma` es la
//          clave de esta toma: va en el cuerpo de TODOS los reportes siguientes.
//          Si el trabajador pasa 10 minutos sin reportar, el trabajo vuelve a
//          la cola (o queda en `fallo` si ya lleva 3 intentos).
//
//   POST /api/servidor/trabajos/<id>/progreso
//        { toma, estado: "generando" | "montando",
//          progreso?: { hecho, total, detalle }, segundosGenerados?, costoEstimadoUsd? }
//     200 { ok: true, estado }                        sirve además de latido
//
//   POST /api/servidor/trabajos/<id>/resultado
//     paso 1  { toma, pedirSubida: true }
//     200 { ok: true, subida: { url, metodo: "PUT", cabeceras, bucket, ruta } }
//          El trabajador hace PUT del MP4 a `url` con esas cabeceras.
//     paso 2  { toma, ruta, duracion?, segundosGenerados?, costoEstimadoUsd?,
//               proveedor?, modelos?[], sinVoz?, avisos?[] }
//             (o `videoUrl` https en vez de `ruta`, si ya lo subió a otra parte)
//     200 { ok: true, estado: "listo", videoUrl, guionId, version }
//          Liga el video a esa versión del guion (queda «Por aprobar») y avisa
//          a quien lo pidió.
//
//   POST /api/servidor/trabajos/<id>/fallo
//        { toma, motivo, definitivo?: boolean, segundosGenerados?, costoEstimadoUsd? }
//     200 { ok: true, estado: "pendiente" | "fallo", intentos, maxIntentos, reintentaDesde }
//          Vuelve a la cola con espera creciente; al tercer intento (o con
//          `definitivo`) queda en `fallo` y se avisa a quien lo pidió.
//
//   Errores: 400 { error } cuerpo inválido · 401 { error } secreto incorrecto ·
//   409 { error, soltar: true } el trabajo ya no es de ese trabajador (debe
//   abandonarlo) · 500 { error } fallo del almacenamiento (se puede reintentar) ·
//   503 { error } SERVIDOR_SECRET no está configurado.

function mismoSecreto(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Devuelve la respuesta de rechazo, o null si quien llama trae el secreto. */
export function rechazoServidor(request: NextRequest): NextResponse | null {
  const secreto = process.env.SERVIDOR_SECRET?.trim();
  if (!secreto) {
    return NextResponse.json({ error: "El servidor de videos no está activado: falta SERVIDOR_SECRET." }, { status: 503 });
  }
  const cabecera = request.headers.get("authorization") ?? "";
  const recibido = cabecera.startsWith("Bearer ") ? cabecera.slice(7).trim() : "";
  if (!recibido || !mismoSecreto(recibido, secreto)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  return null;
}

/** El cuerpo como objeto; `{}` si viene vacío o no es JSON. */
export async function cuerpoJson(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const dato: unknown = await request.json();
    return dato && typeof dato === "object" && !Array.isArray(dato) ? (dato as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function responder<T extends object>(r: RespuestaServidor<T>): NextResponse {
  if (!r.ok) return NextResponse.json({ error: r.error, ...(r.soltar ? { soltar: true } : {}) }, { status: r.estado });
  return NextResponse.json({ ok: true, ...r.dato });
}

/** Envuelve una ruta: autentica, lee el cuerpo y nunca deja escapar una excepción. */
export async function atender(
  request: NextRequest,
  fn: (cuerpo: Record<string, unknown>) => Promise<NextResponse>,
): Promise<NextResponse> {
  const rechazo = rechazoServidor(request);
  if (rechazo) return rechazo;
  try {
    return await fn(await cuerpoJson(request));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error inesperado." }, { status: 500 });
  }
}
