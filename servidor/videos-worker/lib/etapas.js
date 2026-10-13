"use strict";
// Proyecto por escenas: un trabajo con `etapa` (contrato: servidor/CONTRATO-PROYECTO-VIDEO.md).
//
//   imagenes   una imagen base por escena (centavos) → se sube y se reporta en cuanto está
//   clips      un clip por escena, desde su imagen YA aprobada → se sube y se reporta
//   armado     une todo, subtitula, dibuja el rótulo del cierre, mezcla música → sube el final
//
// Reglas que se cumplen aquí:
//   · Cada escena se reporta por `progreso` apenas termina; el fallo de una escena se
//     reporta con su motivo y NO tumba el trabajo: se sigue con las demás.
//   · Nada pago se pide dos veces: lo hecho queda en `datos/trabajos/<id>/estado.json`
//     (se retoma tras un reinicio) y la tarea pendiente en el proveedor queda en la
//     carpeta del proyecto (se retoma aunque el CRM mande otro trabajo para esa escena).
//   · Un trabajo sin `etapa` no pasa por aquí: lo atiende lib/trabajo.js como siempre.
const fs = require("fs");
const path = require("path");
const { tamano } = require("./ffmpeg");
const { TrabajoSoltado } = require("./crm");
const { carpetaProyecto, huella, claveUrl, tareaPendiente, recordarTarea } = require("./proyecto");
const { armar, modoAudio } = require("./armado");

const ETAPAS = ["imagenes", "clips", "armado"];
const dos = (n) => String(n).padStart(2, "0");
const redondo = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

function leerEstado(carpeta) {
  try {
    return JSON.parse(fs.readFileSync(path.join(carpeta, "estado.json"), "utf8"));
  } catch {
    return null;
  }
}

function guardarEstado(carpeta, estado) {
  const archivo = path.join(carpeta, "estado.json");
  fs.writeFileSync(`${archivo}.tmp`, JSON.stringify(estado, null, 1));
  fs.renameSync(`${archivo}.tmp`, archivo);
}

const ENCABEZADO = "fecha,trabajo,guion,version,formato,etapa,proveedor,modelos,resultado,segundos_video,imagenes,segundos_generados,costo_estimado_usd,creditos";

/**
 * Una línea por trabajo en `registro/costos.csv`. `etapa`: completo | imagenes | clips | armado | un-clip | una-imagen.
 * Si el archivo viene de una versión anterior (otras columnas), se aparta con otro nombre y se empieza uno nuevo.
 */
function anotarCosto(cfg, fila) {
  try {
    fs.mkdirSync(cfg.carpetas.registro, { recursive: true });
    const archivo = path.join(cfg.carpetas.registro, "costos.csv");
    if (fs.existsSync(archivo)) {
      const primera = fs.readFileSync(archivo, "utf8").split(/\r?\n/)[0].trim();
      if (primera !== ENCABEZADO) fs.renameSync(archivo, path.join(cfg.carpetas.registro, `costos-hasta-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}.csv`));
    }
    if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, ENCABEZADO + "\n");
    const t = fila.trabajo || {};
    const v = (x) => (x === null || x === undefined || x === "" ? "" : x);
    fs.appendFileSync(
      archivo,
      [
        new Date().toISOString(), v(t.id), v(t.guionId), v(t.version), v(t.formato), fila.etapa, fila.proveedor, `"${(fila.modelos || []).join(" ")}"`, fila.resultado,
        v(fila.segundosVideo !== undefined ? redondo(fila.segundosVideo) : ""), v(fila.imagenes || ""), v(fila.segundosGenerados ? redondo(fila.segundosGenerados) : fila.segundosGenerados === 0 ? 0 : ""),
        v(typeof fila.costoUsd === "number" ? redondo(fila.costoUsd, 3) : ""), v(fila.creditos ? redondo(fila.creditos, 2) : ""),
      ].join(",") + "\n",
    );
  } catch {
    /* el registro de costos no debe tumbar un trabajo */
  }
}

/** Marca los errores de hablar con el CRM: esos sí tumban el trabajo (se reintenta entero, sin pagar de nuevo). */
async function conCrm(promesa) {
  try {
    return await promesa;
  } catch (e) {
    if (e && !(e instanceof TrabajoSoltado)) e.delCrm = true;
    throw e;
  }
}

async function procesarEtapa(trabajo, deps) {
  const { cfg, crm, ff, registro } = deps;
  const etapa = trabajo.etapa;
  const carpeta = path.join(cfg.carpetas.trabajos, trabajo.id);
  fs.mkdirSync(carpeta, { recursive: true });
  const previo = leerEstado(carpeta);
  const estado = {
    trabajo,
    enCurso: true,
    escenas: (previo && previo.escenas) || {},
    creditos: (previo && previo.creditos) || 0,
    segundosGenerados: (previo && previo.segundosGenerados) || 0,
    imagenes: (previo && previo.imagenes) || 0,
    costoUsd: previo && typeof previo.costoUsd === "number" ? previo.costoUsd : null,
    costoDesconocido: !!(previo && previo.costoDesconocido),
    modelos: (previo && previo.modelos) || [],
  };
  guardarEstado(carpeta, estado);
  const guardar = () => guardarEstado(carpeta, estado);

  const lista = Array.isArray(trabajo.escenas) ? trabajo.escenas : [];
  const total = etapa === "armado" ? 2 : lista.length;
  let hecho = 0;
  let ultimoLatido = 0;
  const fase = etapa === "armado" ? "montando" : "generando";
  const gasto = () => ({
    segundosGenerados: redondo(estado.segundosGenerados),
    ...(estado.costoDesconocido || estado.costoUsd === null ? {} : { costoEstimadoUsd: redondo(estado.costoUsd, 3) }),
  });
  /** Latido al CRM. `escenas`: resultados de escena que se reportan YA (contrato: `progreso.escenas`). */
  async function reportar(detalle, forzar = false, escenas = null) {
    if (!forzar && !escenas && Date.now() - ultimoLatido < 20000) return;
    ultimoLatido = Date.now();
    return conCrm(crm.progreso(trabajo, { estado: fase, progreso: { hecho, total, detalle: String(detalle).slice(0, 200) }, ...gasto(), ...(escenas ? { escenas } : {}) }));
  }

  const nombreProveedor = etapa === "imagenes" ? (deps.proveedorImagen || {}).nombre || "sin-proveedor" : etapa === "clips" ? deps.proveedor.nombre : "armado";
  try {
    if (!ETAPAS.includes(etapa)) throw new Error(`Etapa desconocida: «${String(etapa).slice(0, 40)}». Este trabajador conoce: ${ETAPAS.join(", ")}.`);
    registro.info(`Trabajo ${trabajo.id}: etapa «${etapa}» de ${trabajo.guionId || "?"} v${trabajo.version ?? "?"}, ${etapa === "armado" ? (trabajo.todas || lista).length : lista.length} escena(s), ${trabajo.relacionAspecto}, proveedor ${nombreProveedor}`);
    const proyecto = carpetaProyecto(cfg, trabajo);
    await reportar("Empezando", true);

    // ================================================== armado ====
    if (etapa === "armado") {
      const r = await armar({ cfg, ff, registro, trabajo, carpeta: proyecto, latir: (d) => reportar(d) });
      hecho = 1;
      await reportar("Subiendo el video al CRM", true);
      const respuesta = await conCrm(
        crm.entregar(
          trabajo,
          r.archivo,
          {
            duracion: redondo(r.duracion, 2),
            proveedor: "armado",
            modelos: [],
            sinVoz: r.sinVoz,
            avisos: [...r.avisos, `Audio: ${r.modo === "ninguno" ? "ninguno" : r.sinVoz ? "sin voz" : r.modo === "veo" ? "el de los clips" : "voz de ElevenLabs"}${r.conMusica ? ", con música" : ""}.`, `Armado en ${r.segundos} s (escenas codificadas: ${r.stats.segmentosHechos}; reutilizadas: ${r.stats.segmentosReutilizados}; descargas: ${r.stats.descargas}).`],
            segundosGenerados: 0,
          },
          { tipo: "final" },
        ),
      );
      fs.mkdirSync(cfg.carpetas.entregados, { recursive: true });
      fs.copyFileSync(r.archivo, path.join(cfg.carpetas.entregados, `${trabajo.id}.mp4`));
      anotarCosto(cfg, { trabajo, etapa, proveedor: "armado", modelos: [], resultado: "listo", segundosVideo: r.duracion, segundosGenerados: 0, costoUsd: 0 });
      fs.rmSync(carpeta, { recursive: true, force: true });
      registro.info(`Trabajo ${trabajo.id}: video armado y entregado (${redondo(r.duracion)} s). Queda por aprobar en el CRM.`);
      return { ok: true, respuesta, armado: r };
    }

    // ======================================= imagenes y clips ====
    const tipo = etapa === "imagenes" ? "imagen" : "clip";
    const { ancho, alto } = tamano(trabajo.relacionAspecto, cfg.config.salida.ladoCorto);
    const contexto = trabajo.contexto || {};
    const fotos = (Array.isArray(contexto.fotos) ? contexto.fotos : []).filter((u) => typeof u === "string" && u);
    if (etapa === "imagenes") {
      if (!deps.proveedorImagen) throw new Error(deps.faltaImagen || "Este servidor no tiene proveedor de imagen configurado (PROVEEDOR_IMAGEN).");
      const falta = deps.proveedorImagen.comprobar(cfg);
      if (falta) throw new Error(falta);
    }
    const audio = etapa === "clips" ? (() => {
      const m = modoAudio(cfg, trabajo);
      return m === "veo" && !deps.proveedor.daAudio ? "elevenlabs" : m;
    })() : "ninguno";
    let cortar = null; // motivo de cuenta (clave, saldo): las escenas que faltan fallarían igual y no se piden
    let buenas = 0;

    for (const escena of lista) {
      const n = escena.n;
      let memo = estado.escenas[n] || {};
      if (memo.reportada) {
        hecho++;
        if (!memo.error) buenas++;
        continue;
      }
      try {
        if (cortar) throw Object.assign(new Error(cortar), { yaDicho: true });
        if (escena.tipo && escena.tipo !== "generada") throw new Error(`La escena ${n} es de tipo «${escena.tipo}»: su clip lo fabrica el armado, no se genera.`);

        let archivo = memo.archivo && fs.existsSync(path.join(carpeta, memo.archivo)) ? memo.archivo : null;
        if (!archivo) {
          await reportar(`Escena ${n}: ${tipo === "imagen" ? "imagen base" : "clip"} (${hecho + 1} de ${total})`, true);
          let r;
          if (tipo === "imagen") {
            const prompt = String(escena.promptImagen || "").trim();
            if (!prompt) throw new Error(`La escena ${n} no trae el texto de la imagen (promptImagen).`);
            // La clave NO lleva el número de escena (el CRM puede reordenar): va por lo que se pidió.
            const clave = `imagen:${huella(prompt, fotos.map((u) => claveUrl(u)), trabajo.relacionAspecto)}`;
            r = await deps.proveedorImagen.generarImagen({
              cfg, registro, ff, trabajo, escena, prompt, referencias: fotos, analisis: String(contexto.analisisProducto || ""),
              carpeta, base: `imagen-${dos(n)}`, ancho, alto, relacion: trabajo.relacionAspecto,
              memoria: tareaPendiente(proyecto, clave),
              recordar: (m) => recordarTarea(proyecto, clave, m),
              latir: (d) => reportar(d),
            });
            archivo = r.archivo;
            if (!archivo || !fs.existsSync(path.join(carpeta, archivo)) || fs.statSync(path.join(carpeta, archivo)).size < 500) throw new Error(`El proveedor no dejó una imagen válida para la escena ${n}.`);
            estado.imagenes++;
            // La imagen ya está pagada: se anota de una vez, por si el paso a JPG falla.
            estado.escenas[n] = { archivo, creditos: typeof r.creditos === "number" ? r.creditos : null, modelo: r.modelo };
            guardar();
            // Al CRM siempre se le sube JPG (el proveedor puede devolver PNG o WebP).
            if (!/\.jpe?g$/i.test(archivo)) {
              const jpg = `imagen-${dos(n)}.jpg`;
              await ff.ffmpeg(["-i", archivo, "-frames:v", "1", "-q:v", "2", "-pix_fmt", "yuvj420p", "-update", "1", jpg], carpeta);
              archivo = jpg;
            }
            if ((await ff.dimensiones(archivo, carpeta)).ancho < 16) throw new Error(`La imagen de la escena ${n} no se pudo leer.`);
          } else {
            const imagen = escena.imagen || {};
            if (!imagen.url) throw new Error(`La escena ${n} no tiene imagen base: primero se genera y se aprueba la imagen.`);
            if (imagen.estado && imagen.estado !== "aprobada") throw new Error(`La imagen de la escena ${n} no está aprobada (${imagen.estado}): no se genera el clip.`);
            const prompt = String(escena.promptVideo || "").trim();
            if (!prompt) throw new Error(`La escena ${n} no trae el texto del clip (promptVideo).`);
            const clave = `clip:${huella(prompt, claveUrl(imagen.url, imagen.intentos || 0), trabajo.relacionAspecto, audio, audio === "veo" ? escena.voz || "" : "")}`;
            archivo = `clip-${dos(n)}.mp4`;
            r = await deps.proveedor.generarEscena({
              cfg, registro, ff,
              // El proveedor de video recibe la imagen aprobada como «foto» de la escena: es su primer fotograma.
              trabajo: { ...trabajo, imagenesProducto: [imagen.url], opciones: { ...(trabajo.opciones || {}) } },
              escena: { n, nombre: escena.nombre || `Escena ${n}`, prompt, duracion: Number(escena.duracion) > 0 ? Number(escena.duracion) : 4, usaImagenProducto: true, voz: escena.voz || "" },
              primerFotograma: true,
              carpeta, salida: archivo, ancho, alto, relacion: trabajo.relacionAspecto, audio,
              memoria: tareaPendiente(proyecto, clave),
              recordar: (m) => recordarTarea(proyecto, clave, m),
              latir: (d) => reportar(d),
            });
            if ((await ff.duracion(archivo, carpeta)) <= 0.5) throw new Error(`El proveedor no dejó un clip válido para la escena ${n}.`);
            estado.segundosGenerados += r.segundos || 0;
          }
          memo = { archivo, creditos: typeof r.creditos === "number" ? r.creditos : null, segundos: tipo === "clip" ? r.segundos || 0 : null, modelo: r.modelo };
          estado.escenas[n] = memo;
          if (typeof r.costoUsd === "number") estado.costoUsd = (estado.costoUsd || 0) + r.costoUsd;
          else estado.costoDesconocido = true;
          if (memo.creditos) estado.creditos += memo.creditos;
          if (r.modelo && !estado.modelos.includes(r.modelo)) estado.modelos.push(r.modelo);
          guardar();
        } else {
          registro.info(`Trabajo ${trabajo.id}: ${tipo === "imagen" ? "la imagen" : "el clip"} de la escena ${n} ya estaba, no se vuelve a pedir`);
        }

        hecho++;
        // Subir y reportar. El CRM contesta por escena si la registró (`ok`); si dice que no
        // (el archivo aún no estaba, la ruta no era la entregada), se sube y se reporta UNA vez más.
        for (let vuelta = 1; ; vuelta++) {
          if (!memo.ruta) {
            memo.ruta = await conCrm(crm.subir(trabajo, path.join(carpeta, archivo), { tipo, escena: n }));
            estado.escenas[n] = memo;
            guardar();
          }
          const resp = await reportar(`Escena ${n}: ${tipo === "imagen" ? "imagen lista" : "clip listo"} (${hecho} de ${total})`, true, [
            { n, tipo, ruta: memo.ruta, ...(memo.creditos !== null && memo.creditos !== undefined ? { creditos: memo.creditos } : {}), ...(tipo === "clip" ? { segundos: memo.segundos } : {}) },
          ]);
          const acuse = resp && Array.isArray(resp.escenas) ? resp.escenas.find((x) => x && x.n === n && x.tipo === tipo) : null;
          if (!acuse || acuse.ok !== false) break;
          memo.ruta = null;
          estado.escenas[n] = memo;
          guardar();
          if (vuelta >= 2) throw Object.assign(new Error(`El CRM no registró ${tipo === "imagen" ? "la imagen" : "el clip"} de la escena ${n}: ${String(acuse.error || "sin motivo").slice(0, 200)}`), { delCrm: true });
          registro.aviso(`Trabajo ${trabajo.id}: el CRM no registró la escena ${n} (${String(acuse.error || "sin motivo").slice(0, 120)}); se sube de nuevo.`);
        }
        memo.reportada = true;
        estado.escenas[n] = memo;
        guardar();
        buenas++;
      } catch (e) {
        // El CRM retiró el trabajo o no responde: eso sí es del trabajo entero.
        if (e instanceof TrabajoSoltado || (e && e.delCrm)) throw e;
        const motivo = registro.limpiar(e && e.message ? e.message : String(e)).slice(0, 400);
        if (!e.yaDicho) registro.error(`Trabajo ${trabajo.id}: falló ${tipo === "imagen" ? "la imagen" : "el clip"} de la escena ${n}: ${motivo}`);
        if (e && (e.deLaCuenta || e.code === 401 || e.code === 402)) cortar = `No se pidió: ${motivo}`;
        hecho++;
        await reportar(`Escena ${n}: falló`, true, [{ n, tipo, error: motivo }]);
        estado.escenas[n] = { ...memo, reportada: true, error: motivo };
        guardar();
      }
    }

    await conCrm(crm.cerrar(trabajo, { etapa, ...(estado.creditos ? { creditos: redondo(estado.creditos, 2) } : {}), ...(etapa === "clips" ? { segundosGenerados: redondo(estado.segundosGenerados) } : {}) }));
    anotarCosto(cfg, {
      trabajo, etapa, proveedor: nombreProveedor, modelos: estado.modelos, resultado: buenas === lista.length ? "listo" : buenas ? "parcial" : "fallo",
      imagenes: estado.imagenes, segundosGenerados: etapa === "clips" ? estado.segundosGenerados : "", costoUsd: estado.costoDesconocido ? null : estado.costoUsd, creditos: estado.creditos,
    });
    fs.rmSync(carpeta, { recursive: true, force: true });
    registro.info(`Trabajo ${trabajo.id}: etapa «${etapa}» cerrada: ${buenas} de ${lista.length} escena(s) por aprobar${buenas < lista.length ? `, ${lista.length - buenas} con fallo` : ""}${estado.creditos ? `, ${redondo(estado.creditos, 2)} créditos` : ""}.`);
    return { ok: true, buenas, fallidas: lista.length - buenas };
  } catch (e) {
    if (e instanceof TrabajoSoltado) {
      registro.aviso(`Trabajo ${trabajo.id}: el CRM lo retiró (${e.message}). Se deja; lo ya generado queda guardado.`);
      guardarEstado(carpeta, { ...estado, enCurso: false });
      return { ok: false, soltado: true };
    }
    const motivo = registro.limpiar(e && e.message ? e.message : String(e)).slice(0, 600);
    registro.error(`Trabajo ${trabajo.id}: falló la etapa «${etapa}»: ${motivo}`);
    guardarEstado(carpeta, { ...estado, enCurso: false });
    try {
      const r = await crm.fallo(trabajo, { motivo, ...gasto() });
      if (r && r.estado === "fallo") {
        registro.error(`Trabajo ${trabajo.id}: quedó en FALLO definitivo. No bloquea la cola.`);
        anotarCosto(cfg, { trabajo, etapa: ETAPAS.includes(etapa) ? etapa : "desconocida", proveedor: nombreProveedor, modelos: estado.modelos, resultado: "fallo", imagenes: estado.imagenes, segundosGenerados: estado.segundosGenerados, costoUsd: estado.costoDesconocido ? null : estado.costoUsd, creditos: estado.creditos });
        fs.rmSync(carpeta, { recursive: true, force: true });
      } else {
        registro.aviso(`Trabajo ${trabajo.id}: vuelve a la cola; el CRM lo entrega de nuevo desde ${(r && r.reintentaDesde) || "ya"}.`);
      }
    } catch (e2) {
      registro.error(`Trabajo ${trabajo.id}: no se pudo reportar el fallo al CRM (${registro.limpiar(e2.message)}). El CRM lo recuperará al vencer la toma.`);
    }
    return { ok: false };
  }
}

/**
 * Prueba de UNA sola imagen con el proveedor de imagen configurado: sin CRM, sin video.
 * Con Kie SÍ gasta (lo mínimo que se puede pedir: una imagen).
 */
async function unaImagen(deps, prompt, fotos = [], relacion = "9:16") {
  const { cfg, ff, registro, proveedorImagen } = deps;
  const carpeta = path.join(cfg.carpetas.datos, "una-imagen");
  fs.mkdirSync(carpeta, { recursive: true });
  const memoArchivo = path.join(carpeta, "tarea.json");
  let memoria = null;
  try {
    memoria = JSON.parse(fs.readFileSync(memoArchivo, "utf8"));
  } catch {
    /* primera vez */
  }
  const { ancho, alto } = tamano(relacion, cfg.config.salida.ladoCorto);
  registro.aviso(`PRUEBA DE UNA IMAGEN con «${proveedorImagen.nombre}»${fotos.length ? ` y ${fotos.length} foto(s) de referencia` : ""}. Esto SÍ gasta si el proveedor es real.`);
  const trabajo = { id: "una-imagen", formato: "prueba", relacionAspecto: relacion, opciones: {} };
  const r = await proveedorImagen.generarImagen({
    cfg, registro, ff, trabajo, escena: { n: 1 }, prompt, referencias: fotos, analisis: "", carpeta, base: `una-imagen-${proveedorImagen.nombre}`, ancho, alto, relacion, memoria,
    recordar: (m) => (m ? fs.writeFileSync(memoArchivo, JSON.stringify(m)) : fs.rmSync(memoArchivo, { force: true })),
    latir: async (d) => registro.info(d),
  });
  const d = await ff.dimensiones(r.archivo, carpeta);
  registro.info(`Imagen lista: ${path.join(carpeta, r.archivo)} · ${d.ancho}x${d.alto} · modelo ${r.modelo}${typeof r.creditos === "number" ? ` · ${r.creditos} créditos` : ""}${typeof r.costoUsd === "number" ? ` · ≈ US$ ${r.costoUsd}` : ""}`);
  anotarCosto(cfg, { trabajo: { id: "una-imagen", formato: "prueba" }, etapa: "una-imagen", proveedor: proveedorImagen.nombre, modelos: [r.modelo], resultado: "listo", imagenes: 1, costoUsd: r.costoUsd, creditos: r.creditos || 0 });
  return { ...r, archivo: path.join(carpeta, r.archivo), ...d };
}

module.exports = { procesarEtapa, unaImagen, anotarCosto, ENCABEZADO };
