"use strict";
// Trabajador de videos de Reditus. Proceso residente: cada minuto le pregunta
// al CRM si hay un trabajo pendiente y lo atiende. Hay dos clases de trabajo:
//   · con `etapa` (proyecto por escenas): «imagenes», «clips» o «armado»  → lib/etapas.js
//   · sin `etapa` (video completo, como antes): genera, monta y sube        → lib/trabajo.js
//
//   node trabajador.js              queda corriendo (así lo arranca la tarea de Windows)
//   node trabajador.js --una-vez    atiende lo que haya en la cola y termina
//   node trabajador.js --comprobar  revisa configuración, ffmpeg y conexión, y termina
//   node trabajador.js --un-clip ["prompt"]   genera UN clip corto con el proveedor del .env (gasta lo mínimo) y termina
//   node trabajador.js --plantillas-captions  lista las plantillas de subtítulos de la cuenta de Captions (nombre e id) y termina
//   node trabajador.js --una-imagen ["prompt"] [--foto https://…]   genera UNA imagen base con el proveedor de imagen (gasta lo mínimo) y termina
const fs = require("fs");
const path = require("path");
const { cargar, secretos } = require("./lib/entorno");
const { crearRegistro } = require("./lib/registro");
const { crearCrm } = require("./lib/crm");
const { crear: crearFf } = require("./lib/ffmpeg");
const { ErrorHttp } = require("./lib/red");
const { cargarProveedor } = require("./proveedores");
const { cargarProveedorImagen } = require("./proveedores-imagen");
const { procesar, pendientesEnDisco, limpiarRestos, unClip } = require("./lib/trabajo");
const { unaImagen } = require("./lib/etapas");
const { crearLimites } = require("./lib/limites");
const { atenderCola } = require("./lib/cola");

const modo = process.argv.includes("--plantillas-captions") ? "plantillas-captions" : process.argv.includes("--una-imagen") ? "una-imagen" : process.argv.includes("--un-clip") ? "un-clip" : process.argv.includes("--comprobar") ? "comprobar" : process.argv.includes("--una-vez") ? "una-vez" : "residente";

function vivo(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

async function principal() {
  let cfg;
  try {
    cfg = cargar();
  } catch (e) {
    console.error(`No se pudo leer la configuración: ${e.message}`);
    process.exit(1);
  }
  for (const c of Object.values(cfg.carpetas)) fs.mkdirSync(c, { recursive: true });

  if (modo === "plantillas-captions") {
    // No toca el CRM ni genera nada: solo le pregunta a Captions qué plantillas tiene la cuenta.
    const captions = require("./lib/captions");
    if (!captions.disponible(cfg)) {
      console.error("Falta CAPTIONS_API_KEY en el .env (se crea en platform.mirage.app → API Keys).");
      process.exit(1);
    }
    try {
      const lista = await captions.plantillas(cfg);
      console.log(`Plantillas de subtítulos de la cuenta de Captions (${lista.length}):\n`);
      for (const p of lista.sort((a, b) => a.nombre.localeCompare(b.nombre))) console.log(`  ${p.nombre.padEnd(22)} ${p.id}`);
      console.log("\nPara usar una por defecto: config.json → captions → plantilla (el nombre o el id) y porDefecto: true.");
      process.exit(0);
    } catch (e) {
      console.error(`No se pudieron leer las plantillas: ${String(e.message).split(cfg.captionsKey).join("[clave oculta]")}`);
      process.exit(1);
    }
  }
  const registro = crearRegistro(cfg.carpetas.registro, secretos(cfg));

  // ------------------------------------------------- comprobaciones ----
  const faltas = [];
  // Las pruebas de un clip y de una imagen no tocan el CRM: no necesitan su dirección ni el secreto.
  const suelto = modo === "un-clip" || modo === "una-imagen";
  if (!suelto && !/^https?:\/\//.test(cfg.crmUrl)) faltas.push("CRM_URL (la dirección del CRM, con https://)");
  if (!suelto && !cfg.secreto) faltas.push("SERVIDOR_SECRET (el mismo valor que tiene el CRM en Vercel)");
  let proveedor = null;
  try {
    proveedor = cargarProveedor(cfg.proveedor);
    const falta = modo === "una-imagen" ? null : proveedor.comprobar(cfg);
    if (falta) faltas.push(falta);
  } catch (e) {
    faltas.push(e.message);
  }
  // Proveedor de imagen (etapa «imagenes»). Si le falta algo NO impide arrancar: los clips y el
  // armado siguen funcionando; los trabajos de imágenes fallarán diciendo qué falta.
  let proveedorImagen = null;
  let faltaImagen = null;
  try {
    proveedorImagen = cargarProveedorImagen(cfg.proveedorImagen);
    faltaImagen = proveedorImagen.comprobar(cfg);
  } catch (e) {
    faltaImagen = e.message;
  }
  if (modo === "una-imagen" && faltaImagen) faltas.push(faltaImagen);
  const ff = crearFf(cfg);
  let versionFf = "";
  try {
    versionFf = await ff.comprobar();
  } catch (e) {
    faltas.push(e.message);
  }
  if (faltas.length) {
    registro.error(`No se puede arrancar. Falta en el .env o en el equipo: ${faltas.join(" · ")}`);
    process.exit(1);
  }
  const voz = proveedor.daAudio ? "audio según config.json (el de Veo o ElevenLabs)" : cfg.elevenKey && cfg.elevenVoz ? "con voz (ElevenLabs)" : "SIN voz (no hay clave de ElevenLabs)";
  registro.info(`Trabajador «${cfg.nombre}» · proveedor ${proveedor.nombre} · imágenes ${proveedorImagen ? proveedorImagen.nombre : "sin proveedor"} · ${voz} · ${versionFf} · CRM ${cfg.crmUrl} · modo ${modo}`);
  if (proveedor.nombre === "simulado") registro.aviso("PROVEEDOR=simulado: los videos son de PRUEBA (clips de color con texto). Para videos reales, PROVEEDOR=kie.");

  if (faltaImagen) registro.aviso(`Imágenes base: ${faltaImagen} Mientras tanto, los trabajos de la etapa «imagenes» fallarán con ese motivo.`);
  else if (proveedorImagen.nombre === "simulado" && proveedor.nombre !== "simulado") registro.aviso("PROVEEDOR_IMAGEN=simulado: las imágenes base son de PRUEBA.");

  const crm = crearCrm(cfg);
  // Límites de paralelismo, compartidos por todos los trabajos en curso (config.json → paralelo).
  const limites = crearLimites(cfg);
  const P = limites.ajustes;
  registro.info(`Paralelismo: ${P.trabajos} trabajos a la vez · ${P.imagenes} imágenes · ${P.clips} clips · ${P.armados} armado(s) · ffmpeg con ${P.hilosFfmpeg} hilo(s)${P.prioridadBaja ? " y prioridad baja" : ""} · equipo de ${P.nucleos} núcleos`);
  const deps = { cfg, crm, ff, proveedor, proveedorImagen: faltaImagen && !proveedorImagen ? null : proveedorImagen, faltaImagen, registro, limites };

  if (modo === "una-imagen") {
    const i = process.argv.indexOf("--una-imagen");
    const dado = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
    const fotos = process.argv.map((a, k) => (a === "--foto" ? process.argv[k + 1] : null)).filter((u) => u && /^https:\/\//.test(u));
    const prompt = dado || "Una taza de café humeante sobre una mesa de madera, luz natural de la mañana, foto tomada con un celular, formato vertical.";
    try {
      // El saldo es de la cuenta de Kie, sea cual sea el proveedor de video del .env.
      const saldo = proveedorImagen.nombre === "kie" ? () => require("./proveedores/kie").creditos(cfg) : null;
      if (process.argv.includes("--foto") && !fotos.length) registro.aviso("La foto de --foto se ignoró: debe ser un enlace público que empiece por https://");
      if (saldo) registro.info(`Créditos antes: ${await saldo()}`);
      await unaImagen(deps, prompt, fotos);
      if (saldo) registro.info(`Créditos después: ${await saldo()}`);
      process.exit(0);
    } catch (e) {
      registro.error(`La prueba de una imagen falló: ${registro.limpiar(e.message)}`);
      process.exit(1);
    }
  }

  if (modo === "un-clip") {
    const i = process.argv.indexOf("--un-clip");
    const dado = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "";
    const prompt = dado || "Plano fijo de una taza de café humeante sobre una mesa de madera, luz natural de la mañana, grabado con un celular, formato vertical.";
    try {
      if (typeof proveedor.creditos === "function") registro.info(`Créditos antes: ${await proveedor.creditos(cfg)}`);
      await unClip(deps, prompt);
      if (typeof proveedor.creditos === "function") registro.info(`Créditos después: ${await proveedor.creditos(cfg)}`);
      process.exit(0);
    } catch (e) {
      registro.error(`La prueba de un clip falló: ${registro.limpiar(e.message)}`);
      process.exit(1);
    }
  }

  /** Pide el siguiente trabajo al CRM. Nunca lanza: si algo falla, lo registra y devuelve null. */
  async function tomar(extra) {
    try {
      return await crm.tomar(extra);
    } catch (e) {
      if (e instanceof ErrorHttp && e.estado === 401) registro.error("El CRM rechazó el secreto (401): SERVIDOR_SECRET no coincide con el de Vercel.");
      else if (e instanceof ErrorHttp && e.estado === 503) registro.error("El CRM responde 503: allá no está configurado SERVIDOR_SECRET.");
      else registro.error(`No se pudo consultar la cola: ${e.message}`);
      return null;
    }
  }

  if (modo === "comprobar") {
    try {
      // Con un trabajador ya corriendo esta llamada no estorba: si hubiera algo pendiente NO se toma aquí.
      const res = await fetch(`${cfg.crmUrl}/api/servidor/trabajos/00000000-000000-000000000000/progreso`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.secreto}`, "content-type": "application/json" },
        body: JSON.stringify({ toma: "comprobacion", estado: "generando" }),
        signal: AbortSignal.timeout(30000),
      });
      // 409 = el secreto sirve (el trabajo de mentira no existe). 401/503 = problema de secreto.
      if (res.status === 409) registro.info("Conexión con el CRM: correcta (el secreto coincide).");
      else if (res.status === 401) registro.error("Conexión con el CRM: el secreto NO coincide (401).");
      else if (res.status === 503) registro.error("Conexión con el CRM: allá falta SERVIDOR_SECRET (503).");
      else registro.aviso(`Conexión con el CRM: respuesta inesperada ${res.status}. ¿CRM_URL es la dirección correcta?`);
      process.exit(res.status === 409 ? 0 : 1);
    } catch (e) {
      registro.error(`No se pudo llegar al CRM en ${cfg.crmUrl}: ${e.message}`);
      process.exit(1);
    }
  }

  // Un solo trabajador por carpeta: dos a la vez se pisarían los archivos.
  const cerrojo = path.join(cfg.carpetas.datos, "trabajador.pid");
  if (fs.existsSync(cerrojo)) {
    const otro = Number(fs.readFileSync(cerrojo, "utf8").trim());
    if (otro && otro !== process.pid && vivo(otro)) {
      registro.aviso(`Ya hay un trabajador corriendo aquí (proceso ${otro}). Este se cierra.`);
      process.exit(0);
    }
  }
  fs.writeFileSync(cerrojo, String(process.pid));
  const soltarCerrojo = () => {
    try {
      if (fs.readFileSync(cerrojo, "utf8").trim() === String(process.pid)) fs.unlinkSync(cerrojo);
    } catch {
      /* ya no estaba */
    }
  };
  process.on("exit", soltarCerrojo);
  for (const s of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(s, () => process.exit(0));
  process.on("unhandledRejection", (e) => registro.error("Error no atendido:", e instanceof Error ? e : String(e)));

  // ------------------------------------------------------- el ciclo ----
  // Varios trabajos a la vez. Lo que quedó a medias en disco cuando se cerró el proceso va primero.
  const aMedias = pendientesEnDisco(cfg);
  for (const t of aMedias) registro.info(`Retomando el trabajo ${t.id}, que quedó a medias cuando se cerró el proceso.`);
  limpiarRestos(cfg);
  let vueltas = 0;
  await atenderCola({
    tomar,
    procesar: (t) => procesar(t, deps),
    max: P.trabajos,
    cupoUrgentes: P.cupoUrgentes,
    iniciales: aMedias,
    unaVez: modo === "una-vez",
    intervaloMs: Math.max(10, cfg.config.intervaloSegundos || 60) * 1000,
    conTrabajoMs: P.consultarConTrabajoSegundos * 1000,
    cadaVuelta: () => {
      if (++vueltas % 60 === 0) limpiarRestos(cfg);
    },
    registro,
  });
  registro.info("Cola atendida. Fin (--una-vez).");
  process.exit(0);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
