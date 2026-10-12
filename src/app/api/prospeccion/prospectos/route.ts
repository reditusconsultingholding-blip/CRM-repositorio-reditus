import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { crearProspectoProspeccion, type EntradaProspecto } from "@/lib/prospeccion-server";

export const runtime = "nodejs";
// El guion se genera con IA dentro de la misma petición.
export const maxDuration = 60;

// Entrada para procesos externos (el bot que leerá las respuestas de los
// leads): crea un prospecto en el embudo de prospección, igual que el
// formulario manual — misma función del servidor, `crearProspectoProspeccion`.
//
//   POST /api/prospeccion/prospectos
//   Authorization: Bearer <PROSPECCION_SECRET>      (o cabecera x-prospeccion-secret)
//   Content-Type: application/json
//   {
//     "nombre":   "Marca o persona",                 obligatorio
//     "tienda":   "https://tienda.com",              obligatorio
//     "producto": "Producto de la muestra",          obligatorio
//     "servicio": "video" | "landing",               por defecto "video"
//     "canal":    "correo" | "instagram" | "whatsapp", por defecto "correo"
//     "contacto": "correo, @usuario o número",
//     "falencia": "lo que se detectó",
//     "respuesta": "texto exacto que respondió",
//     "pais": "Colombia", "ads_library": "https://…", "notas": "…",
//     "id_externo": "id del lead en el proceso",     evita duplicados al reintentar
//     "generar_guion": true                          false para no llamar a la IA
//   }
//
//   201 { ok, id, creado: true,  guion, aviso?, url }   prospecto nuevo
//   200 { ok, id, creado: false, guion: false, url }    ya existía ese id_externo
//   400 { error, campos? }   datos inválidos      401 { error }   secreto incorrecto
//   503 { error }            PROSPECCION_SECRET no está configurado
//
// Sin sesión de usuario: la ruta está en PUBLIC_PATHS del middleware y la
// autenticación es solo el secreto.

function mismoSecreto(recibido: string, esperado: string): boolean {
  const a = createHash("sha256").update(recibido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secreto = process.env.PROSPECCION_SECRET;
  if (!secreto) {
    return NextResponse.json(
      { error: "La creación externa de prospectos no está activada: falta PROSPECCION_SECRET." },
      { status: 503 },
    );
  }

  const auth = request.headers.get("authorization") ?? "";
  const recibido = auth.startsWith("Bearer ") ? auth.slice(7).trim() : (request.headers.get("x-prospeccion-secret") ?? "");
  if (!recibido || !mismoSecreto(recibido, secreto)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let cuerpo: unknown;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo debe ser JSON." }, { status: 400 });
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) {
    return NextResponse.json({ error: "El cuerpo debe ser un objeto JSON." }, { status: 400 });
  }

  try {
    const r = await crearProspectoProspeccion(cuerpo as EntradaProspecto, {
      nombre: "Proceso automático",
      fuente: "api",
    });
    if ("error" in r) {
      return NextResponse.json({ error: r.error, campos: r.campos }, { status: r.campos ? 400 : 500 });
    }
    if (r.creado) revalidatePath("/prospectos");
    return NextResponse.json(
      {
        ok: true,
        id: r.id,
        creado: r.creado,
        guion: r.guion,
        aviso: r.aviso,
        url: `${request.nextUrl.origin}/prospectos/${r.id}`,
      },
      { status: r.creado ? 201 : 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Ocurrió un error inesperado." },
      { status: 500 },
    );
  }
}
