"use server";

import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";
import {
  CAPACIDAD,
  PIPELINE_A_COLA,
  calcularEntrega,
  fechaLarga,
  hoyEnColombia,
  type TrabajoEnCola,
} from "@/lib/capacidad";
import { interpretarConReglas, validarPedido } from "@/components/asistente-entrega/interpretar";
import {
  leerServicioHistorico,
  sugerirPrecio,
  tipoDeServicioApp,
  type Muestra,
} from "@/components/asistente-entrega/precio";
import { copTexto, describirItems, mensajePlantilla } from "@/components/asistente-entrega/mensaje";
import type { DatosMensaje, Pedido, RespuestaAsistente } from "@/components/asistente-entrega/tipos";

// Asistente de entrega: la IA SOLO entiende el dictado y redacta el
// mensaje. La fecha (lib/capacidad.ts) y el precio (precio.ts) se calculan
// en código con los datos reales, así que todo sigue funcionando sin IA.

const MODELO = "claude-sonnet-5";

async function preguntarAClaude(system: string, user: string, maxTokens: number): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELO,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const texto = data?.content?.find((c: { type: string }) => c.type === "text")?.text;
    return typeof texto === "string" && texto.trim() ? texto.trim() : null;
  } catch {
    return null;
  }
}

const SYSTEM_INTERPRETAR = `Extraes los datos de un pedido que el dueño de una agencia (Reditus Consulting: videos creativos y landing pages para e-commerce) dicta por voz. Devuelve SOLO un objeto JSON, sin texto antes ni después, con esta forma exacta:
{"cliente": string|null, "items": [{"tipo": "video"|"landing"|"imagenes"|"pagina_marca"|"cro"|"otro", "cantidad": entero >= 1, "producto": string|null}], "urgente": boolean}

Reglas:
- "video": videos creativos, UGC, videos con IA. "landing": landing page o página de producto. "imagenes": imágenes o creativos estáticos para anuncios. "pagina_marca": página/sitio/tienda de marca completa (home + secciones). "cro": optimización de una página existente. "otro": cualquier otra cosa.
- "cantidad" es el número de unidades; si no se dice, 1. El dictado puede traer números en palabras.
- "producto": el producto o marca del cliente si se menciona, si no null.
- "cliente": el nombre de la persona o empresa si se menciona, si no null.
- "urgente": true solo si se dice que es urgente o para ya.
- Si no se pide ningún servicio, "items" es [].
- No inventes nada que no esté en el dictado.`;

const SYSTEM_MENSAJE = `Redactas un mensaje corto de WhatsApp que el dueño de Reditus Consulting (agencia colombiana de videos y landing pages) le va a copiar a un cliente para decirle cuándo se entrega su proyecto.

Reglas:
- Español colombiano, cercano y profesional, de tú. Empieza saludando («Hola, ¿cómo estás?» o parecido, con el nombre si lo tienes).
- Di la fecha de entrega EXACTAMENTE como te la dan. No la cambies ni agregues otra.
- Menciona el precio solo si te lo dan, tal cual.
- Nada de promesas de resultados (ventas, conversiones, ROAS), ni garantías, ni urgencia artificial.
- 2 a 4 frases, sin listas, sin negritas, sin comillas, máximo un emoji.
- Devuelve SOLO el mensaje.`;

function extraerJson(texto: string): unknown {
  const ini = texto.indexOf("{");
  const fin = texto.lastIndexOf("}");
  if (ini === -1 || fin <= ini) return null;
  try {
    return JSON.parse(texto.slice(ini, fin + 1));
  } catch {
    return null;
  }
}

async function tieneAcceso(): Promise<boolean> {
  const profile = await requireProfile();
  return (INGRESOS_ROLES as string[]).includes(profile.role);
}

type Entrada = { texto?: string; manual?: unknown };

export async function consultarAsistenteEntrega(
  entrada: Entrada,
): Promise<{ error: string } | { ok: RespuestaAsistente }> {
  try {
    if (!(await tieneAcceso())) return { error: "No tienes acceso al asistente de entrega." };

    const avisos: string[] = [];
    let pedido: Pedido | null = null;
    let interpretadoCon: RespuestaAsistente["interpretadoCon"] = "manual";

    if (entrada.manual) {
      pedido = validarPedido(entrada.manual);
    } else {
      const texto = String(entrada.texto ?? "").trim().slice(0, 1500);
      if (!texto) return { error: "Cuéntame qué pedido entró, o llénalo a mano." };

      const crudo = await preguntarAClaude(SYSTEM_INTERPRETAR, texto, 400);
      pedido = crudo ? validarPedido(extraerJson(crudo)) : null;
      if (pedido) {
        interpretadoCon = "ia";
      } else {
        pedido = interpretarConReglas(texto);
        interpretadoCon = "reglas";
        avisos.push("La IA no está disponible: leí el pedido con reglas simples. Revisa que lo haya entendido bien.");
      }
    }

    if (!pedido || pedido.items.length === 0) {
      return { error: "No entendí qué servicio pidió. Dímelo de nuevo (ej. «6 videos y una landing») o llénalo a mano." };
    }

    const supabase = await createClient();
    // En la base «estado» puede seguir siendo un enum viejo que no conoce
    // todos los estados: en SQL solo se filtran los dos que siempre existen
    // (igual que el dashboard) y el resto se descarta aquí.
    const cerrados = ["SUBIDA", "NO LABORADO", "NO APROBADO"];

    const [{ data: usuarios }, { data: reqsCrudos, error: errorCola }, { data: items }, { data: historicos }, usdCop] = await Promise.all([
      supabase.from("users").select("role").eq("active", true),
      supabase
        .from("requerimientos")
        .select("pipeline, estado, cantidad, f_entrega_prometida, updated_at, requerimiento_unidades(completado)")
        .not("estado", "in", '("ENTREGADO","Terminado")'),
      supabase
        .from("ingreso_items")
        .select("servicio, cantidad, precio_unitario, ingreso:ingresos(moneda, estado_comercial)"),
      supabase.from("historical_ingresos").select("servicio, precio_usd_aprox").gt("precio_usd_aprox", 0).limit(2000),
      getUsdCopRate(),
    ]);

    // Sin la cola real no hay fecha confiable: mejor decirlo que dar una fecha optimista.
    if (errorCola || !reqsCrudos) {
      return { error: "No pude leer los requerimientos abiertos, así que no puedo calcular la fecha. Intenta de nuevo." };
    }
    const reqs = reqsCrudos.filter((r) => !cerrados.includes(String(r.estado)));

    if (!usdCop) avisos.push("No pude leer la tasa del dólar de hoy: usé 4.000 COP.");
    const rateCop = usdCop ?? 4000;

    // ── Equipo y cola reales ──
    const equipo: Record<string, number> = {};
    for (const u of usuarios ?? []) equipo[u.role] = (equipo[u.role] ?? 0) + 1;

    const cola: TrabajoEnCola[] = [];
    for (const r of reqs) {
      const c = PIPELINE_A_COLA[String(r.pipeline)];
      if (!c) continue;
      const hechas = (r.requerimiento_unidades ?? []).filter((u: { completado: boolean }) => u.completado).length;
      cola.push({
        cola: c,
        unidades: Math.max(0, Number(r.cantidad ?? 1) - hechas),
        estado: String(r.estado),
        fechaPrometida: r.f_entrega_prometida ? String(r.f_entrega_prometida) : null,
      });
    }

    const hoy = hoyEnColombia();
    const entregas = pedido.items.map((it) => calcularEntrega({ hoy, tipo: it.tipo, cantidad: it.cantidad, cola, equipo }));
    const conFecha = entregas.filter((e) => e.fecha);
    const fecha = conFecha.length ? conFecha.map((e) => e.fecha!).sort().at(-1)! : null;
    const fechaSinCola = conFecha.length ? conFecha.map((e) => e.fechaSinCola!).sort().at(-1)! : null;

    const sinFechas = reqs.length > 0 && reqs.every((r) => !r.f_entrega_prometida);
    if (sinFechas) {
      avisos.push(
        "Ningún requerimiento abierto tiene «fecha prometida»: la cola se calculó solo con las unidades pendientes y su estado.",
      );
    }
    const hace3Semanas = Date.now() - 21 * 24 * 60 * 60 * 1000;
    const colasDelPedido = new Set(entregas.filter((e) => e.fecha && e.unidadesEnCola > 0).map((e) => CAPACIDAD.tipos[e.tipo]?.cola));
    const viejos = reqs.filter(
      (r) =>
        colasDelPedido.has(PIPELINE_A_COLA[String(r.pipeline)]) &&
        CAPACIDAD.estadosEnProduccion.includes(String(r.estado)) &&
        r.updated_at &&
        new Date(r.updated_at).getTime() < hace3Semanas,
    ).length;
    if (viejos > 0) {
      avisos.push(
        `${viejos} requerimiento(s) de la cola llevan más de 3 semanas sin moverse. Si ya se entregaron, márcalos en Requerimientos: están alargando la fecha.`,
      );
    }
    if (pedido.urgente && fechaSinCola && fecha && fechaSinCola < fecha) {
      avisos.push(`Es urgente: si lo pasas por delante de la cola, saldría el ${fechaLarga(fechaSinCola)} (lo demás se corre).`);
    }

    // ── Precio según lo ya cobrado ──
    const muestras: Muestra[] = [];
    for (const it of items ?? []) {
      const tipo = tipoDeServicioApp(it.servicio);
      const ingreso = Array.isArray(it.ingreso) ? it.ingreso[0] : it.ingreso;
      if (!tipo || !ingreso || ingreso.estado_comercial !== "Cerrado") continue;
      muestras.push({
        tipo,
        cantidad: Number(it.cantidad) || 1,
        unitUsd: ingresoToUsd(Number(it.precio_unitario), ingreso.moneda, rateCop),
        fuente: "app",
      });
    }
    for (const h of historicos ?? []) {
      const leido = leerServicioHistorico(h.servicio);
      if (!leido) continue;
      muestras.push({ ...leido, unitUsd: Number(h.precio_usd_aprox) / leido.cantidad, fuente: "historico" });
    }

    const precios = pedido.items.map((it) => sugerirPrecio(muestras, it.tipo, it.cantidad, rateCop));
    const completos = precios.every((p) => p.totalCop != null);
    const totalCop = completos ? precios.reduce((s, p) => s + (p.totalCop ?? 0), 0) : null;
    const totalUsd = completos ? precios.reduce((s, p) => s + (p.totalUsd ?? 0), 0) : null;

    const mensaje = fecha
      ? mensajePlantilla({ cliente: pedido.cliente, items: pedido.items.filter((_, i) => entregas[i]?.fecha), fecha, precioCop: null, variante: 0 })
      : "";

    return {
      ok: { pedido, hoy, entregas, fecha, fechaSinCola, precios, totalCop, totalUsd, rateCop, mensaje, interpretadoCon, avisos },
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo calcular. Intenta de nuevo." };
  }
}

/** Redacta (o vuelve a redactar) el mensaje para el cliente. Si la IA no
 * responde, devuelve la plantilla — nunca deja al usuario sin mensaje. */
export async function redactarMensajeEntrega(
  datos: DatosMensaje,
): Promise<{ error: string } | { mensaje: string; conIa: boolean }> {
  try {
    if (!(await tieneAcceso())) return { error: "No tienes acceso al asistente de entrega." };

    const pedido = validarPedido({ cliente: datos?.cliente, items: datos?.items });
    const fecha = String(datos?.fecha ?? "");
    if (!pedido || pedido.items.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return { error: "Faltan datos para redactar el mensaje." };
    }
    const precioCop = Number(datos.precioCop) > 0 ? Number(datos.precioCop) : null;
    const variante = Math.floor(Number(datos.variante)) || 0;
    const limpio: DatosMensaje = { cliente: pedido.cliente, items: pedido.items, fecha, precioCop, variante };

    const hechos = [
      `Cliente: ${pedido.cliente ?? "(sin nombre: saluda sin nombre)"}`,
      `Qué se entrega: ${describirItems(pedido.items)}`,
      `Fecha de entrega: ${fechaLarga(fecha)}`,
      precioCop ? `Precio: ${copTexto(precioCop)}` : "Precio: no lo menciones",
      variante > 0 ? `Esta es la versión ${variante + 1}: redáctalo distinto a un mensaje típico, cambiando el saludo y el cierre.` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const texto = await preguntarAClaude(SYSTEM_MENSAJE, hechos, 300);
    // La fecha la pone el código: si la IA no la respetó, se descarta su texto.
    const diaYMes = fechaLarga(fecha).split(" ").slice(1).join(" ");
    if (texto && texto.length < 900 && texto.includes(diaYMes)) return { mensaje: texto, conIa: true };

    return { mensaje: mensajePlantilla(limpio), conIa: false };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No se pudo redactar el mensaje." };
  }
}
