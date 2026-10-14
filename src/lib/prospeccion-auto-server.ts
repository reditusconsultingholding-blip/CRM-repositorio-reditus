import "server-only";
import { randomBytes } from "node:crypto";
import { google } from "googleapis";
import type { createAdminClient } from "@/lib/supabase/admin";
import { llamarClaude } from "@/lib/ia-claude";
import { ETAPA_A_ESTADO, ORIGEN_PROSPECCION, etapaEfectiva, leerProspeccion, type Etapa, type Prospeccion } from "@/lib/prospeccion";
import { guardarProspeccion } from "@/lib/prospeccion-server";
import {
  CALENTAMIENTO,
  CARPETA_CORREO,
  ESTADOS_LEAD,
  FIRMA,
  diaCuenta,
  enHorario,
  estaExcluido,
  leerCorreos,
  ponerPie,
  sinAcentos,
  urlAgenda,
  validarCorreo,
  type Campana,
  type ConfigCorreo,
  type EstadoLead,
} from "@/lib/prospeccion-correo";
import {
  MODO_PRUEBA,
  agregarLeadDirecto,
  campanaAutomatica,
  interno,
  leerConfig,
  leerEmbudoDia,
  listarCampanas,
  prospectoDesdeLead,
  redactarSeguimientos,
  registrarBaja,
  sumarEmbudo,
  type Envio,
  type EstadoCuenta,
  type Respuesta,
} from "@/lib/prospeccion-correo-server";
import {
  EMBUDO_VACIO,
  ESTADOS_COLA,
  MINUTOS_SIN_LATIDO,
  PAISES_AUTO,
  PAIS_AUTO,
  PASOS_EMBUDO,
  anunciosQueCaben,
  calificar,
  costoDeAnuncios,
  diaEnQueLlega,
  estadoPrevio,
  idDeHojaFila,
  leerHallazgo,
  letraDeColumna,
  limpiarDominio,
  mapaDeColumnas,
  numeroDeId,
  primerCorreo,
  type CampoHoja,
  type Corrida,
  type DiaBusqueda,
  type Embudo,
  type EstadoCola,
  type EstadoHoja,
  type Latido,
  type PaisAuto,
  type PanelAuto,
  type RespuestaEnCola,
} from "@/lib/prospeccion-auto";
import { leerGuionArchivo } from "@/lib/videos-server";
import { leerConfig as leerConfigVideos } from "@/lib/videos-config-server";
import { agendarSinPreguntar, filasDeVideo, leerVideoProspecto } from "@/lib/videos-prospecto-server";
import { enMarcha } from "@/lib/videos-prospecto";
import { versionVigente, videoAprobado } from "@/lib/videos";

// Prospección automática, lado servidor. La usan la API del trabajador
// (`/api/servidor/prospeccion/{latido,busqueda/*,hoja}`) y el panel de control
// (`/prospectos/control`). El CRM decide; el trabajador ejecuta y reporta.
//
// Archivos (bucket privado `trabajos`, carpeta `prospeccion/`):
//
//   auto/latido.json                      última señal del trabajador
//   auto/busquedas/<día>.json             corridas de búsqueda del día y lo gastado
//   auto/cursor.json                      por dónde va la rotación de países y palabras
//   auto/hoja.json                        resultado de la última sincronización con la hoja
//   auto/hoja-por-agregar/<país>/<x>.json tiendas halladas que falta escribir en la hoja
//   dominios/<huella>.json                una tienda ya vista (para no analizarla ni escribirle dos veces)
//   cola/<estado>/<id>.json               respuestas que esperan a una persona (lo escribe prospeccion-correo-server)
//   embudo/<día>.json                     contadores del día
//
// No usa ni toca la zona de video: solo llama a lo que esa zona ya exporta.

type Admin = ReturnType<typeof createAdminClient>;
const { R, leer, escribir, mover, borrar, listar, enTandas, enFila, huella, limpiarId } = interno;

const A = {
  latido: `${CARPETA_CORREO}/auto/latido.json`,
  busquedas: (dia: string) => `${CARPETA_CORREO}/auto/busquedas/${dia}.json`,
  cursor: `${CARPETA_CORREO}/auto/cursor.json`,
  hoja: `${CARPETA_CORREO}/auto/hoja.json`,
  hojaDoble: `${CARPETA_CORREO}/auto/hoja-doble.json`,
  carpetaPorAgregar: (pais: string) => `${CARPETA_CORREO}/auto/hoja-por-agregar/${pais}`,
  porAgregar: (pais: string, clave: string) => `${CARPETA_CORREO}/auto/hoja-por-agregar/${pais}/${clave}.json`,
  dominio: (d: string) => `${CARPETA_CORREO}/dominios/${huella(d)}.json`,
};

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const diaMenos = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// ----------------------------------------------------------------- latido ----

// OJO: sin `async` a propósito. Con `async function f() { return leer(...) }` el compilador de Next (Turbopack 16.3)
// da por hecho que `await f()` siempre trae algo y borra los `if (resultado)`: un archivo que no existe pasaba por encontrado.
export function leerLatido(): Promise<Latido | null> {
  return leer<Latido>(A.latido);
}

/**
 * El trabajador avisa que sigue vivo (cada minuto) y se lleva las órdenes del
 * panel. Con `tareas: true` (cada pocos minutos) el CRM aprovecha para lo que
 * no puede hacer solo por no tener reloj propio: preparar las entregas de los
 * videos ya aprobados y agendar los videos cuando «pedir mi aprobación» está
 * apagado.
 */
export async function recibirLatido(admin: Admin, cuerpo: Record<string, unknown>, ahora: Date) {
  const cuentas: Latido["cuentas"] = {};
  for (const [k, v] of Object.entries((cuerpo.cuentas && typeof cuerpo.cuentas === "object" ? cuerpo.cuentas : {}) as Record<string, unknown>).slice(0, 4)) {
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
    cuentas[k.slice(0, 20)] = { ok: o.ok === true, detalle: txt(o.detalle, 200) };
  }
  const latido: Latido = {
    fecha: ahora.toISOString(),
    trabajador: txt(cuerpo.trabajador, 80) || "servidor",
    version: txt(cuerpo.version, 20),
    modo: txt(cuerpo.modo, 20) || "simulacion",
    busqueda: txt(cuerpo.busqueda, 20) || "simulacion",
    cuentas,
    reportesPendientes: Math.max(0, Math.round(Number(cuerpo.reportesPendientes) || 0)),
    ultimoError: txt(cuerpo.ultimoError, 300),
  };
  await escribir(admin, A.latido, latido);
  const config = await leerConfig();
  const hecho: Record<string, unknown> = {};
  if (cuerpo.tareas === true && !config.pausaGeneral) {
    try {
      hecho.entregas = (await prepararEntregas(admin, ahora)).preparadas;
    } catch (e) {
      hecho.entregasError = e instanceof Error ? e.message.slice(0, 160) : "error";
    }
    try {
      hecho.videosAgendados = await agendarVideosSolos(admin);
    } catch (e) {
      hecho.videosError = e instanceof Error ? e.message.slice(0, 160) : "error";
    }
  }
  return {
    ok: true,
    pausa: config.pausaGeneral,
    busqueda: { activa: config.auto.busqueda.activa && !config.pausaGeneral, cadaHoras: config.auto.busqueda.cadaHoras },
    envio: { activo: config.auto.envio.activo && !config.pausaGeneral, nuevosPorDia: config.auto.envio.nuevosPorDia },
    hoja: { activa: config.auto.hoja.activa && !!config.auto.hoja.id },
    hecho,
  };
}

/** Con «pedir mi aprobación» apagado en Creativos, agenda los videos de los candidatos sin que nadie abra la pantalla. Usa tal cual lo que exporta la zona de video. */
async function agendarVideosSolos(admin: Admin): Promise<number> {
  if ((await leerConfigVideos(admin)).aprobarProspectos) return 0;
  const antes = await filasDeVideo(admin);
  const pendientes = antes.filter((f) => f.video.etapa === "sin-decidir").length;
  if (!pendientes) return 0;
  const despues = await agendarSinPreguntar(admin, antes);
  return pendientes - despues.filter((f) => f.video.etapa === "sin-decidir").length;
}

// --------------------------------------------------------------- búsqueda ----

const CORRIDA_ABANDONADA_MS = 90 * 60 * 1000;
const ID_CORRIDA = /^\d{14}-[0-9a-f]{6}$/;

async function leerDia(dia: string): Promise<DiaBusqueda> {
  const d = await leer<Partial<DiaBusqueda>>(A.busquedas(dia));
  return { usd: typeof d?.usd === "number" ? d.usd : 0, corridas: Array.isArray(d?.corridas) ? d.corridas : [] };
}
const gastado = (d: DiaBusqueda) => Math.round(d.corridas.reduce((s, c) => s + (c.usd || 0), 0) * 10000) / 10000;

type Permiso =
  | { permitido: false; motivo: string; proxima: string | null }
  | { permitido: true; corrida: { id: string; pais: PaisAuto; nombrePais: string; palabras: string[]; anunciosMax: number; porPalabra: number; soloShopify: boolean } };

/**
 * ¿Toca buscar ahora? El CRM lleva el reloj de las búsquedas (cada N horas) y
 * la cuenta de lo gastado, así un reinicio del trabajador no dispara corridas
 * de más. Si toca, reserva el presupuesto y entrega el país y las palabras.
 */
export async function permisoDeBusqueda(admin: Admin, ahora: Date): Promise<Permiso> {
  return enFila(async () => {
    const config = await leerConfig();
    const b = config.auto.busqueda;
    if (config.pausaGeneral) return { permitido: false, motivo: "pausa total", proxima: null };
    if (!b.activa) return { permitido: false, motivo: "la búsqueda está apagada en el panel", proxima: null };
    const hoy = diaCuenta(ahora);
    const dia = await leerDia(hoy);
    const ayer = await leerDia(diaMenos(hoy, 1));
    const ultima = [...ayer.corridas, ...dia.corridas].sort((x, y) => x.inicio.localeCompare(y.inicio)).pop();
    if (ultima) {
      const pasado = ahora.getTime() - Date.parse(ultima.inicio);
      if (!ultima.fin && pasado < CORRIDA_ABANDONADA_MS) return { permitido: false, motivo: "ya hay una búsqueda en curso", proxima: null };
      const espera = b.cadaHoras * 3_600_000 - 5 * 60_000;
      if (pasado < espera) return { permitido: false, motivo: `la última búsqueda fue hace menos de ${b.cadaHoras} h`, proxima: new Date(Date.parse(ultima.inicio) + b.cadaHoras * 3_600_000).toISOString() };
    }
    const resto = Math.max(0, b.usdPorDia - gastado(dia));
    const anunciosMax = Math.min(b.anunciosPorCorrida, anunciosQueCaben(Math.min(b.usdPorCorrida, resto), b.usdPorMilAnuncios));
    if (anunciosMax < 5) return { permitido: false, motivo: `tope de costo del día alcanzado (${gastado(dia).toFixed(2)} de ${b.usdPorDia.toFixed(2)} USD)`, proxima: null };

    const cursor = (await leer<{ pais?: number; palabra?: Record<string, number> }>(A.cursor)) ?? {};
    const pais = b.paises[(cursor.pais ?? 0) % b.paises.length];
    const lista = b.palabras[pais];
    const cuantas = Math.max(1, Math.min(4, Math.floor(anunciosMax / 10), lista.length));
    const desde = (cursor.palabra?.[pais] ?? 0) % lista.length;
    const palabras = Array.from({ length: cuantas }, (_, i) => lista[(desde + i) % lista.length]);
    await escribir(admin, A.cursor, { pais: ((cursor.pais ?? 0) + 1) % 1000, palabra: { ...(cursor.palabra ?? {}), [pais]: (desde + cuantas) % lista.length } });

    const id = `${ahora.toISOString().replace(/\D/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
    const corrida: Corrida = { id, pais, inicio: ahora.toISOString(), fin: null, fuente: "", palabras, anunciosMax, anuncios: 0, usd: costoDeAnuncios(anunciosMax, b.usdPorMilAnuncios), hallazgos: 0, agregados: 0, descartados: 0, nota: "en curso (costo reservado)" };
    dia.corridas = [...dia.corridas, corrida].slice(-40);
    dia.usd = gastado(dia);
    await escribir(admin, A.busquedas(hoy), dia);
    return { permitido: true, corrida: { id, pais, nombrePais: PAIS_AUTO[pais].nombre, palabras, anunciosMax, porPalabra: Math.max(5, Math.floor(anunciosMax / cuantas)), soloShopify: b.soloShopify } };
  });
}

type DominioVisto = { dominio: string; fecha: string; estado: "lead" | "descartado"; motivo: string; correo: string };

/** De una lista de dominios, los que el CRM todavía no conoce (ni como lead, ni descartados, ni excluidos). Así el trabajador no gasta tiempo en tiendas ya vistas. */
export async function dominiosNuevos(cuerpo: Record<string, unknown>): Promise<{ nuevos: string[] }> {
  const config = await leerConfig();
  const pedidos = [...new Set((Array.isArray(cuerpo.dominios) ? cuerpo.dominios : []).map((d) => limpiarDominio(String(d))).filter(Boolean))].slice(0, 300);
  const vistos = await enTandas(pedidos, 10, async (d) => (config.exclusiones.includes(d) || (await leer<DominioVisto>(A.dominio(d))) ? null : d));
  return { nuevos: vistos.filter((d): d is string => !!d) };
}

async function anotarDominio(admin: Admin, d: DominioVisto) {
  if (d.dominio) await escribir(admin, A.dominio(d.dominio), d);
}

/**
 * El trabajador entrega lo que encontró. Aquí se califica (puntaje y
 * falencia), se descarta lo repetido contra el CRM y la hoja, y lo que pasa
 * entra a la campaña automática del país y queda por escribir en la hoja.
 */
export async function recibirHallazgos(admin: Admin, cuerpo: Record<string, unknown>, ahora: Date): Promise<Respuesta<{ agregados: number; descartados: number; motivos: Record<string, number>; usd: number }>> {
  return enFila(async () => {
    const id = txt(cuerpo.corridaId, 40);
    if (!ID_CORRIDA.test(id)) return { ok: false, estado: 400, error: "Falta `corridaId`." };
    const config = await leerConfig();
    const b = config.auto.busqueda;
    const hoy = diaCuenta(ahora);
    let diaArchivo = hoy;
    let dia = await leerDia(hoy);
    if (!dia.corridas.some((c) => c.id === id)) {
      diaArchivo = diaMenos(hoy, 1);
      dia = await leerDia(diaArchivo);
    }
    const corrida = dia.corridas.find((c) => c.id === id);
    if (!corrida) return { ok: false, estado: 404, error: "No existe esa corrida." };
    if (corrida.fin) return { ok: true, agregados: corrida.agregados, descartados: corrida.descartados, motivos: {}, usd: corrida.usd };

    const motivos: Record<string, number> = {};
    const descartar = (m: string) => (motivos[m] = (motivos[m] ?? 0) + 1);
    let agregados = 0;
    const campanas = new Map<PaisAuto, Campana>();
    const hallazgos = (Array.isArray(cuerpo.hallazgos) ? cuerpo.hallazgos : []).slice(0, 200);
    for (const crudo of hallazgos) {
      const h = leerHallazgo(crudo);
      if (!h) {
        descartar("dato incompleto");
        continue;
      }
      if (await leer<DominioVisto>(A.dominio(h.dominio))) {
        descartar("tienda ya vista");
        continue;
      }
      const cal = calificar(h, b);
      const visto = { dominio: h.dominio, fecha: ahora.toISOString(), correo: h.correo };
      if (cal.descarte) {
        descartar(cal.descarte.replace(/\d+/g, "N"));
        await anotarDominio(admin, { ...visto, estado: "descartado", motivo: cal.descarte });
        continue;
      }
      let campana = campanas.get(h.pais);
      if (!campana) {
        campana = await campanaAutomatica(admin, h.pais, PAIS_AUTO[h.pais].nombre, config);
        campanas.set(h.pais, campana);
      }
      const r = await agregarLeadDirecto(
        admin,
        campana,
        {
          tienda: h.tienda,
          url: h.url,
          correo: h.correo,
          producto: h.producto,
          falencia: cal.falencia,
          pais: PAIS_AUTO[h.pais].nombre,
          extra: { origen: "busqueda", idHoja: "", dominio: h.dominio, puntaje: cal.puntaje, nivel: cal.nivel, evidencia: cal.evidencia, observado: true, plataforma: h.plataforma, precio: h.precio, telefono: h.telefono, instagram: h.instagram, anuncios: h.anuncios, anunciosVideo: h.anunciosVideo },
        },
        config,
      );
      if ("motivo" in r) {
        descartar(r.motivo);
        await anotarDominio(admin, { ...visto, estado: "descartado", motivo: r.motivo });
        if (r.motivo === "la campaña está llena") campanas.delete(h.pais);
        continue;
      }
      agregados++;
      await anotarDominio(admin, { ...visto, estado: "lead", motivo: "" });
      await escribir(admin, A.porAgregar(h.pais, `${r.lead.campanaId}.${r.lead.id}`), { campanaId: r.lead.campanaId, leadId: r.lead.id, correo: r.lead.correo, hallado: ahora.toISOString() });
    }
    // Lo que el trabajador descartó antes de traerlo (no es Shopify, no es del país, sin correo): se recuerda para no volver a analizarlo.
    for (const v of (Array.isArray(cuerpo.vistos) ? cuerpo.vistos : []).slice(0, 300)) {
      const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
      const dominio = limpiarDominio(txt(o.dominio, 200));
      if (!dominio || (await leer<DominioVisto>(A.dominio(dominio)))) continue;
      const motivo = txt(o.motivo, 120) || "descartada por el trabajador";
      descartar(motivo);
      await anotarDominio(admin, { dominio, fecha: ahora.toISOString(), estado: "descartado", motivo, correo: "" });
    }
    for (const c of campanas.values()) await interno.guardarCampana(admin, c, agregados ? { quien: "Búsqueda automática", accion: `Entraron leads de la corrida ${id}` } : undefined);
    if (agregados) await sumarEmbudo(admin, ahora, "encontrados", agregados);

    const anuncios = Math.max(0, Math.round(Number(cuerpo.anuncios) || 0));
    const usdReal = typeof cuerpo.usd === "number" && cuerpo.usd >= 0 ? cuerpo.usd : null;
    const descartados = Object.values(motivos).reduce((s, n) => s + n, 0);
    Object.assign(corrida, {
      fin: ahora.toISOString(),
      fuente: txt(cuerpo.fuente, 30),
      anuncios,
      // Con el costo real del proveedor se usa ese; si no, el estimado por anuncio leído.
      // Una corrida simulada no le costó nada a nadie: en producción no descuenta del presupuesto del día.
      usd: usdReal ?? (txt(cuerpo.fuente, 30) === "simulacion" && !MODO_PRUEBA ? 0 : costoDeAnuncios(anuncios, b.usdPorMilAnuncios)),
      hallazgos: hallazgos.length,
      agregados,
      descartados,
      nota: txt(cuerpo.nota, 300),
    } satisfies Partial<Corrida>);
    dia.usd = gastado(dia);
    await escribir(admin, A.busquedas(diaArchivo), dia);
    return { ok: true, agregados, descartados, motivos, usd: corrida.usd };
  });
}

// ---------------------------------------------------------------- la hoja ----

type ClienteHoja = {
  cuenta: string;
  leer(pestana: string): Promise<string[][] | null>;
  escribir(cambios: { rango: string; valor: string }[]): Promise<void>;
  agregar(pestana: string, filas: string[][]): Promise<void>;
};

export function cuentaDeServicio(): string {
  return (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "").trim();
}

/**
 * La hoja se lee y se escribe con la cuenta de servicio del CRM (la misma de
 * las carpetas de Drive): el dueño solo comparte la hoja con esa dirección
 * como Editor. Nadie maneja contraseñas.
 */
function clienteHoja(admin: Admin, id: string): ClienteHoja | { error: string } {
  // Doble de prueba (solo en `next dev` y pedido a propósito): la «hoja» es un JSON en Storage.
  if (MODO_PRUEBA && process.env.HOJA_DOBLE === "1") {
    const leerTodo = async () => (await leer<Record<string, string[][]>>(A.hojaDoble)) ?? {};
    return {
      cuenta: "doble-de-prueba",
      leer: async (p) => (await leerTodo())[p] ?? null,
      async escribir(cambios) {
        const todo = await leerTodo();
        for (const c of cambios) {
          const m = /^'(.+)'!([A-Z]+)(\d+)$/.exec(c.rango);
          if (!m) continue;
          const col = [...m[2]].reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0) - 1;
          const fila = (todo[m[1]] ??= []);
          (fila[Number(m[3]) - 1] ??= [])[col] = c.valor;
        }
        await escribir(admin, A.hojaDoble, todo);
      },
      async agregar(p, filas) {
        const todo = await leerTodo();
        (todo[p] ??= []).push(...filas);
        await escribir(admin, A.hojaDoble, todo);
      },
    };
  }
  const email = cuentaDeServicio();
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!email || !key) return { error: "El CRM no tiene configurada la cuenta de servicio de Google (GOOGLE_SERVICE_ACCOUNT_EMAIL y su llave)." };
  const hojas = google.sheets({ version: "v4", auth: new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/spreadsheets"] }) });
  return {
    cuenta: email,
    async leer(pestana) {
      try {
        const r = await hojas.spreadsheets.values.get({ spreadsheetId: id, range: `'${pestana}'`, valueRenderOption: "FORMATTED_VALUE" });
        return ((r.data.values as unknown[][] | undefined) ?? []).map((f) => f.map((c) => String(c ?? "")));
      } catch (e) {
        if (/Unable to parse range/i.test(e instanceof Error ? e.message : "")) return null;
        throw e;
      }
    },
    async escribir(cambios) {
      for (let i = 0; i < cambios.length; i += 400) {
        await hojas.spreadsheets.values.batchUpdate({ spreadsheetId: id, requestBody: { valueInputOption: "RAW", data: cambios.slice(i, i + 400).map((c) => ({ range: c.rango, values: [[c.valor]] })) } });
      }
    },
    async agregar(pestana, filas) {
      if (filas.length) await hojas.spreadsheets.values.append({ spreadsheetId: id, range: `'${pestana}'!A1`, valueInputOption: "RAW", insertDataOption: "INSERT_ROWS", requestBody: { values: filas } });
    },
  };
}

/** El error de Google, dicho de forma que el dueño sepa qué hacer. */
function errorDeHoja(e: unknown, cuenta: string): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/has not been used|is disabled|SERVICE_DISABLED/i.test(m)) return "Falta encender la «Google Sheets API» en el proyecto de Google Cloud del CRM (un clic en «Habilitar»): https://console.developers.google.com/apis/api/sheets.googleapis.com/overview";
  if (/permission|PERMISSION_DENIED|not found|Requested entity/i.test(m)) return `La hoja no está compartida con ${cuenta} como Editor (o el enlace no es el de la hoja).`;
  return `Google respondió: ${m.slice(0, 200)}`;
}

const HOJA_VACIA: EstadoHoja = { ultima: null, error: "", leidas: 0, importadas: 0, actualizadas: 0, agregadas: 0, sinCorreo: 0, cuenta: "" };
export async function leerEstadoHoja(): Promise<EstadoHoja> {
  return { ...HOJA_VACIA, ...((await leer<Partial<EstadoHoja>>(A.hoja)) ?? {}) };
}

const ETIQUETA_LEAD: Record<EstadoLead, string> = {
  pendientes: "Pendiente",
  "en-envio": "Enviando",
  enviados: "Enviado",
  respondidos: "Respondió SÍ",
  rebotados: "Rebotado",
  bajas: "No interesado",
  fallidos: "No se pudo enviar",
};
const ETIQUETA_ETAPA: Record<Etapa, string> = {
  falta_enviar_video: "Respondió SÍ",
  video_enviado: "Video entregado",
  respondio: "Agendó / respondió",
  convertido: "Cliente",
  descartado: "Descartado",
};
const CARPETA_DE_PREVIO: Record<ReturnType<typeof estadoPrevio>, EstadoLead> = { pendiente: "pendientes", enviado: "enviados", si: "respondidos", rebote: "rebotados", no: "bajas" };

type RefLead = { estado: EstadoLead; campanaId: string; leadId: string };

/** Dónde está cada lead de todas las campañas, sin abrir ninguno: la carpeta dice el estado y el nombre trae la huella del correo. */
async function mapaDeLeads(admin: Admin): Promise<Map<string, RefLead>> {
  const mapa = new Map<string, RefLead>();
  for (const c of await listarCampanas(admin)) {
    const listas = await Promise.all(ESTADOS_LEAD.map((e) => listar(admin, R.carpetaLeads(c.id, e))));
    ESTADOS_LEAD.forEach((estado, i) => {
      for (const leadId of listas[i]) mapa.set(leadId.slice(5), { estado, campanaId: c.id, leadId });
    });
  }
  return mapa;
}

type RefProspecto = { id: string; etapa: Etapa };

async function mapaDeProspectos(admin: Admin): Promise<Map<string, RefProspecto>> {
  const { data, error } = await admin.from("prospectos").select("id, estado, email, respuestas_calificacion").eq("origen", ORIGEN_PROSPECCION).limit(3000);
  if (error) throw new Error(error.message);
  const mapa = new Map<string, RefProspecto>();
  for (const f of data ?? []) {
    const p = leerProspeccion(f.respuestas_calificacion);
    if (!p) continue;
    const ref = { id: f.id as string, etapa: etapaEfectiva(f.estado as string, p) };
    const correo = String(f.email || (p.contacto.includes("@") ? p.contacto : "")).trim().toLowerCase();
    if (correo) mapa.set(correo, ref);
    if (p.id_externo) mapa.set(`id:${p.id_externo.toUpperCase()}`, ref);
  }
  return mapa;
}

function fechaDeCelda(v: string): string | null {
  const t = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toISOString();
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(t);
  if (m) return new Date(Date.UTC(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1], 12)).toISOString();
  return null;
}

async function etiquetaDeLead(ref: RefLead): Promise<string> {
  if (ref.estado !== "respondidos") return ETIQUETA_LEAD[ref.estado];
  const lead = await interno.leerLead(ref.campanaId, "respondidos", ref.leadId);
  const c = lead?.respuesta?.clasificacion;
  if (lead?.prospectoId || !c || c === "interesado") return "Respondió SÍ";
  return c === "pregunta" ? "Pregunta" : c === "otro_correo" ? "Pide otro correo" : "Respondió (revisar)";
}

/** Filas nuevas por pasada: el resto entra en la siguiente (la primera vez la hoja trae cientos). */
const MAX_IMPORTAR = 120;

/**
 * Hoja ↔ CRM. De la hoja al CRM entran las filas con correo que el CRM no
 * conoce (las ya trabajadas a mano entran como «enviadas», «rebotadas», etc.:
 * no se les repite el primer correo). Del CRM a la hoja van el Estado y la
 * Fecha de cada fila (el CRM manda) y las tiendas nuevas que halló la búsqueda.
 */
export async function sincronizarHoja(admin: Admin, ahora: Date): Promise<EstadoHoja> {
  return enFila(async () => {
    const config = await leerConfig();
    const res: EstadoHoja = { ...HOJA_VACIA, ultima: ahora.toISOString() };
    const terminar = async (error: string) => {
      const final = { ...res, error };
      await escribir(admin, A.hoja, final);
      return final;
    };
    if (!config.auto.hoja.id) return terminar("Falta pegar el enlace de la hoja en el panel.");
    const cliente = clienteHoja(admin, config.auto.hoja.id);
    if ("error" in cliente) return terminar(cliente.error);
    res.cuenta = cliente.cuenta;
    try {
      const leads = await mapaDeLeads(admin);
      const prospectos = await mapaDeProspectos(admin);
      const hoy = diaCuenta(ahora);
      for (const pais of PAISES_AUTO) {
        const pestana = config.auto.hoja.pestanas[pais];
        const valores = await cliente.leer(pestana);
        if (!valores?.length) {
          if (pais === "ES" && !valores) return terminar(`La hoja no tiene una pestaña llamada «${pestana}».`);
          continue;
        }
        const col = mapaDeColumnas(valores[0]);
        const faltan = (["id", "tienda", "correo", "estado"] as CampoHoja[]).filter((c) => col[c] === undefined);
        if (faltan.length) return terminar(`En la pestaña «${pestana}» no encuentro la columna ${faltan.map((c) => `«${c === "id" ? "#ID" : c}»`).join(", ")} (fila 1).`);
        await sincronizarPestana({ admin, config, cliente, pais, pestana, valores, col, leads, prospectos, hoy, res });
      }
    } catch (e) {
      return terminar(errorDeHoja(e, cliente.cuenta));
    }
    return terminar("");
  });
}

async function sincronizarPestana(x: {
  admin: Admin;
  config: ConfigCorreo;
  cliente: ClienteHoja;
  pais: PaisAuto;
  pestana: string;
  valores: string[][];
  col: Partial<Record<CampoHoja, number>>;
  leads: Map<string, RefLead>;
  prospectos: Map<string, RefProspecto>;
  hoy: string;
  res: EstadoHoja;
}) {
  const { admin, config, cliente, pais, pestana, valores, col, leads, prospectos, hoy, res } = x;
  const info = PAIS_AUTO[pais];
  const cambios: { rango: string; valor: string }[] = [];
  const correosEnHoja = new Set<string>();
  let maxId = 0;
  let importadas = 0;
  let campana: Campana | null = null;
  const tocadas = new Set<Campana>();

  for (let i = 1; i < valores.length; i++) {
    const celda = (c: CampoHoja) => (col[c] === undefined ? "" : String(valores[i][col[c]!] ?? "").trim());
    const id = celda("id");
    if (!id && !celda("tienda")) continue;
    res.leidas++;
    maxId = Math.max(maxId, numeroDeId(id, info.prefijo));
    const correo = primerCorreo(celda("correo"));
    if (!correo) {
      res.sinCorreo++;
      continue;
    }
    correosEnHoja.add(correo);
    const h12 = huella(correo).slice(0, 12);
    let ref = leads.get(h12);
    const pros = prospectos.get(correo) ?? (id ? prospectos.get(`id:${id.toUpperCase()}`) : undefined);

    if (!ref && !pros) {
      const previo = estadoPrevio(celda("estado"));
      if (importadas >= MAX_IMPORTAR) continue;
      if (previo === "pendiente" && sinAcentos(celda("escribir")).toLowerCase().startsWith("no")) continue;
      campana ??= await campanaAutomatica(admin, pais, info.nombre, config);
      const url = celda("url");
      const r = await agregarLeadDirecto(
        admin,
        campana,
        {
          tienda: celda("tienda") || limpiarDominio(url) || correo,
          url,
          correo,
          producto: celda("producto"),
          falencia: celda("falencia"),
          pais: info.nombre,
          extra: { origen: "hoja", idHoja: id, dominio: limpiarDominio(url), puntaje: Number(celda("puntaje")) || null, nivel: celda("nivel").slice(0, 4), evidencia: celda("evidencia").slice(0, 400), observado: false, plataforma: celda("plataforma").toLowerCase().slice(0, 30), precio: celda("precio").slice(0, 40), telefono: celda("telefono").slice(0, 40), instagram: celda("instagram").slice(0, 120), anuncios: null, anunciosVideo: null },
        },
        config,
        { estado: CARPETA_DE_PREVIO[previo], fecha: fechaDeCelda(celda("fecha")), nota: previo === "pendiente" ? "" : `Trabajado a mano antes del CRM (la hoja decía «${celda("estado").slice(0, 40)}»).` },
      );
      if ("motivo" in r) continue;
      importadas++;
      tocadas.add(campana);
      ref = { estado: CARPETA_DE_PREVIO[previo], campanaId: r.lead.campanaId, leadId: r.lead.id };
      leads.set(h12, ref);
      const dominio = limpiarDominio(url);
      if (dominio) await anotarDominio(admin, { dominio, fecha: new Date().toISOString(), estado: "lead", motivo: "", correo });
      if (campana.consecutivo >= 1000) campana = null;
    }

    const etiqueta = pros ? ETIQUETA_ETAPA[pros.etapa] : ref ? await etiquetaDeLead(ref) : "";
    if (!etiqueta || etiqueta === celda("estado")) continue;
    // «Programado» y «Enviado» de la hoja ya dicen lo mismo que «Enviado»: no se reescribe por gusto.
    const fila = i + 1;
    cambios.push({ rango: `'${pestana}'!${letraDeColumna(col.estado!)}${fila}`, valor: etiqueta });
    if (col.fecha !== undefined && etiqueta !== "Pendiente" && !(etiqueta === "Enviado" && celda("fecha"))) cambios.push({ rango: `'${pestana}'!${letraDeColumna(col.fecha)}${fila}`, valor: hoy });
    res.actualizadas++;
  }
  for (const c of tocadas) await interno.guardarCampana(admin, c, { quien: "Hoja de prospectos", accion: "Entraron filas de la hoja" });
  res.importadas += importadas;

  // Tiendas que halló la búsqueda y todavía no están en la hoja: se agregan al final con su #ID.
  const marcas = (await listar(admin, A.carpetaPorAgregar(pais), 100)).slice(0, 80);
  const filas: string[][] = [];
  const hechas: string[] = [];
  for (const clave of marcas) {
    const ruta = A.porAgregar(pais, clave);
    const m = await leer<{ campanaId: string; leadId: string; correo: string; hallado: string }>(ruta);
    const hallado = m ? await interno.buscarLead(m.campanaId, m.leadId) : null;
    hechas.push(ruta);
    if (!m || !hallado || correosEnHoja.has(hallado.lead.correo)) continue;
    const { lead, estado } = hallado;
    const idNuevo = idDeHojaFila(info.prefijo, ++maxId);
    const valor: Partial<Record<CampoHoja, string>> = {
      id: idNuevo,
      tienda: lead.tienda,
      url: lead.url,
      plataforma: lead.extra?.plataforma ?? "",
      producto: lead.producto,
      precio: lead.extra?.precio ?? "",
      anuncios: lead.extra?.anuncios != null ? String(lead.extra.anuncios) : "",
      correo: lead.correo,
      telefono: lead.extra?.telefono ? `'${lead.extra.telefono}` : "",
      instagram: lead.extra?.instagram ?? "",
      estado: await etiquetaDeLead({ estado, campanaId: lead.campanaId, leadId: lead.id }),
      notas: `Hallada por la búsqueda automática el ${m.hallado.slice(0, 10)}.`,
      puntaje: lead.extra?.puntaje != null ? String(lead.extra.puntaje) : "",
      nivel: lead.extra?.nivel ?? "",
      escribir: "Sí",
      falencia: lead.falencia,
      evidencia: lead.extra?.evidencia ?? "",
      anuncio: lead.extra?.evidencia ?? "",
    };
    const fila = Array.from({ length: valores[0].length }, () => "");
    for (const campo of Object.keys(valor) as CampoHoja[]) if (col[campo] !== undefined) fila[col[campo]!] = valor[campo] ?? "";
    filas.push(fila);
    correosEnHoja.add(lead.correo);
    if (lead.extra) {
      lead.extra.idHoja = idNuevo;
      await interno.pasarLead(admin, lead, estado, estado);
    }
  }
  // Primero se escribe en la hoja; solo si eso salió bien se quitan las marcas (si falla, se reintenta en la próxima pasada).
  await cliente.escribir(cambios);
  await cliente.agregar(pestana, filas);
  await borrar(admin, hechas);
  res.agregadas += filas.length;
}

// ------------------------------------------------------ entrega automática ----

const SISTEMA_ENTREGA = `Redactas el correo con el que Reditus Consulting entrega a una tienda el video de muestra GRATIS que aceptó recibir. Va como respuesta en la misma conversación.

En este orden:
1. El video está listo: su enlace exacto, tal cual, solo en una línea.
2. El análisis, en dos o tres frases: qué producto se eligió y por qué, y qué ángulo usa el video y por qué. Solo con los datos que te dan; si un dato no está, no lo menciones.
3. La invitación a una llamada corta para ver cómo sería un paquete de videos, con el enlace exacto de la agenda, solo en una línea.

Reglas:
- La primera línea es «Asunto: …» (máximo 8 palabras). Cuerpo de máximo 140 palabras.
- De persona a persona, sin frases de plantilla, sin emojis, sin markdown.
- No inventes resultados, cifras, precios ni plazos. No critiques sus anuncios.
- Termina con la firma exacta «${FIRMA}». Devuelve solo el correo.`;

export type DatosEntrega = { tienda: string; producto: string; videoUrl: string; agenda: string; formato: string; analisis: string; deAnuncios: boolean; falencia: string };

/** El correo de entrega sin IA: enlace del video, el análisis resumido con lo que se sabe y el llamado a agendar. */
export function entregaBase(d: DatosEntrega): string {
  const producto = d.producto || "su producto";
  const porque = d.deAnuncios ? `Elegimos ${producto} porque es el producto que más están moviendo en sus anuncios.` : `Elegimos ${producto} para la muestra.`;
  const angulo = d.formato ? `El video va en formato «${d.formato}»: muestra el producto en uso y abre con un gancho pensado para detener el dedo en los primeros segundos.` : "El video muestra el producto en uso y abre con un gancho pensado para detener el dedo en los primeros segundos.";
  return `Asunto: Listo el video de ${producto}\n\nHola, equipo de ${d.tienda}.\n\nYa está el video de muestra que aceptaron:\n${d.videoUrl}\n\n${porque} ${angulo}\n\nSi les gusta, en una llamada corta les muestro cómo sería un paquete completo para la tienda. Pueden agendar aquí:\n${d.agenda}\n\n${FIRMA}`;
}

async function redactarEntrega(d: DatosEntrega): Promise<{ texto: string; con: "ia" | "plantilla" }> {
  const base = entregaBase(d);
  if (!process.env.ANTHROPIC_API_KEY) return { texto: base, con: "plantilla" };
  const usuario = `Tienda: ${d.tienda}\nProducto del video: ${d.producto}\n${d.deAnuncios ? "El producto se eligió porque es el que más mueven en sus anuncios de Meta.\n" : ""}Formato del video: ${d.formato || "(sin dato)"}\nLo que se observó en su publicidad (nota interna, dilo como oportunidad): ${d.falencia || "(sin dato)"}\nInvestigación del producto (resumen interno):\n${d.analisis.slice(0, 1500) || "(sin dato)"}\n\nEnlace del video: ${d.videoUrl}\nEnlace de la agenda: ${d.agenda}\n\nVersión base:\n${base}`;
  const r = await llamarClaude(SISTEMA_ENTREGA, usuario, 700);
  const mal = "error" in r || !r.texto.includes(d.videoUrl) || !r.texto.includes(d.agenda) || !/^\s*asunto\s*:/i.test(r.texto) || /[$€]\s?\d|\d\s?(usd|cop|eur|mxn)\b|\d+\s?%|\*\*/i.test(r.texto.replace(d.videoUrl, "").replace(d.agenda, "")) || r.texto.length > 2200;
  return mal ? { texto: base, con: "plantilla" } : { texto: (r as { texto: string }).texto.trim(), con: "ia" };
}

/**
 * Entrega automática. Busca prospectos cuyo video YA APROBÓ UNA PERSONA en
 * Creativos (eso no se automatiza) y deja listo el correo de entrega: enlace,
 * análisis resumido y llamado a agendar. La aprobación del video cuenta como
 * autorización del envío (así lo encendió el dueño en el panel); el trabajador
 * lo envía en el mismo hilo en el siguiente horario laboral, y de ahí salen
 * los seguimientos de los días 2, 5 y 9 si no agenda.
 */
export async function prepararEntregas(admin: Admin, ahora: Date): Promise<{ preparadas: number; revisados: number }> {
  const config = await leerConfig();
  if (config.pausaGeneral || !config.auto.entrega.automatica) return { preparadas: 0, revisados: 0 };
  const { data, error } = await admin
    .from("prospectos")
    .select("id, nombre, estado, origen, email, respuestas_calificacion")
    .eq("origen", ORIGEN_PROSPECCION)
    .eq("estado", ETAPA_A_ESTADO.falta_enviar_video)
    .order("created_at", { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  let preparadas = 0;
  let revisados = 0;
  for (const fila of data ?? []) {
    const p = leerProspeccion(fila.respuestas_calificacion);
    if (!p || p.canal !== "correo" || p.servicio !== "video" || p.etapa !== "falta_enviar_video") continue;
    const c = leerCorreos(fila.respuestas_calificacion);
    if (c.aprobado || c.enEnvio || c.eventos.some((e) => e.tipo === "entrega")) continue;
    revisados++;
    const id = fila.id as string;
    const v = await leerVideoProspecto(id);
    if (v.etapa !== "lanzado" || !v.guionId) continue;
    const g = await leerGuionArchivo(admin, v.guionId);
    const version = g ? versionVigente(g) : null;
    if (!g || !version || !version.videoUrl || !videoAprobado(version) || !version.videoAprobado) continue;

    const correo = String(fila.email || (p.contacto.includes("@") ? p.contacto : "")).trim().toLowerCase();
    if (!validarCorreo(correo, { permitirEjemplo: MODO_PRUEBA }).ok || estaExcluido(correo, config.exclusiones)) continue;
    const dest = await interno.leerDestinatario(correo);
    if (dest?.baja || dest?.rebote) continue;

    const origen = c.origen ? await interno.buscarLead(c.origen.campanaId, c.origen.leadId) : null;
    const datosVideo = (v.datos && typeof v.datos === "object" ? v.datos : {}) as Record<string, unknown>;
    const entrega = await redactarEntrega({
      tienda: fila.nombre as string,
      producto: v.producto || p.producto,
      videoUrl: version.videoUrl,
      agenda: urlAgenda(),
      formato: g.formatoNombre ?? "",
      analisis: typeof datosVideo.analisisProducto === "string" ? datosVideo.analisisProducto : "",
      deAnuncios: !!origen?.lead.extra,
      falencia: p.falencia,
    });
    const conVideo: Partial<Prospeccion> = { video_url: version.videoUrl, video_nombre: `Video generado · v${version.n}`, video_path: null, video_terminado_at: ahora.toISOString(), mensaje: entrega.texto };
    const w = await guardarProspeccion(admin, id, conVideo, { evento: { quien: "Entrega automática", accion: `Video aprobado por ${version.videoAprobado.por}: se preparó el correo de entrega (${entrega.con === "ia" ? "con IA" : "plantilla"})` } });
    if (w.error) continue;
    const seg = await redactarSeguimientos(fila.nombre as string, { ...p, ...conVideo });
    await interno.guardarCorreos(admin, id, (x) => {
      x.aprobado = { por: `${version.videoAprobado!.por} (aprobó el video · entrega automática)`, porId: version.videoAprobado!.porId, fecha: ahora.toISOString() };
      x.seguimientos = { estado: "sin_iniciar", motivo: "", textos: seg.textos };
    });
    await interno.guardarDestinatario(admin, correo, { prospectoId: id });
    preparadas++;
  }
  return { preparadas, revisados };
}

// ------------------------------------------------------- cola de respuestas ----

const ID_COLA = /^\d{14}-[0-9a-f]{10}$/;

export async function leerCola(admin: Admin, estado: EstadoCola, limite = 40): Promise<RespuestaEnCola[]> {
  const ids = (await listar(admin, R.carpetaCola(estado), limite)).filter((i) => ID_COLA.test(i));
  const items = await enTandas(ids.slice(-limite), 8, (id) => leer<RespuestaEnCola>(R.cola(estado, id)));
  return items.filter((i): i is RespuestaEnCola => !!i).sort((a, b) => b.recibido.localeCompare(a.recibido));
}

async function buscarEnCola(id: string): Promise<{ item: RespuestaEnCola; estado: EstadoCola } | null> {
  if (!ID_COLA.test(id)) return null;
  for (const estado of ESTADOS_COLA) {
    const item = await leer<RespuestaEnCola>(R.cola(estado, id));
    if (item) return { item, estado };
  }
  return null;
}

async function pasarCola(admin: Admin, item: RespuestaEnCola, de: EstadoCola, a: EstadoCola) {
  await escribir(admin, R.cola(de, item.id), item);
  if (de !== a) await mover(admin, R.cola(de, item.id), R.cola(a, item.id));
}

export type AccionCola = { tipo: "aprobar"; texto: string } | { tipo: "descartar" } | { tipo: "es_si" } | { tipo: "no_interesado" } | { tipo: "devolver" } | { tipo: "dar_por_enviada" };

/**
 * Lo que decide una persona sobre una respuesta en cola. «Aprobar» manda el
 * texto (editado o no) al trabajador para que salga en el mismo hilo; nada se
 * responde sin este paso.
 */
export async function resolverCola(admin: Admin, id: string, accion: AccionCola, quien: { id: string; nombre: string }, ahora: Date): Promise<{ error?: string; aviso?: string }> {
  if (accion.tipo === "no_interesado") {
    // La baja tiene su propio turno en la fila: se hace antes de entrar (un turno dentro de otro no terminaría nunca).
    const previo = await buscarEnCola(id);
    if (!previo || previo.estado !== "pendientes") return { error: "Esa respuesta ya se resolvió." };
    const r = await registrarBaja(admin, { correo: previo.item.de, motivo: `Marcado como no interesado por ${quien.nombre}` }, ahora);
    if (!r.ok) return { error: r.error };
  }
  return enFila(async () => {
    const h = await buscarEnCola(id);
    if (!h) return { error: "Esa respuesta ya no está en la cola." };
    const { item, estado } = h;
    if (accion.tipo === "devolver" || accion.tipo === "dar_por_enviada") {
      if (estado !== "en-envio") return { error: "Esa respuesta no está sin confirmar." };
      item.nota = accion.tipo === "devolver" ? `${quien.nombre} la devolvió a la cola de envío.` : `${quien.nombre} confirmó en Gmail que sí salió.`;
      if (accion.tipo === "dar_por_enviada") item.enviadaAt = ahora.toISOString();
      await pasarCola(admin, item, "en-envio", accion.tipo === "devolver" ? "aprobadas" : "enviadas");
      return {};
    }
    if (estado !== "pendientes") return { error: "Esa respuesta ya se resolvió." };
    if (accion.tipo === "aprobar") {
      const texto = String(accion.texto ?? "").replace(/\r\n/g, "\n").trim();
      if (texto.length < 20) return { error: "El texto está vacío o es demasiado corto." };
      if (texto.length > 3000) return { error: "El texto es demasiado largo (máximo 3.000 caracteres)." };
      if (/\[COMPLETAR/i.test(texto)) return { error: "Todavía hay un «[COMPLETAR: …]» sin llenar." };
      if (texto !== item.borrador.trim()) item.borradorCon = "persona";
      item.borrador = texto;
      item.aprobada = { por: quien.nombre, porId: quien.id, fecha: ahora.toISOString() };
      await pasarCola(admin, item, "pendientes", "aprobadas");
      return { aviso: "Sale en el mismo hilo en el siguiente horario laboral del prospecto." };
    }
    if (accion.tipo === "es_si") {
      if (item.destino.tipo === "prospecto") return { error: "Ya es un prospecto." };
      const r = await prospectoDesdeLead(admin, item.destino.campanaId, item.destino.leadId, quien.nombre);
      if (r.error || !r.id) return { error: r.error ?? "No se pudo crear el prospecto." };
      await sumarEmbudo(admin, ahora, "aceptados");
      item.destino = { tipo: "prospecto", prospectoId: r.id };
      item.nota = `${quien.nombre} lo pasó a candidato a video.`;
      await pasarCola(admin, item, "pendientes", "descartadas");
      return { aviso: "Quedó como candidato a video." };
    }
    item.nota = accion.tipo === "no_interesado" ? `${quien.nombre}: no interesado, no se le escribe más.` : `${quien.nombre} la descartó sin responder.`;
    await pasarCola(admin, item, "pendientes", "descartadas");
    return {};
  });
}

/** Respuestas ya aprobadas por una persona, listas para salir. Van antes que cualquier otro correo. */
export async function respuestasAprobadas(admin: Admin, pedido: { linea?: unknown; max?: unknown }, ahora: Date): Promise<{ envios: Envio[]; cuentas: EstadoCuenta[]; motivo?: string }> {
  return enFila(async () => {
    const config = await leerConfig();
    const cuentas = await Promise.all(interno.lineasPedidas(pedido.linea).map((l) => interno.cupo(config, l, ahora)));
    if (config.pausaGeneral) return { envios: [], cuentas, motivo: "pausa total" };
    const hoy = diaCuenta(ahora);
    const envios: Envio[] = [];
    for (const id of (await listar(admin, R.carpetaCola("aprobadas"), 20)).filter((i) => ID_COLA.test(i))) {
      if (envios.length >= 1) break;
      const item = await leer<RespuestaEnCola>(R.cola("aprobadas", id));
      const cuenta = item ? cuentas.find((c) => c.linea === item.linea) : undefined;
      if (!item || !cuenta || cuenta.restantes <= 0 || !enHorario(item.pais, ahora)) continue;
      // A quien pregunta se le puede responder el mismo día; lo que no se salta es la baja, el rebote y la exclusión.
      const bloqueo = await interno.bloqueoDestinatario(item.de, config, "");
      if (bloqueo) {
        item.nota = `No se envió: la dirección quedó bloqueada (${bloqueo}).`;
        await pasarCola(admin, item, "aprobadas", "descartadas");
        continue;
      }
      const { pie, bajaUrl } = await interno.datosDePie(admin, config, item.de);
      await pasarCola(admin, { ...item, nota: `Entregada al trabajador el ${ahora.toISOString()}` }, "aprobadas", "en-envio");
      await interno.guardarDestinatario(admin, item.de, { ultimoDia: hoy });
      await interno.sumarDiario(admin, cuenta.linea, hoy, 1);
      envios.push({
        id: `r.${item.id}`,
        tipo: "respuesta",
        paso: "respuesta",
        linea: item.linea,
        para: item.de,
        asunto: `Re: ${(item.hilo.asunto || "tu mensaje").replace(/^(re:\s*)+/i, "")}`,
        cuerpo: ponerPie(item.borrador, pie),
        enRespuestaA: item.hilo.enRespuestaA,
        referencias: item.hilo.referencias,
        pais: item.pais,
        bajaUrl,
      });
    }
    return { envios, cuentas };
  });
}

export const esEnvioDeRespuesta = (id: unknown) => typeof id === "string" && id.startsWith("r.");

/** El trabajador reporta qué pasó con una respuesta aprobada (mismos resultados que cualquier envío). */
export async function registrarRespuestaEnviada(admin: Admin, cuerpo: Record<string, unknown>, ahora: Date): Promise<Respuesta<{ estado: string }>> {
  return enFila(async () => {
    const h = await buscarEnCola(String(cuerpo.id ?? "").slice(2));
    if (!h) return { ok: false, estado: 404, error: "No existe esa respuesta." };
    const { item, estado } = h;
    if (estado !== "en-envio") return { ok: true, estado: "ya registrado" };
    const resultado = cuerpo.resultado === "fallo" || cuerpo.resultado === "incierto" ? cuerpo.resultado : "ok";
    const fecha = interno.fechaValida(cuerpo.fecha, ahora);
    if (resultado === "incierto") {
      item.nota = "El trabajador se reinició a mitad del envío: no se sabe si salió. Mira «Enviados» en Gmail y decide.";
      await pasarCola(admin, item, "en-envio", "en-envio");
      return { ok: true, estado: "sin confirmar" };
    }
    if (resultado === "fallo") {
      item.nota = `No salió: ${String(cuerpo.error ?? "sin detalle").slice(0, 200)}. Se reintenta.`;
      await pasarCola(admin, item, "en-envio", "aprobadas");
      await interno.guardarDestinatario(admin, item.de, { ultimoDia: null });
      await interno.sumarDiario(admin, item.linea, diaCuenta(new Date(fecha)), -1);
      return { ok: true, estado: "pendiente" };
    }
    item.enviadaAt = fecha;
    item.messageId = limpiarId(String(cuerpo.messageId ?? "")).slice(0, 400) || null;
    item.nota = "";
    await pasarCola(admin, item, "en-envio", "enviadas");
    if (item.messageId) {
      await escribir(admin, R.mensaje(item.messageId), item.destino.tipo === "prospecto" ? { tipo: "prospecto", prospectoId: item.destino.prospectoId } : { tipo: "campana", campanaId: item.destino.campanaId, leadId: item.destino.leadId });
    }
    if (item.destino.tipo === "prospecto") {
      await guardarProspeccion(admin, item.destino.prospectoId, {}, { evento: { quien: "Correo", accion: `Se respondió su pregunta por correo (aprobó ${item.aprobada?.por ?? "—"})` } });
    }
    await interno.iniciarCalentamiento(admin, item.linea, diaCuenta(ahora));
    return { ok: true, estado: "enviada" };
  });
}

// ------------------------------------------------------------------ panel ----

function sumar(a: Embudo, b: Embudo): Embudo {
  return Object.fromEntries(PASOS_EMBUDO.map((p) => [p, a[p] + b[p]])) as Embudo;
}

/** Todo lo que muestra /prospectos/control. Lecturas nada más. */
export async function panelAuto(admin: Admin, config: ConfigCorreo, ahora: Date): Promise<PanelAuto> {
  const hoy = diaCuenta(ahora);
  const dias = await Promise.all(Array.from({ length: 7 }, (_, i) => leerEmbudoDia(diaMenos(hoy, i))));
  const [latido, busquedas, ayerBusquedas, pendientes, enEnvio, hoja, campanas] = await Promise.all([
    leerLatido(),
    leerDia(hoy),
    leerDia(diaMenos(hoy, 1)),
    leerCola(admin, "pendientes"),
    leerCola(admin, "en-envio", 10),
    leerEstadoHoja(),
    listarCampanas(admin),
  ]);
  const { count: llamadas } = await admin.from("prospectos").select("id", { count: "exact", head: true }).eq("origen", "calendly").gte("created_at", `${hoy}T05:00:00Z`);
  dias[0].llamadas = Math.max(dias[0].llamadas, llamadas ?? 0);
  const autos = campanas.filter((c) => c.auto);
  const enCola = (await Promise.all(autos.map((c) => listar(admin, R.carpetaLeads(c.id, "pendientes"))))).reduce((s, l) => s + l.length, 0);
  let videos = { porDecidir: 0, enCurso: 0, topePorDia: 0, pideAprobacion: true };
  try {
    const [filas, cfgVideos] = await Promise.all([filasDeVideo(admin), leerConfigVideos(admin)]);
    videos = { porDecidir: filas.filter((f) => f.video.etapa === "sin-decidir").length, enCurso: filas.filter((f) => enMarcha(f.video.etapa) || f.video.etapa === "lanzado").length, topePorDia: cfgVideos.videosPorDia, pideAprobacion: cfgVideos.aprobarProspectos };
  } catch {
    /* la zona de video es informativa aquí */
  }
  const corridas = [...ayerBusquedas.corridas, ...busquedas.corridas];
  const ultimaCorrida = corridas[corridas.length - 1] ?? null;
  const servidorVivo = !!latido && ahora.getTime() - Date.parse(latido.fecha) < MINUTOS_SIN_LATIDO * 60_000;

  const avisos: string[] = [];
  if (!process.env.SERVIDOR_SECRET?.trim()) avisos.push("Falta SERVIDOR_SECRET en Vercel: el servidor no puede hablar con el CRM y no sale ni entra nada.");
  else if (!latido) avisos.push("El trabajador del servidor todavía no ha dado señal.");
  else if (!servidorVivo) avisos.push(`El servidor no da señal desde ${new Date(latido.fecha).toLocaleString("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}: no se está enviando ni leyendo nada.`);
  if (latido && servidorVivo && latido.modo !== "real") avisos.push("El trabajador está en SIMULACIÓN: los correos se escriben en disco, no salen.");
  for (const [linea, c] of Object.entries(latido?.cuentas ?? {})) if (!c.ok) avisos.push(`Gmail no acepta la cuenta «${linea}»: ${c.detalle || "revisa la contraseña de aplicación"}.`);
  if (!config.auto.remitente.direccion) avisos.push("Falta la dirección postal del remitente: va en el pie de cada correo (requisito legal en España).");
  if (!process.env.ANTHROPIC_API_KEY) avisos.push("La IA no está activa en este entorno: los correos salen con la plantilla y las respuestas dudosas quedan «por revisar».");
  if (urlAgenda().includes("calendly.com")) avisos.push("URL_AGENDA_VIDEOS no está definida: los correos llevan el Calendly de siempre.");
  if (config.auto.hoja.activa && hoja.error) avisos.push(`Hoja de prospectos: ${hoja.error}`);
  if (config.auto.envio.activo && !enCola) avisos.push("El envío está encendido pero no hay tiendas en cola: enciende la búsqueda o conecta la hoja.");
  if (videos.topePorDia && videos.topePorDia < 20) avisos.push(`El tope de videos por día en Creativos es ${videos.topePorDia}; si tu capacidad es 20, súbelo en «Topes y automatización».`);

  return {
    hoy,
    embudo: { hoy: dias[0], ayer: dias[1], semana: dias.reduce(sumar, EMBUDO_VACIO) },
    latido,
    servidorVivo,
    busquedas,
    ultimaCorrida,
    proximaBusqueda: ultimaCorrida && config.auto.busqueda.activa ? new Date(Date.parse(ultimaCorrida.inicio) + config.auto.busqueda.cadaHoras * 3_600_000).toISOString() : null,
    cola: [...enEnvio.map((i) => ({ ...i, nota: i.nota || "Saliendo" })), ...pendientes],
    sinConfirmar: enEnvio.map((i) => i.id),
    hoja,
    cuentaDeServicio: cuentaDeServicio(),
    enCola,
    videos,
    diaObjetivo: diaEnQueLlega(config.auto.envio.nuevosPorDia, CALENTAMIENTO),
    avisos,
  };
}

/** Para el cron diario: ¿hay algo encendido y el servidor lleva horas callado? Devuelve el aviso o null. */
export async function avisoServidorCaido(ahora: Date): Promise<string | null> {
  const config = await leerConfig();
  if (config.pausaGeneral || (!config.auto.envio.activo && !config.auto.busqueda.activa)) return null;
  const latido = await leerLatido();
  if (latido && ahora.getTime() - Date.parse(latido.fecha) < 2 * 3_600_000) return null;
  return latido ? "Prospección: el servidor lleva más de 2 horas sin dar señal" : "Prospección: está encendida pero el servidor nunca ha dado señal";
}

