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
const { carpetaProyecto, carpetaCache, huella, claveUrl, tareaPendiente, recordarTarea } = require("./proyecto");
const { crearLimites, prioridadDe, crearPresupuesto } = require("./limites");
const { armar } = require("./armado");
const { analizar } = require("./analisis");
const { decidirAudio, seHabla, audioYaEnPrompt } = require("./habla");
const vozTts = require("./voz");

const ETAPAS = ["imagenes", "clips", "armado", "analisis"];
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
  const total = etapa === "armado" ? 2 : etapa === "analisis" ? 1 : lista.length;
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

  const nombreProveedor = etapa === "imagenes" ? (deps.proveedorImagen || {}).nombre || "sin-proveedor" : etapa === "clips" ? deps.proveedor.nombre : etapa === "analisis" ? "analisis" : "armado";

  // Paralelismo: los límites son de TODO el proceso (los comparte cada trabajo en curso).
  const limites = deps.limites || crearLimites(cfg);
  const prioridad = prioridadDe(trabajo);
  const grupo = String(trabajo.guionId || trabajo.id);
  // Medición (ms, sumados sobre las escenas del trabajo): turno = esperando cupo aquí; cola = en la
  // cola del proveedor; generacion = el proveedor generando; subida = subir y reportar al CRM.
  const T = { inicio: Date.now(), turno: 0, cola: 0, generacion: 0, subida: 0, armado: 0 };
  const anotarTiempos = (resultado, escenas) => anotarTiempo(cfg, { trabajo, etapa, escenas, prioridad, T, resultado });
  // Latido de fondo: mientras el trabajo espera turno, el CRM debe seguir viéndolo vivo.
  let ultimoDetalle = "En espera de turno";
  let retirado = null;
  const latidoFondo = setInterval(() => {
    reportar(ultimoDetalle).catch((e) => {
      if (e instanceof TrabajoSoltado) retirado = e;
    });
  }, 45000);
  if (latidoFondo.unref) latidoFondo.unref();
  try {
    if (!ETAPAS.includes(etapa)) throw new Error(`Etapa desconocida: «${String(etapa).slice(0, 40)}». Este trabajador conoce: ${ETAPAS.join(", ")}.`);
    registro.info(`Trabajo ${trabajo.id}: etapa «${etapa}» de ${trabajo.guionId || "?"} v${trabajo.version ?? "?"}, ${etapa === "armado" ? (trabajo.todas || lista).length : lista.length} escena(s), ${trabajo.relacionAspecto}, proveedor ${nombreProveedor}`);
    await reportar("Empezando", true);

    // ================================================ analisis ====
    // Clonar un anuncio: se desarma el video de referencia (cortes, fotogramas, audio). No cuesta.
    if (etapa === "analisis") {
      const r = await limites.armado.usar({ prioridad, grupo }, async (espera) => {
        T.turno += espera;
        if (retirado) throw retirado;
        const t0 = Date.now();
        try {
          return await analizar({ cfg, ff, registro, trabajo, carpeta, subir: (archivo, que) => conCrm(crm.subir(trabajo, archivo, que)), latir: (d) => ((ultimoDetalle = d), reportar(d)) });
        } finally {
          T.armado += Date.now() - t0;
        }
      });
      hecho = total;
      const respuesta = await conCrm(crm.cerrar(trabajo, { etapa, ...r.resultado }));
      fs.rmSync(carpeta, { recursive: true, force: true });
      const tiempos = anotarTiempos("listo", r.resultado.tomas.length);
      registro.info(`Trabajo ${trabajo.id}: análisis entregado: ${redondo(r.resultado.duracion)} s, ${r.resultado.tomas.length} toma(s), ${r.fotogramas} fotograma(s)${r.resultado.audio ? ", con audio" : ", sin audio"}${r.resultado.transcripcion ? ", con transcripción" : ", sin transcripción"}. Tardó ${tiempos.total} s.`);
      return { ok: true, respuesta, analisis: r, tiempos };
    }

    const proyecto = carpetaProyecto(cfg, trabajo);

    // ================================================== armado ====
    if (etapa === "armado") {
      // Un armado a la vez (o dos, según los núcleos): config.json → paralelo.armados. La caché es compartida.
      const r = await limites.armado.usar({ prioridad, grupo }, async (espera) => {
        T.turno += espera;
        if (retirado) throw retirado;
        const t0 = Date.now();
        try {
          return await armar({ cfg, ff, registro, trabajo, carpeta: carpetaCache(cfg), conCerrojo: limites.conCerrojo, latir: (d) => ((ultimoDetalle = d), reportar(d)) });
        } finally {
          T.armado += Date.now() - t0;
        }
      });
      hecho = 1;
      const tSubida = Date.now();
      await reportar("Subiendo el video al CRM", true);
      // Fotogramas del video YA armado, para el control de calidad del CRM (gancho, producto, cierre con
      // rótulo, subtítulos): el primero del primer segundo, el último del cierre, el resto repartidos.
      const fotogramas = [];
      const cuantos = Math.max(0, Math.min(6, Math.floor(Number((cfg.config.armado || {}).fotogramasFinales ?? 5))));
      if (cuantos >= 1) {
        try {
          const ultimoCierre = r.cierres[r.cierres.length - 1];
          const primero = Math.min(1, r.duracion / 4);
          const ultimo = ultimoCierre ? ultimoCierre.inicio + Math.min(ultimoCierre.dura - 0.4, Math.max(1, ultimoCierre.dura * 0.6)) : Math.max(primero, r.duracion - 0.8);
          const momentos = cuantos === 1 ? [primero] : Array.from({ length: cuantos }, (_, i) => primero + ((ultimo - primero) * i) / (cuantos - 1));
          for (const [i, s] of momentos.entries()) {
            const jpg = `final-f${i + 1}.jpg`;
            await ff.ffmpeg(["-ss", String(redondo(Math.max(0, Math.min(r.duracion - 0.1, s)), 2)), "-i", r.archivo, "-frames:v", "1", "-vf", "scale='if(gt(iw,ih),768,-2)':'if(gt(iw,ih),-2,768)'", "-q:v", "4", "-update", "1", jpg], carpeta);
            fotogramas.push(await crm.subir(trabajo, path.join(carpeta, jpg), { tipo: "fotograma-final", indice: i + 1 }));
          }
        } catch (e) {
          // Son opcionales: si el CRM no los acepta o algo falla, el video se entrega igual, sin ellos.
          if (e instanceof TrabajoSoltado) throw e;
          fotogramas.length = 0;
          registro.aviso(`Trabajo ${trabajo.id}: no se mandaron los fotogramas del final (${registro.limpiar(e.message || String(e)).slice(0, 160)}).`);
        }
      }
      const respuesta = await conCrm(
        crm.entregar(
          trabajo,
          r.archivo,
          {
            duracion: redondo(r.duracion, 2),
            subtitulos: r.segmentos.some((s) => s.subtitulo),
            ...(fotogramas.length ? { fotogramas } : {}),
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
      T.subida += Date.now() - tSubida;
      const tiempos = anotarTiempos("listo", (trabajo.todas || lista).length);
      registro.info(`Trabajo ${trabajo.id}: video armado y entregado (${redondo(r.duracion)} s). Queda por aprobar en el CRM. Tiempos: turno ${tiempos.turno} s, armado ${tiempos.armado} s, subida ${tiempos.subida} s, total ${tiempos.total} s.`);
      return { ok: true, respuesta, armado: r, tiempos };
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
    // Quién habla: por defecto el propio clip. Si el proveedor no da audio (simulado, fal), el clip se pide sin diálogo.
    const audio = etapa === "clips" ? (() => {
      const m = decidirAudio(cfg, trabajo, vozTts.disponible(cfg)).modo;
      return m === "veo" && !deps.proveedor.daAudio ? "elevenlabs" : m;
    })() : "ninguno";
    const H = ((cfg.config.armado || {}).habla) || {};
    let cortar = null; // motivo de cuenta (clave, saldo): las escenas que faltan fallarían igual y no se piden
    let buenas = 0;
    let fatal = null; // el CRM retiró el trabajo o no responde: las escenas que no han empezado ya no empiezan
    // Tope de gasto opcional del trabajo (créditos). Cuenta lo ya gastado en intentos anteriores.
    const presupuesto = crearPresupuesto(trabajo.gastoMaximoCreditos, estado.creditos);
    const semaforo = tipo === "imagen" ? limites.imagen : limites.video;

    /**
     * Pide al proveedor la imagen o el clip de una escena, con cupo y con tope de gasto.
     * `pedir(ctxExtra)` hace la llamada; `clave` identifica la tarea pendiente (para no pagarla dos veces).
     */
    async function generar(n, clave, pedir) {
      // Retomar una tarea ya creada no es gasto nuevo: el tope solo frena las que se crearían ahora.
      const pendiente = tareaPendiente(proyecto, clave);
      const nueva = !(pendiente && pendiente.taskId);
      // El permiso de gasto se pide ANTES de ocupar cupo del proveedor, para no quitárselo a otros trabajos mientras se espera.
      if (nueva && !(await presupuesto.admitir())) {
        throw Object.assign(new Error(`tope de gasto: este trabajo tiene un máximo de ${presupuesto.limite} créditos y ya lleva ${redondo(presupuesto.consumido(), 2)}; esta escena no se pidió.`), { yaDicho: true, porTope: true });
      }
      let creditos = null;
      const turno = semaforo.usar({ prioridad, grupo }, async (espera) => {
        T.turno += espera;
        if (fatal || retirado) throw fatal || retirado;
        if (cortar) throw Object.assign(new Error(cortar), { yaDicho: true });
        const memoria = tareaPendiente(proyecto, clave);
        ultimoDetalle = `Escena ${n}: ${tipo === "imagen" ? "imagen base" : "clip"}`;
        await reportar(ultimoDetalle, true);
        // Fases que avisa el proveedor (ctx.fase): «cola» o «generando». Si no avisa, todo cuenta como generación.
        let faseActual = "generacion";
        let desde = Date.now();
        const fase = (f) => {
          const ahora = Date.now();
          T[faseActual] += ahora - desde;
          desde = ahora;
          faseActual = f === "cola" ? "cola" : "generacion";
        };
        try {
          const r = await pedir({ memoria, recordar: (m) => recordarTarea(proyecto, clave, m), latir: (d) => ((ultimoDetalle = d), reportar(d)), fase });
          creditos = typeof r.creditos === "number" ? r.creditos : null;
          return r;
        } catch (e) {
          // Clave o saldo: se marca ANTES de soltar el cupo, para que la escena que sigue en la fila ya no se pida.
          if (e && (e.deLaCuenta || e.code === 401 || e.code === 402)) cortar = `No se pidió: ${registro.limpiar(e.message || String(e)).slice(0, 300)}`;
          throw e;
        } finally {
          fase("fin");
        }
      });
      try {
        return await turno;
      } finally {
        if (nueva) presupuesto.terminar(creditos);
      }
    }

    async function unaEscena(escena) {
      const n = escena.n;
      let memo = estado.escenas[n] || {};
      if (memo.reportada) {
        hecho++;
        if (!memo.error) buenas++;
        return;
      }
      try {
        if (fatal || retirado) throw fatal || retirado;
        if (cortar) throw Object.assign(new Error(cortar), { yaDicho: true });
        if (escena.tipo && escena.tipo !== "generada") throw new Error(`La escena ${n} es de tipo «${escena.tipo}»: su clip lo fabrica el armado, no se genera.`);

        let archivo = memo.archivo && fs.existsSync(path.join(carpeta, memo.archivo)) ? memo.archivo : null;
        if (!archivo) {
          let r;
          let avisoEscena = "";
          if (tipo === "imagen") {
            const prompt = String(escena.promptImagen || "").trim();
            if (!prompt) throw new Error(`La escena ${n} no trae el texto de la imagen (promptImagen).`);
            // La clave NO lleva el número de escena (el CRM puede reordenar): va por lo que se pidió.
            const clave = `imagen:${huella(prompt, fotos.map((u) => claveUrl(u)), trabajo.relacionAspecto)}`;
            r = await generar(n, clave, (extra) =>
              deps.proveedorImagen.generarImagen({
                cfg, registro, ff, trabajo, escena, prompt, referencias: fotos, analisis: String(contexto.analisisProducto || ""),
                carpeta, base: `imagen-${dos(n)}`, ancho, alto, relacion: trabajo.relacionAspecto,
                ...extra,
              }),
            );
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
            const salida = archivo;
            r = await generar(n, clave, (extra) =>
              deps.proveedor.generarEscena({
                cfg, registro, ff,
                // El proveedor de video recibe la imagen aprobada como «foto» de la escena: es su primer fotograma.
                trabajo: { ...trabajo, imagenesProducto: [imagen.url], opciones: { ...(trabajo.opciones || {}) } },
                escena: { n, nombre: escena.nombre || `Escena ${n}`, prompt, duracion: Number(escena.duracion) > 0 ? Number(escena.duracion) : 4, usaImagenProducto: true, voz: escena.voz || "", locucion: escena.locucion },
                primerFotograma: true,
                // Si el CRM ya trae su bloque «AUDIO» en el prompt, el proveedor no agrega otra instrucción de voz.
                audioEnPrompt: audio === "veo" && audioYaEnPrompt(trabajo, prompt),
                carpeta, salida, ancho, alto, relacion: trabajo.relacionAspecto, audio,
                ...extra,
              }),
            );
            if ((await ff.duracion(archivo, carpeta)) <= 0.5) throw new Error(`El proveedor no dejó un clip válido para la escena ${n}.`);
            estado.segundosGenerados += r.segundos || 0;
            // La voz es la del propio clip: si la escena tiene frase y el clip volvió sin audio o en
            // silencio, se dice EN LA ESCENA (nunca un video mudo sin avisar). El clip se entrega igual.
            if (audio === "veo" && seHabla(escena)) {
              const med = (await ff.tieneAudio(archivo, carpeta)) ? await ff.medirAudio(archivo, carpeta, { ruidoDb: H.ruidoDb, silencioMinimo: H.silencioMinimo }) : null;
              if (!med || med.mudo) avisoEscena = `sin audio: el clip tiene frase pero volvió ${med ? "en silencio" : "sin pista de audio"}. Conviene regenerarlo.`;
            }
          }
          memo = { archivo, creditos: typeof r.creditos === "number" ? r.creditos : null, segundos: tipo === "clip" ? r.segundos || 0 : null, modelo: r.modelo, ...(avisoEscena ? { aviso: avisoEscena } : {}) };
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
        const tSubida = Date.now();
        // Subir y reportar. El CRM contesta por escena si la registró (`ok`); si dice que no
        // (el archivo aún no estaba, la ruta no era la entregada), se sube y se reporta UNA vez más.
        for (let vuelta = 1; ; vuelta++) {
          if (!memo.ruta) {
            memo.ruta = await conCrm(crm.subir(trabajo, path.join(carpeta, archivo), { tipo, escena: n }));
            estado.escenas[n] = memo;
            guardar();
          }
          const resp = await reportar(`Escena ${n}: ${tipo === "imagen" ? "imagen lista" : "clip listo"} (${hecho} de ${total})`, true, [
            { n, tipo, ruta: memo.ruta, ...(memo.creditos !== null && memo.creditos !== undefined ? { creditos: memo.creditos } : {}), ...(tipo === "clip" ? { segundos: memo.segundos } : {}), ...(memo.aviso ? { aviso: memo.aviso } : {}) },
          ]);
          const acuse = resp && Array.isArray(resp.escenas) ? resp.escenas.find((x) => x && x.n === n && x.tipo === tipo) : null;
          if (!acuse || acuse.ok !== false) break;
          memo.ruta = null;
          estado.escenas[n] = memo;
          guardar();
          if (vuelta >= 2) throw Object.assign(new Error(`El CRM no registró ${tipo === "imagen" ? "la imagen" : "el clip"} de la escena ${n}: ${String(acuse.error || "sin motivo").slice(0, 200)}`), { delCrm: true });
          registro.aviso(`Trabajo ${trabajo.id}: el CRM no registró la escena ${n} (${String(acuse.error || "sin motivo").slice(0, 120)}); se sube de nuevo.`);
        }
        T.subida += Date.now() - tSubida;
        memo.reportada = true;
        estado.escenas[n] = memo;
        guardar();
        buenas++;
      } catch (e) {
        // El CRM retiró el trabajo o no responde: eso sí es del trabajo entero.
        if (e instanceof TrabajoSoltado || (e && e.delCrm)) {
          fatal = fatal || e;
          throw e;
        }
        const motivo = registro.limpiar(e && e.message ? e.message : String(e)).slice(0, 400);
        if (!e.yaDicho) registro.error(`Trabajo ${trabajo.id}: falló ${tipo === "imagen" ? "la imagen" : "el clip"} de la escena ${n}: ${motivo}`);
        else if (e.porTope) registro.aviso(`Trabajo ${trabajo.id}: escena ${n} sin pedir por el tope de gasto.`);
        if (e && (e.deLaCuenta || e.code === 401 || e.code === 402)) cortar = `No se pidió: ${motivo}`;
        hecho++;
        try {
          await reportar(`Escena ${n}: ${e.porTope ? "tope de gasto" : "falló"}`, true, [{ n, tipo, error: motivo }]);
        } catch (e2) {
          fatal = fatal || e2;
          throw e2;
        }
        estado.escenas[n] = { ...memo, reportada: true, error: motivo };
        guardar();
      }
    }

    // Todas las escenas a la vez; cuántas corren de verdad lo decide el cupo del proveedor (config.json → paralelo).
    const cierres = await Promise.allSettled(lista.map((e) => unaEscena(e)));
    const roto = cierres.find((c) => c.status === "rejected");
    if (roto) throw fatal || roto.reason;
    if (retirado) throw retirado;

    await conCrm(crm.cerrar(trabajo, { etapa, ...(estado.creditos ? { creditos: redondo(estado.creditos, 2) } : {}), ...(etapa === "clips" ? { segundosGenerados: redondo(estado.segundosGenerados) } : {}) }));
    anotarCosto(cfg, {
      trabajo, etapa, proveedor: nombreProveedor, modelos: estado.modelos, resultado: buenas === lista.length ? "listo" : buenas ? "parcial" : "fallo",
      imagenes: estado.imagenes, segundosGenerados: etapa === "clips" ? estado.segundosGenerados : "", costoUsd: estado.costoDesconocido ? null : estado.costoUsd, creditos: estado.creditos,
    });
    fs.rmSync(carpeta, { recursive: true, force: true });
    const tiempos = anotarTiempos(buenas === lista.length ? "listo" : buenas ? "parcial" : "fallo", lista.length);
    registro.info(
      `Trabajo ${trabajo.id}: etapa «${etapa}» cerrada: ${buenas} de ${lista.length} escena(s) por aprobar${buenas < lista.length ? `, ${lista.length - buenas} sin hacer` : ""}${estado.creditos ? `, ${redondo(estado.creditos, 2)} créditos` : ""}. ` +
        `Tiempos (suma de escenas): turno ${tiempos.turno} s, cola del proveedor ${tiempos.cola} s, generación ${tiempos.generacion} s, subida ${tiempos.subida} s; total de reloj ${tiempos.total} s.`,
    );
    return { ok: true, buenas, fallidas: lista.length - buenas, tiempos };
  } catch (e) {
    anotarTiempos(e instanceof TrabajoSoltado ? "retirado" : "fallo", etapa === "armado" ? (trabajo.todas || lista).length : lista.length);
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
  } finally {
    clearInterval(latidoFondo);
  }
}

const ENCABEZADO_TIEMPOS = "fecha,trabajo,guion,etapa,escenas,prioridad,turno_s,cola_proveedor_s,generacion_s,subida_s,armado_s,total_s,resultado";

/**
 * Una línea por trabajo en `registro/tiempos.csv`. turno, cola, generación y subida son la SUMA sobre
 * las escenas (van varias a la vez); `total_s` es el tiempo de reloj del trabajo.
 */
function anotarTiempo(cfg, { trabajo, etapa, escenas, prioridad, T, resultado }) {
  const s = (ms) => redondo(ms / 1000, 1);
  const fila = { turno: s(T.turno), cola: s(T.cola), generacion: s(T.generacion), subida: s(T.subida), armado: s(T.armado), total: s(Date.now() - T.inicio) };
  try {
    fs.mkdirSync(cfg.carpetas.registro, { recursive: true });
    const archivo = path.join(cfg.carpetas.registro, "tiempos.csv");
    if (!fs.existsSync(archivo)) fs.writeFileSync(archivo, ENCABEZADO_TIEMPOS + "\n");
    fs.appendFileSync(archivo, [new Date().toISOString(), trabajo.id, trabajo.guionId || "", etapa, escenas, prioridad, fila.turno, fila.cola, fila.generacion, fila.subida, fila.armado, fila.total, resultado].join(",") + "\n");
  } catch {
    /* la medición no debe tumbar un trabajo */
  }
  return fila;
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

module.exports = { procesarEtapa, unaImagen, anotarCosto, anotarTiempo, ENCABEZADO, ENCABEZADO_TIEMPOS };
