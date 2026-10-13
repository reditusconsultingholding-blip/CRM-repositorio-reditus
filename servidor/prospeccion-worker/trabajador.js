"use strict";
// Trabajador de prospección por correo de Reditus.
//
//   node trabajador.js               residente: envía y lee la bandeja sin parar
//   node trabajador.js --comprobar   revisa .env, CRM y (en modo real) el acceso a Gmail; no envía nada
//   node trabajador.js --ciclos N    hace N vueltas y sale (para pruebas)
//
// Qué hace en cada vuelta:
//   1. Entrega al CRM los reportes que tenga guardados (envíos hechos, respuestas, rebotes).
//   2. Por cada cuenta, si ya pasó la espera: le pide al CRM UN correo, lo envía y lo reporta.
//      Luego espera entre 2,5 y 5 minutos al azar antes del siguiente de esa cuenta.
//   3. Cada pocos minutos lee la bandeja (solo lo nuevo) y reporta respuestas y rebotes.
//
// El CRM es quien decide qué puede salir: aprobación, tope del día con
// calentamiento, horario laboral del país, exclusiones. Aquí no hay forma de
// saltarse eso: el trabajador solo envía lo que el CRM le entrega.
//
// Todo lo que está a medias se guarda en datos/estado.json, así que después
// de un reinicio retoma: los reportes pendientes se entregan, y un envío que
// quedó a mitad se reporta como «incierto» (no se repite solo).
const fs = require("fs");
const path = require("path");
const { cargar, revisar, secretos } = require("./lib/entorno");
const { crearRegistro, tapar } = require("./lib/registro");
const { crearCrm } = require("./lib/crm");
const { crearCorreo, noSalio } = require("./lib/correo");
const { analizar } = require("./lib/analizar");

const cfg = cargar();
// Con reloj de prueba cada línea del registro lleva además la hora simulada.
const log = crearRegistro(cfg.carpetas.registro, secretos(cfg), () => (cfg.prueba.ahora ? `[prueba ${reloj.ahora().toISOString().slice(0, 16)}Z] ` : ""));
const ARCHIVO_ESTADO = path.join(cfg.carpetas.datos, "estado.json");
const CANDADO = path.join(cfg.carpetas.datos, "trabajador.pid");

// ------------------------------------------------------------------ reloj ----
// Con PRUEBA_AHORA y PRUEBA_ACELERAR (solo en simulación) el tiempo arranca
// donde diga la prueba y corre más rápido; las esperas se acortan igual.
const arranque = Date.now();
const reloj = {
  dePrueba: !!cfg.prueba.ahora,
  ahora() {
    if (!cfg.prueba.ahora) return new Date();
    return new Date(Date.parse(cfg.prueba.ahora) + (Date.now() - arranque) * cfg.prueba.acelerar);
  },
};
/** Milisegundos «del negocio» desde el arranque (acelerados en las pruebas). */
const ms = () => (Date.now() - arranque) * cfg.prueba.acelerar;
const dormir = (milis) => new Promise((r) => setTimeout(r, Math.max(50, milis / cfg.prueba.acelerar)));

// ----------------------------------------------------------------- estado ----
function leerEstado() {
  try {
    const e = JSON.parse(fs.readFileSync(ARCHIVO_ESTADO, "utf8"));
    return { enCurso: e.enCurso || null, reportes: Array.isArray(e.reportes) ? e.reportes : [], bandeja: e.bandeja || {}, cuenta: e.cuenta || {} };
  } catch {
    return { enCurso: null, reportes: [], bandeja: {}, cuenta: {} };
  }
}
function guardarEstado(e) {
  fs.mkdirSync(cfg.carpetas.datos, { recursive: true });
  const tmp = `${ARCHIVO_ESTADO}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(e, null, 1));
  fs.renameSync(tmp, ARCHIVO_ESTADO);
}

function tomarCandado() {
  fs.mkdirSync(cfg.carpetas.datos, { recursive: true });
  try {
    const pid = Number(fs.readFileSync(CANDADO, "utf8"));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        return false; // ya hay uno corriendo
      } catch {
        /* ese proceso ya no existe */
      }
    }
  } catch {
    /* no había candado */
  }
  fs.writeFileSync(CANDADO, String(process.pid));
  return true;
}
function soltarCandado() {
  try {
    if (Number(fs.readFileSync(CANDADO, "utf8")) === process.pid) fs.unlinkSync(CANDADO);
  } catch {
    /* nada que soltar */
  }
}

// --------------------------------------------------------------- reportes ----
/** Entrega al CRM lo guardado. Lo que el CRM rechaza de plano se descarta; lo demás espera a la próxima vuelta. */
async function entregarReportes(estado, crm) {
  while (estado.reportes.length) {
    const r = estado.reportes[0];
    try {
      const res = await crm.llamar(r.ruta, r.cuerpo);
      const extra = r.ruta === "respuesta" ? ` → ${res.coincidencia}${res.clasificacion ? ` · ${res.clasificacion}` : ""}${res.creado ? " · prospecto creado" : ""}` : r.ruta === "rebote" ? ` → ${res.coincidencia}` : ` → ${res.estado || "ok"}`;
      log.info(`reporte ${r.ruta} entregado${r.cuerpo.id ? ` (${r.cuerpo.id})` : ""}${extra}`);
    } catch (e) {
      if (!e.definitivo) {
        log.aviso(`no se pudo entregar un reporte (${r.ruta}): ${e.message}. Quedan ${estado.reportes.length} guardados.`);
        return false;
      }
      log.aviso(`el CRM no aceptó un reporte (${r.ruta}): ${e.message}. Se descarta.`);
    }
    estado.reportes.shift();
    guardarEstado(estado);
  }
  return true;
}

function reportar(estado, ruta, cuerpo) {
  estado.reportes.push({ ruta, cuerpo });
  guardarEstado(estado);
}

// ----------------------------------------------------------------- envíos ----
function esperaAlAzar() {
  const { min, max } = cfg.config.esperaEntreEnviosSegundos;
  return Math.round((min + Math.random() * (max - min)) * 1000);
}

async function enviarUno(linea, estado, crm, correo) {
  const c = (estado.cuenta[linea] = estado.cuenta[linea] || {});
  if ((c.proximo || 0) > ms()) return;
  const sinTrabajo = cfg.config.consultaSinTrabajoSegundos * 1000;

  // Antes de pedirle nada al CRM se confirma que Gmail acepta la cuenta: así un
  // problema de acceso no le gasta intentos a ningún lead.
  try {
    await correo.verificarEnvio(linea);
  } catch (e) {
    c.proximo = ms() + cfg.config.esperaTrasFalloCuentaSegundos * 1000;
    log.error(`[${linea}] Gmail no aceptó la cuenta para enviar (${e.code || ""} ${e.message}). Reintenta en ${cfg.config.esperaTrasFalloCuentaSegundos / 60} min.`);
    return;
  }

  let pedido;
  try {
    pedido = await crm.siguiente(linea);
  } catch (e) {
    c.proximo = ms() + sinTrabajo;
    log.aviso(`[${linea}] no se pudo consultar el CRM: ${e.message}`);
    return;
  }
  const cuenta = pedido.cuenta ? ` · hoy ${pedido.cuenta.usados}/${pedido.cuenta.tope}` : "";
  if (!pedido.envio) {
    c.proximo = ms() + sinTrabajo;
    const motivo = pedido.motivo || (pedido.cuenta && pedido.cuenta.restantes <= 0 ? "tope del día alcanzado" : "nada para enviar ahora");
    if (c.ultimoMotivo !== motivo) log.info(`[${linea}] ${motivo}${cuenta}`);
    c.ultimoMotivo = motivo;
    return;
  }
  c.ultimoMotivo = "";
  const envio = pedido.envio;

  estado.enCurso = { id: envio.id, linea, desde: new Date().toISOString() };
  guardarEstado(estado);
  let reporte;
  try {
    const r = await correo.enviar(linea, envio);
    reporte = { id: envio.id, resultado: "ok", messageId: r.messageId, fecha: reloj.ahora().toISOString(), asunto: envio.asunto, cuerpo: envio.cuerpo };
    log.info(`[${linea}] ${cfg.modo === "real" ? "enviado" : "SIMULADO"} ${envio.paso} a ${tapar(envio.para)} (${envio.id})${cuenta}`);
  } catch (e) {
    const seguro = noSalio(e);
    reporte = { id: envio.id, resultado: seguro ? "fallo" : "incierto", fecha: reloj.ahora().toISOString(), error: `${e.code || ""} ${e.responseCode || ""} ${e.message}`.trim().slice(0, 250) };
    log.error(`[${linea}] ${seguro ? "no salió" : "no se sabe si salió"} ${envio.paso} a ${tapar(envio.para)} (${envio.id}): ${reporte.error}`);
  }
  estado.enCurso = null;
  c.ultimoEnvio = Date.now();
  reportar(estado, "enviado", reporte);

  const espera = esperaAlAzar();
  c.proximo = ms() + espera;
  log.info(`[${linea}] espera ${Math.round(espera / 1000)} s antes del siguiente correo`);
}

// ---------------------------------------------------------------- bandeja ----
async function leerBandeja(linea, estado, correo) {
  const c = (estado.cuenta[linea] = estado.cuenta[linea] || {});
  if ((c.proximaLectura || 0) > ms()) return;
  c.proximaLectura = ms() + cfg.config.leerBandejaSegundos * 1000;
  let leido;
  try {
    leido = await correo.leerNuevos(linea, estado.bandeja[linea] || null);
  } catch (e) {
    log.aviso(`[${linea}] no se pudo leer la bandeja: ${e.code || ""} ${e.message}`);
    return;
  }
  const cuenta = { respuesta: 0, rebote: 0, ignorar: 0 };
  for (const m of leido.mensajes) {
    try {
      const a = await analizar(m.fuente, cfg.cuentas[linea].usuario);
      cuenta[a.tipo]++;
      if (a.tipo !== "ignorar") estado.reportes.push({ ruta: a.tipo, cuerpo: { linea, ...a.cuerpo } });
    } catch (e) {
      cuenta.ignorar++;
      log.aviso(`[${linea}] un mensaje no se pudo leer (${m.clave}): ${e.message}`);
    }
  }
  // La marca y los reportes se guardan juntos: un reinicio no pierde ni repite mensajes.
  estado.bandeja[linea] = leido.marca;
  guardarEstado(estado);
  if (leido.mensajes.length) log.info(`[${linea}] bandeja: ${leido.mensajes.length} nuevos → ${cuenta.respuesta} respuestas, ${cuenta.rebote} rebotes, ${cuenta.ignorar} sin interés`);
}

// -------------------------------------------------------------- principal ----
async function comprobar(crm, correo) {
  let bien = true;
  const r = await crm.comprobar();
  if (r.ok) log.info(`CRM: conexión y secreto correctos (${cfg.crmUrl})`);
  else {
    bien = false;
    log.error(`CRM: ${r.detalle}`);
  }
  for (const linea of cfg.lineas) {
    if (cfg.modo !== "real") {
      log.info(`[${linea}] modo simulación: no se abre ninguna conexión con Gmail`);
      continue;
    }
    for (const [nombre, fn] of [["SMTP (enviar)", correo.verificarEnvio], ["IMAP (leer)", correo.verificarLectura]]) {
      try {
        await fn(linea);
        log.info(`[${linea}] ${nombre}: acceso correcto con ${tapar(cfg.cuentas[linea].usuario)}`);
      } catch (e) {
        bien = false;
        log.error(`[${linea}] ${nombre}: Gmail no aceptó la cuenta (${e.code || ""} ${e.responseCode || ""} ${e.message})`);
      }
    }
  }
  return bien;
}

async function main() {
  const args = process.argv.slice(2);
  const problemas = revisar(cfg);
  if (problemas.length) {
    for (const p of problemas) log.error(p);
    process.exit(1);
  }
  const crm = crearCrm(cfg, reloj);
  const correo = crearCorreo(cfg, log);

  if (args.includes("--comprobar")) {
    process.exit((await comprobar(crm, correo)) ? 0 : 1);
  }
  if (!tomarCandado()) {
    console.log("Ya hay un trabajador de prospección corriendo. Este se cierra.");
    process.exit(0);
  }
  const salir = () => {
    soltarCandado();
    process.exit(0);
  };
  process.on("SIGINT", salir);
  process.on("SIGTERM", salir);

  const iCiclos = args.indexOf("--ciclos");
  const maxCiclos = iCiclos >= 0 ? Math.max(1, Number(args[iCiclos + 1]) || 1) : Infinity;
  const estado = leerEstado();
  // Las esperas se miden desde el arranque. Tras un reinicio se conserva la pausa
  // que faltaba desde el último correo de cada cuenta: nunca salen dos seguidos.
  for (const l of Object.keys(estado.cuenta)) {
    const ultimo = Number(estado.cuenta[l].ultimoEnvio) || 0;
    const falta = ultimo ? esperaAlAzar() - (Date.now() - ultimo) * cfg.prueba.acelerar : 0;
    estado.cuenta[l] = { ultimoEnvio: ultimo, proximo: Math.max(0, falta) };
  }

  log.info(`Arranca · modo ${cfg.modo.toUpperCase()} · cuentas: ${cfg.lineas.map((l) => `${l}=${tapar(cfg.cuentas[l].usuario)}`).join(", ")} · CRM ${cfg.crmUrl}${reloj.dePrueba ? ` · RELOJ DE PRUEBA ${cfg.prueba.ahora} ×${cfg.prueba.acelerar}` : ""}`);
  if (estado.enCurso) {
    log.aviso(`Un envío quedó a mitad en el arranque anterior (${estado.enCurso.id}). Se reporta como incierto: no se repite solo.`);
    estado.reportes.push({ ruta: "enviado", cuerpo: { id: estado.enCurso.id, resultado: "incierto", error: "El trabajador se reinició a mitad del envío." } });
    estado.enCurso = null;
    guardarEstado(estado);
  }

  for (let ciclo = 0; ciclo < maxCiclos; ciclo++) {
    try {
      // Sin reportes al día no se pide nada nuevo: el CRM tiene que saber qué salió antes de entregar más.
      if (await entregarReportes(estado, crm)) {
        for (const linea of cfg.lineas) {
          await enviarUno(linea, estado, crm, correo);
          await entregarReportes(estado, crm);
        }
      }
      for (const linea of cfg.lineas) await leerBandeja(linea, estado, correo);
      await entregarReportes(estado, crm);
      guardarEstado(estado);
    } catch (e) {
      log.error(`vuelta con error: ${e && e.message}`);
    }
    if (ciclo + 1 < maxCiclos) await dormir(cfg.config.cicloSegundos * 1000);
  }
  soltarCandado();
}

process.on("unhandledRejection", (e) => log.error(`promesa sin atender: ${e && e.message}`));
main().catch((e) => {
  log.error(`error fatal: ${e && e.message}`);
  soltarCandado();
  process.exit(1);
});
