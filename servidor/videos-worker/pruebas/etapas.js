"use strict";
// Pruebas del PROYECTO POR ESCENAS, sin gastar: un CRM de mentira (servidor HTTP local
// que habla el contrato de servidor/CONTRATO-PROYECTO-VIDEO.md) y los proveedores simulados.
//
//   node pruebas/etapas.js                     recorrido completo (vertical y horizontal)
//   node pruebas/etapas.js --hasta=imagenes    solo hasta esa etapa: imagenes | clips | armado
//
// Recorre: imagenes → (corrección de una imagen) → clips → armado → rearmado idéntico →
// cambio de un texto → corrección de un clip → música → voz. Revisa el MP4 con ffprobe y
// deja fotogramas del cierre en  <repo>\qa-capturas\trabajador-etapas\  para mirarlos.
const fs = require("fs");
const path = require("path");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { cargar } = require("../lib/entorno");
const { crearRegistro } = require("../lib/registro");
const { crear: crearFf } = require("../lib/ffmpeg");
const { crearCrm } = require("../lib/crm");
const { cargarProveedor } = require("../proveedores");
const { cargarProveedorImagen } = require("../proveedores-imagen");
const kieImagen = require("../proveedores-imagen/kie");
const kieVideo = require("../proveedores/kie");
const { procesar } = require("../lib/trabajo");
const { prepararCierre, textosDelCierre } = require("../lib/rotulo");
const subt = require("../lib/subtitulos");
const efectos = require("../lib/efectos");
const vozLib = require("../lib/voz");
const { ENCABEZADO, ENCABEZADO_TIEMPOS } = require("../lib/etapas");
const { crearLimites, crearSemaforo, crearPresupuesto, ajustesParalelo, prioridadDe } = require("../lib/limites");
const { atenderCola } = require("../lib/cola");
const habla = require("../lib/habla");

const SECRETO = "secreto-de-prueba-0123456789";
const sha1 = (archivo) => crypto.createHash("sha1").update(fs.readFileSync(archivo)).digest("hex");

function correr(programa, args) {
  return new Promise((res, rej) => {
    const h = spawn(programa, args, { windowsHide: true });
    let so = "";
    let se = "";
    h.stdout.on("data", (d) => (so += d));
    h.stderr.on("data", (d) => (se += d));
    h.on("error", rej);
    h.on("close", () => res({ so, se }));
  });
}

/** CRM de mentira: guarda proyectos, encola trabajos y recibe subidas, según el contrato. */
function crearCrmDeMentira(carpetaFijos) {
  const proyectos = new Map(); // guionId → proyecto
  const cola = [];
  const trabajos = new Map(); // id → { trabajo, estado }
  const archivos = new Map(); // ruta → Buffer
  const visto = { descargas: [], progresos: [], fallos: [], cierres: [], subidas: [], noAutorizadas: 0 };
  let consecutivo = 0;
  let puerto = 0;
  const firmada = (ruta) => `http://127.0.0.1:${puerto}/archivos/${ruta}?token=${crypto.randomBytes(8).toString("hex")}`; // cada enlace sale con otra firma
  const fijo = (nombre) => `http://127.0.0.1:${puerto}/fijos/${nombre}`;

  const servidor = http.createServer((req, res) => {
    const trozos = [];
    req.on("data", (d) => trozos.push(d));
    req.on("end", () => {
      const cuerpo = Buffer.concat(trozos);
      const json = (codigo, o) => (res.writeHead(codigo, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      const url = new URL(req.url, "http://x");
      if (req.method === "GET" && url.pathname.startsWith("/archivos/")) {
        const ruta = decodeURIComponent(url.pathname.slice("/archivos/".length));
        if (!archivos.has(ruta)) return json(404, { error: "no existe" });
        visto.descargas.push(ruta);
        return res.writeHead(200), res.end(archivos.get(ruta));
      }
      if (req.method === "GET" && url.pathname.startsWith("/fijos/")) {
        const f = path.join(carpetaFijos, path.basename(url.pathname));
        if (!fs.existsSync(f)) return json(404, { error: "no existe" });
        visto.descargas.push(`fijos/${path.basename(f)}`);
        return res.writeHead(200), res.end(fs.readFileSync(f));
      }
      if (req.method === "PUT" && url.pathname.startsWith("/subir/")) {
        const ruta = decodeURIComponent(url.pathname.slice("/subir/".length));
        archivos.set(ruta, cuerpo);
        visto.subidas.push(ruta);
        return json(200, { ok: true });
      }
      if (req.headers.authorization !== `Bearer ${SECRETO}`) {
        visto.noAutorizadas++;
        return json(401, { error: "secreto inválido" });
      }
      let c = {};
      try {
        c = cuerpo.length ? JSON.parse(cuerpo.toString("utf8")) : {};
      } catch {
        return json(400, { error: "JSON inválido" });
      }
      const m = /^\/api\/servidor\/trabajos\/(?:(tomar)|([\w-]+)\/(progreso|resultado|fallo))$/.exec(url.pathname);
      if (req.method !== "POST" || !m) return json(404, { error: "ruta desconocida" });
      if (m[1]) {
        const t = cola.shift();
        if (!t) return json(200, { trabajo: null });
        trabajos.get(t.id).estado = "generando";
        return json(200, { trabajo: t });
      }
      const reg = trabajos.get(m[2]);
      if (!reg || reg.trabajo.toma !== c.toma || ["listo", "fallo"].includes(reg.estado)) return json(409, { error: "Este trabajo ya no es tuyo.", soltar: true });
      const t = reg.trabajo;
      const p = proyectos.get(t.guionId);
      if (m[3] === "progreso") {
        visto.progresos.push({ id: t.id, ...c });
        const acuses = [];
        for (const e of c.escenas || []) {
          const escena = p.escenas.find((x) => x.n === e.n);
          if (!escena || !["imagen", "clip"].includes(e.tipo)) return json(400, { error: "escena o tipo inválido" });
          if (reg.rechazarUnReporte && !e.error) {
            reg.rechazarUnReporte = false; // imita «el archivo aún no está en Storage»: esa escena NO queda registrada
            acuses.push({ n: e.n, tipo: e.tipo, ok: false, error: "el archivo aún no está" });
            continue;
          }
          acuses.push({ n: e.n, tipo: e.tipo, ok: true });
          const pieza = escena[e.tipo];
          if (e.error) Object.assign(pieza, { estado: "fallo", nota: e.error });
          else {
            if (!archivos.has(e.ruta)) return json(400, { error: "esa ruta no se subió" });
            Object.assign(pieza, { estado: "por-aprobar", url: firmada(e.ruta), ruta: e.ruta, nota: "" });
            if (e.tipo === "imagen") p.costo.imagenes++;
          }
          p.costo.creditos += e.creditos || 0;
          p.costo.segundosGenerados += e.segundos || 0;
        }
        return json(200, { ok: true, ...(acuses.length ? { escenas: acuses } : {}) });
      }
      if (m[3] === "fallo") {
        visto.fallos.push({ id: t.id, motivo: c.motivo });
        reg.intentos = (reg.intentos || 0) + 1;
        if (reg.fallarDefinitivo !== false) reg.estado = "fallo";
        return json(200, reg.estado === "fallo" ? { estado: "fallo", intentos: reg.intentos } : { estado: "pendiente", intentos: reg.intentos, reintentaDesde: null });
      }
      // resultado
      if (c.pedirSubida) {
        if (t.etapa === "analisis") {
          // Subidas del análisis: fotogramas (con su índice) y el audio.
          if (!["fotograma", "audio"].includes(c.tipo)) return json(400, { error: "tipo de subida desconocido" });
          if (c.tipo === "fotograma" && !(Number.isInteger(c.indice) && c.indice >= 1 && c.indice <= 16)) return json(400, { error: "indice debe ir de 1 a 16" });
          const ruta = c.tipo === "audio" ? `referencias/${t.guionId}/audio.${c.extension === "mp3" ? "mp3" : "m4a"}` : `referencias/${t.guionId}/f${c.indice}.jpg`;
          return json(200, { subida: { url: `http://127.0.0.1:${puerto}/subir/${ruta}`, metodo: "PUT", cabeceras: { "content-type": c.tipo === "audio" ? "audio/mpeg" : "image/jpeg" }, ruta } });
        }
        if (t.etapa && !["imagen", "clip", "final", "fotograma-final"].includes(c.tipo)) return json(400, { error: "falta tipo" });
        let ruta;
        if (c.tipo === "fotograma-final") {
          if (!(Number.isInteger(c.indice) && c.indice >= 1 && c.indice <= 6)) return json(400, { error: "indice debe ir de 1 a 6" });
          ruta = `videos/${t.guionId}/${t.id}/final-f${c.indice}.jpg`;
          return json(200, { subida: { url: `http://127.0.0.1:${puerto}/subir/${ruta}`, metodo: "PUT", cabeceras: { "content-type": "image/jpeg" }, ruta } });
        }
        if (c.tipo === "final") ruta = `videos/${t.guionId}/final-${++p.final.armados}.mp4`;
        else {
          const escena = p.escenas.find((x) => x.n === c.escena);
          if (!escena) return json(400, { error: "falta escena" });
          ruta = `videos/${t.guionId}/escena-${c.escena}-${c.tipo}-${escena[c.tipo].intentos}.${c.tipo === "imagen" ? "jpg" : "mp4"}`;
        }
        return json(200, { subida: { url: `http://127.0.0.1:${puerto}/subir/${ruta}`, metodo: "PUT", cabeceras: { "content-type": c.tipo === "imagen" ? "image/jpeg" : "video/mp4" }, ruta } });
      }
      if (reg.cortarCierre) {
        reg.cortarCierre = false; // imita un corte del CRM justo al cerrar
        return json(400, { error: "corte simulado al cerrar" });
      }
      if (t.etapa === "armado") {
        if (!archivos.has(c.ruta)) return json(400, { error: "el final no se subió" });
        Object.assign(p.final, { estado: "por-aprobar", url: firmada(c.ruta), ruta: c.ruta });
        visto.cierres.push({ id: t.id, ...c });
      } else if (t.etapa === "analisis") {
        // Como el CRM real: cada toma debe traer su fotograma YA subido.
        if (c.etapa !== "analisis" || !Array.isArray(c.tomas) || !c.tomas.length) return json(400, { error: "faltan las tomas" });
        if (!c.tomas.every((x) => typeof x.fotograma === "string" && archivos.has(x.fotograma) && x.hasta > x.desde)) return json(409, { error: "falta el fotograma de una toma" });
        visto.cierres.push({ id: t.id, ...c });
      } else {
        if (c.etapa !== t.etapa) return json(400, { error: "falta etapa" });
        visto.cierres.push({ id: t.id, ...c });
      }
      reg.estado = "listo";
      return json(200, { estado: "listo" });
    });
  });

  return {
    visto,
    proyectos,
    archivos,
    trabajos,
    fijo,
    async abrir() {
      await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
      puerto = servidor.address().port;
      return `http://127.0.0.1:${puerto}`;
    },
    cerrar: () => servidor.close(),
    crearProyecto(guionId, relacion, contexto, escenas, formato = "ugc") {
      const pieza = () => ({ estado: "pendiente", url: null, intentos: 0, nota: "" });
      proyectos.set(guionId, { guionId, relacion, formato, contexto, escenas: escenas.map((e) => ({ ...e, imagen: pieza(), clip: pieza() })), costo: { creditos: 0, segundosGenerados: 0, imagenes: 0 }, final: { estado: "pendiente", url: null, armados: 0 } });
      return proyectos.get(guionId);
    },
    /** Encola un trabajo de la etapa, con SOLO las escenas pedidas (o todas las que tocan). */
    /** Proyecto «hijo» (variación): comparte las escenas ya aprobadas del padre, con las MISMAS direcciones. */
    crearHijo(padreId, hijoId, cambiar = () => {}) {
      const hijo = JSON.parse(JSON.stringify(proyectos.get(padreId)));
      hijo.guionId = hijoId;
      hijo.final = { estado: "pendiente", url: null, armados: 0 };
      cambiar(hijo);
      proyectos.set(hijoId, hijo);
      return hijo;
    },
    /** Trabajo de análisis de un video de referencia (clonar anuncio): no pertenece a ningún proyecto con escenas. */
    encolarAnalisis(url, extra = {}) {
      const id = `20260101-${String(++consecutivo).padStart(6, "0")}-${crypto.randomBytes(6).toString("hex")}`;
      const trabajo = { id, toma: crypto.randomBytes(6).toString("hex"), guionId: `clon-${consecutivo}`, etapa: "analisis", referencia: { url }, intentos: 1, maxIntentos: 3 };
      trabajos.set(id, { trabajo, estado: "pendiente", ...extra });
      cola.push(trabajo);
      return trabajo;
    },
    encolar(guionId, etapa, numeros = null, opciones = {}, extra = {}) {
      const p = proyectos.get(guionId);
      const tipo = etapa === "imagenes" ? "imagen" : "clip";
      let escenas = [];
      if (etapa !== "armado") {
        escenas = p.escenas.filter((e) => e.tipo === "generada" && (numeros ? numeros.includes(e.n) : true));
        for (const e of escenas) Object.assign(e[tipo], { estado: "en-cola", intentos: e[tipo].intentos + 1 });
      }
      const copia = (e) => JSON.parse(JSON.stringify(e));
      const id = `20260101-${String(++consecutivo).padStart(6, "0")}-${crypto.randomBytes(6).toString("hex")}`;
      const trabajo = {
        id, toma: crypto.randomBytes(6).toString("hex"), guionId, version: 1, etapa, relacionAspecto: p.relacion, formato: p.formato,
        producto: p.contexto.producto, intentos: 1, maxIntentos: 3,
        contexto: copia(p.contexto),
        escenas: escenas.map(copia),
        ...(etapa === "armado" ? { todas: p.escenas.map(copia) } : {}),
        opciones: { subtitulos: true, voz: true, musica: null, modelo: null, ...opciones },
        ...extra,
      };
      trabajos.set(id, { trabajo, estado: "pendiente" });
      cola.push(trabajo);
      return trabajo;
    },
    /** Una persona aprueba (o rechaza) la imagen o el clip de una escena. El enlace se vuelve a firmar. */
    aprobar(guionId, tipo, n, si = true) {
      const pieza = proyectos.get(guionId).escenas.find((e) => e.n === n)[tipo];
      pieza.estado = si ? "aprobada" : "rechazada";
      if (pieza.ruta) pieza.url = firmada(pieza.ruta);
    },
  };
}

async function correrPruebas({ ok, hasta = "todo" }) {
  const cfg = cargar();
  const ff = crearFf(cfg);
  const datos = path.join(cfg.raiz, "datos", "prueba-etapas");
  fs.rmSync(datos, { recursive: true, force: true });
  const fijos = path.join(datos, "fijos");
  fs.mkdirSync(fijos, { recursive: true });
  const capturas = path.resolve(cfg.raiz, "..", "..", "qa-capturas", "trabajador-etapas");
  fs.mkdirSync(capturas, { recursive: true });
  const tiempos = [];

  // ---- archivos fijos: fotos «reales» del producto, música y voz de mentira ----
  const producto = (tam, x, y, w, h) =>
    `color=c=0xF4F1EA:s=${tam}:d=1,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=0x2E7D32:t=fill,drawbox=x=${x + w * 0.25}:y=${y - h * 0.16}:w=${w * 0.5}:h=${h * 0.16}:color=0x1B5E20:t=fill,drawbox=x=${x + w * 0.1}:y=${y + h * 0.3}:w=${w * 0.8}:h=${w * 0.8}:color=0xFFFFFF:t=fill,drawbox=x=${x + w * 0.3}:y=${y + h * 0.3 + w * 0.2}:w=${w * 0.4}:h=${w * 0.4}:color=0xC62828:t=fill`;
  await ff.ffmpeg(["-f", "lavfi", "-i", producto("1000x1000", 380, 280, 240, 560), "-frames:v", "1", "-q:v", "2", "-update", "1", "cuadrada.jpg"], fijos);
  await ff.ffmpeg(["-f", "lavfi", "-i", producto("1600x900", 680, 260, 240, 520), "-frames:v", "1", "-q:v", "2", "-update", "1", "ancha.jpg"], fijos);
  await ff.ffmpeg(["-f", "lavfi", "-i", producto("800x1400", 280, 420, 240, 620), "-frames:v", "1", "-q:v", "2", "-update", "1", "alta.jpg"], fijos);
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=220:duration=6", "-c:a", "libmp3lame", "-b:a", "128k", "musica.mp3"], fijos);
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=660:duration=1.8", "-c:a", "libmp3lame", "-b:a", "128k", "voz.mp3"], fijos);

  const crmFalso = crearCrmDeMentira(fijos);
  const crmUrl = await crmFalso.abrir();
  const carpetas = { datos, trabajos: path.join(datos, "trabajos"), proyectos: path.join(datos, "proyectos"), entregados: path.join(datos, "entregados"), registro: path.join(datos, "registro"), musica: path.join(datos, "musica-de-prueba") };
  fs.mkdirSync(carpetas.musica, { recursive: true }); // la biblioteca de música empieza vacía
  const base = { ...cfg, crmUrl, secreto: SECRETO, nombre: "prueba", elevenKey: "", elevenVoz: "", permitirHttpLocal: true, carpetas, config: { ...cfg.config, simulado: { demoraSegundos: 0 } } };
  const registro = crearRegistro(carpetas.registro, [SECRETO]);
  const crm = crearCrm(base);
  // Proveedores simulados, contando cuántas veces se les pide algo (para comprobar que nada se pide dos veces).
  const pedidos = { imagen: 0, clip: 0 };
  const simVideo = cargarProveedor("simulado");
  const simImagen = cargarProveedorImagen("simulado");
  const proveedor = { ...simVideo, generarEscena: (c) => (pedidos.clip++, simVideo.generarEscena(c)) };
  const proveedorImagen = { ...simImagen, generarImagen: (c) => (pedidos.imagen++, simImagen.generarImagen(c)) };
  const deps = { cfg: base, crm, ff, proveedor, proveedorImagen, registro };
  /** Lo que hace el trabajador en una vuelta: tomar el siguiente trabajo y atenderlo. */
  const atender = async (d = deps) => {
    const t = await d.crm.tomar();
    return t ? { trabajo: t, ...(await procesar(t, d)) } : null;
  };
  const probar = async (archivo) => {
    const { so } = await correr(cfg.ffprobe, ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels", "-of", "json", archivo]);
    const j = JSON.parse(so);
    return { dura: Number(j.format.duration), video: j.streams.find((s) => s.codec_type === "video"), audio: j.streams.find((s) => s.codec_type === "audio"), pistas: j.streams.length };
  };
  const volumen = async (archivo) => {
    const { se } = await correr(cfg.ffmpeg, ["-hide_banner", "-i", archivo, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
    return Number((/mean_volume: (-?[\d.]+) dB/.exec(se) || [])[1]);
  };
  const fotograma = (archivo, segundo, destino) => ff.ffmpeg(["-ss", String(segundo), "-i", archivo, "-frames:v", "1", "-update", "1", destino]);

  const cierre = { oferta: "2 unidades por $89.900 con envío gratis y pago contra entrega", llamadoALaAccion: "Pide el tuyo en el botón de abajo" };
  const contexto = () => ({ producto: "Producto de prueba", pais: "CO", fotos: [crmFalso.fijo("cuadrada.jpg")], analisisProducto: "Frasco verde de 12 cm; se sostiene con una mano.", cierre: { ...cierre } });

  // =============================================== proyecto vertical ====
  const V = "guion-vertical";
  crmFalso.crearProyecto(V, "9:16", contexto(), [
    { n: 1, paso: 1, tipo: "generada", duracion: 4, voz: "¿A ti también te pasa que no duermes bien?", promptImagen: "Mujer cansada en su cama mirando el celular", promptVideo: "La mujer suspira y mira a cámara" },
    { n: 2, paso: 2, tipo: "generada", duracion: 4.5, voz: "Hasta que probé esto.", promptImagen: "FALLA-IMAGEN la mujer sostiene el frasco", promptVideo: "Levanta el frasco y sonríe" },
    { n: 3, paso: 3, tipo: "foto-real", duracion: 3, voz: "Es natural y se toma antes de dormir.", fotoUrl: crmFalso.fijo("cuadrada.jpg"), movimiento: "acercar" },
    { n: 4, paso: 4, tipo: "foto-real", duracion: 3, voz: "", fotoUrl: crmFalso.fijo("ancha.jpg"), movimiento: "paneo-der" },
    { n: 5, paso: 5, tipo: "cierre", duracion: 5, voz: "Pídelo hoy con envío gratis.", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
  ]);
  const pv = crmFalso.proyectos.get(V);
  const esc = (n) => pv.escenas.find((e) => e.n === n);

  // ---- imagenes: una falla, la otra sigue ----
  crmFalso.encolar(V, "imagenes");
  let r = await atender();
  const progresoDe = (id) => crmFalso.visto.progresos.filter((p) => p.id === id);
  const antesDelCierre = crmFalso.visto.cierres.length === 1 && progresoDe(r.trabajo.id).some((p) => (p.escenas || []).some((e) => e.n === 1 && e.ruta));
  ok(r.ok && esc(1).imagen.estado === "por-aprobar" && esc(2).imagen.estado === "fallo" && /FALLA-IMAGEN|simulado/.test(esc(2).imagen.nota) && crmFalso.visto.fallos.length === 0, "imagenes: la escena 1 queda por aprobar, la 2 falla con su motivo y el trabajo NO se cae");
  ok(antesDelCierre && crmFalso.visto.cierres[0].etapa === "imagenes" && !("ruta" in crmFalso.visto.cierres[0]), "imagenes: cada imagen se reporta por «progreso» en cuanto está; el «resultado» final solo cierra la etapa");
  const img1 = path.join(datos, "imagen-1.jpg");
  fs.writeFileSync(img1, crmFalso.archivos.get(esc(1).imagen.ruta));
  const dimImg = await ff.dimensiones(img1);
  ok(dimImg.ancho === 720 && dimImg.alto === 1280 && /\.jpg$/.test(esc(1).imagen.ruta), `imagenes: se subió un JPG de ${dimImg.ancho}x${dimImg.alto} (9:16) con la subida firmada de tipo «imagen»`);
  fs.copyFileSync(img1, path.join(capturas, "imagen-base-simulada.jpg"));

  // ---- corrección: solo la escena 2 ----
  esc(2).promptImagen = "La mujer sostiene el frasco y sonríe";
  crmFalso.encolar(V, "imagenes", [2]);
  r = await atender();
  ok(r.ok && esc(2).imagen.estado === "por-aprobar" && pedidos.imagen === 3 && pv.costo.imagenes === 2, "corrección de imagen: un trabajo con UNA escena rehace solo esa (la 1 no se toca)");
  if (hasta === "imagenes") return fin();

  // ---- clips: solo de imágenes aprobadas ----
  crmFalso.aprobar(V, "imagen", 1);
  crmFalso.encolar(V, "clips"); // la 2 va sin aprobar a propósito
  r = await atender();
  ok(r.ok && esc(1).clip.estado === "por-aprobar" && esc(2).clip.estado === "fallo" && /no está aprobada/.test(esc(2).clip.nota) && pedidos.clip === 1, "clips: sin imagen aprobada no se genera (ni se gasta) el clip; la otra escena sí sale");
  crmFalso.aprobar(V, "imagen", 2);
  crmFalso.encolar(V, "clips", [2]);
  r = await atender();
  const cierreClips = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  ok(r.ok && esc(2).clip.estado === "por-aprobar" && pv.costo.segundosGenerados === 9 && cierreClips.etapa === "clips" && cierreClips.segundosGenerados === 5, `clips: imagen a video desde la imagen aprobada; segundos reportados por escena (4 + 5 = ${pv.costo.segundosGenerados})`);
  const eK = kieVideo.armarEntrada(
    { ...base, config: { ...base.config, kie: { ...base.config.kie, modoImagen: "referencia" } } },
    { escena: { prompt: "p", duracion: 4.5, usaImagenProducto: true, voz: "" }, trabajo: { imagenesProducto: ["https://crm.test/imagen-aprobada.jpg"], opciones: {} }, relacion: "9:16", audio: "elevenlabs", primerFotograma: true },
    kieVideo.modeloPara(base, { formato: "ugc", opciones: {} }, true),
  );
  ok(eK.input.generation_type === "FIRST_AND_LAST_FRAMES_2_VIDEO" && eK.input.image_urls[0] === "https://crm.test/imagen-aprobada.jpg" && eK.input.duration === 6, "clips con Kie: la imagen aprobada va SIEMPRE como primer fotograma; 4,5 s se piden como 6 (la menor duración que la cubre)");
  if (hasta === "clips") return fin();

  // ---- armado ----
  crmFalso.aprobar(V, "clip", 1);
  crmFalso.encolar(V, "armado");
  r = await atender();
  ok(!r.ok && /clip de la escena 2 no está aprobado/.test(crmFalso.visto.fallos[crmFalso.visto.fallos.length - 1].motivo), "armado: si falta un clip aprobado no se arma y se dice cuál");
  crmFalso.aprobar(V, "clip", 2);
  crmFalso.encolar(V, "armado");
  r = await atender();
  tiempos.push(["armado completo, vertical (5 escenas)", r.armado.segundos]);
  const finalV = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  let info = await probar(finalV);
  const entrega = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  ok(r.ok && Math.abs(info.dura - 19.5) < 0.25, `armado vertical: ${info.dura.toFixed(2)} s (se esperaban 19,5: 4 + 4,5 recortado de un clip de 5 + 3 + 3 + 5)`);
  ok(info.video.width === 1080 && info.video.height === 1920 && info.video.codec_name === "h264" && info.video.r_frame_rate === "30/1" && info.audio && info.audio.codec_name === "aac" && info.pistas === 2, `armado vertical: ${info.video.width}x${info.video.height}, h264 a 30 fps, una pista de audio aac`);
  ok(pv.final.estado === "por-aprobar" && /final-1\.mp4$/.test(pv.final.ruta) && entrega.sinVoz === true && JSON.stringify(r.armado.sinAudio) === "[1,2]" && JSON.stringify(r.armado.sinLocucion) === "[3,5]" && /escena 1 llegó sin audio/.test(entrega.avisos.join(" ")) && entrega.segundosGenerados === 0, "armado: sube el final con la subida de tipo «final», queda por aprobar, y avisa escena por escena las que salieron sin voz (clips sin audio y fotos sin locución)");
  ok(r.armado.stats.descargas === 3 && r.armado.stats.reutilizados === 2 && r.armado.stats.segmentosHechos === 4, `armado: bajó ${r.armado.stats.descargas} archivos (1 clip + 2 fotos) y codificó ${r.armado.stats.segmentosHechos} escenas; el clip y la escena 1 ya estaban del intento anterior, y la foto repetida se bajó una sola vez`);
  const c5 = r.armado.cierres[0];
  await fotograma(finalV, c5.inicio + 1.0, path.join(capturas, "vertical-cierre-con-subtitulo.png"));
  await fotograma(finalV, c5.inicio + 4.5, path.join(capturas, "vertical-cierre-final.png"));
  await fotograma(finalV, 8.5 + 0.1, path.join(capturas, "vertical-foto-real-acercar-inicio.png"));
  await fotograma(finalV, 8.5 + 2.9, path.join(capturas, "vertical-foto-real-acercar-fin.png"));
  await fotograma(finalV, 11.5 + 1.5, path.join(capturas, "vertical-foto-real-ancha-paneo.png"));
  fs.copyFileSync(finalV, path.join(capturas, "vertical-final.mp4"));
  const huellaV = sha1(finalV);

  // ---- rearmado idéntico: nada se baja ni se codifica, y el archivo es el mismo ----
  let bajadas = crmFalso.visto.descargas.length;
  crmFalso.encolar(V, "armado");
  r = await atender();
  tiempos.push(["rearmado sin cambios", r.armado.segundos]);
  ok(r.ok && crmFalso.visto.descargas.length === bajadas && r.armado.stats.segmentosHechos === 0 && r.armado.stats.finalReutilizado && sha1(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`)) === huellaV, `rearmado sin cambios: 0 descargas, 0 escenas codificadas, mismo archivo byte a byte (${r.armado.segundos} s)`);

  // ---- mismo proyecto desde cero (sin caché de segmentos): mismo resultado ----
  const dirCache = path.join(datos, "cache"); // la caché del armado es compartida por todos los proyectos
  for (const f of fs.readdirSync(dirCache)) if (/^(s|final)-/.test(f)) fs.rmSync(path.join(dirCache, f));
  crmFalso.encolar(V, "armado");
  r = await atender();
  tiempos.push(["armado completo con todo ya descargado", r.armado.segundos]);
  ok(r.ok && r.armado.stats.descargas === 0 && r.armado.stats.segmentosHechos === 5 && sha1(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`)) === huellaV, "mismo proyecto armado de nuevo desde cero → exactamente el mismo archivo (repetible)");

  // ---- cambia solo un texto (la oferta): se rehace solo el cierre ----
  pv.contexto.cierre.oferta = "3 unidades por $119.900 con envío gratis";
  bajadas = crmFalso.visto.descargas.length;
  crmFalso.encolar(V, "armado");
  r = await atender();
  tiempos.push(["rearmado tras cambiar la oferta (1 escena)", r.armado.segundos]);
  ok(r.ok && crmFalso.visto.descargas.length === bajadas && r.armado.stats.segmentosHechos === 1 && r.armado.stats.segmentosReutilizados === 4, `cambio de la oferta: 0 descargas y solo 1 escena recodificada (${r.armado.segundos} s)`);
  await fotograma(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`), r.armado.cierres[0].inicio + 1.0, path.join(capturas, "vertical-cierre-oferta-corta.png"));
  pv.contexto.cierre.oferta = cierre.oferta;

  // ---- corrección de un clip: se rehace solo esa escena y se vuelve a armar ----
  crmFalso.aprobar(V, "clip", 2, false);
  esc(2).promptVideo = "Levanta el frasco, lo gira y sonríe";
  crmFalso.encolar(V, "clips", [2]);
  r = await atender();
  crmFalso.aprobar(V, "clip", 2);
  bajadas = crmFalso.visto.descargas.length;
  crmFalso.encolar(V, "armado");
  r = await atender();
  tiempos.push(["rearmado tras corregir un clip (1 escena)", r.armado.segundos]);
  ok(r.ok && pedidos.clip === 3 && crmFalso.visto.descargas.length === bajadas + 1 && r.armado.stats.segmentosHechos === 2 && r.armado.stats.segmentosReutilizados === 3, "corrección de un clip: se genera solo ese clip, se baja solo ese archivo y se recodifican solo esa escena y el cierre (su fondo es el último cuadro de ese clip)");

  // ---- música: baja bajo la voz; sin pista no se inventa ----
  const sinMusica = await volumen(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`));
  crmFalso.encolar(V, "armado", null, { musica: crmFalso.fijo("musica.mp3") });
  r = await atender();
  tiempos.push(["rearmado al poner música (solo audio)", r.armado.segundos]);
  const conMusica = await volumen(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`));
  info = await probar(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`));
  ok(r.ok && r.armado.stats.segmentosHechos === 0 && sinMusica < -40 && conMusica > sinMusica + 15 && Math.abs(info.dura - 19.5) < 0.25 && info.pistas === 2, `música: se mezcla sin recodificar el video (sin pista ${sinMusica} dB → con pista ${conMusica} dB), repetida hasta el final`);

  // ---- voz: con clave (ElevenLabs de mentira) se narran también foto-real y cierre ----
  const vistoVoz = { llamadas: 0, textos: [] };
  const eleven = http.createServer((req, res) => {
    let c = "";
    req.on("data", (d) => (c += d));
    req.on("end", () => {
      vistoVoz.llamadas++;
      const texto = JSON.parse(c).text;
      vistoVoz.textos.push(texto);
      const audio = fs.readFileSync(path.join(fijos, "voz.mp3"));
      if (!req.url.includes("/with-timestamps")) return res.writeHead(200, { "content-type": "audio/mpeg" }), res.end(audio);
      // La ruta con marcas de tiempo: el audio en base64 y cuándo suena cada letra.
      const letras = [...texto];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ audio_base64: audio.toString("base64"), alignment: { characters: letras, character_start_times_seconds: letras.map((_, i) => 0.1 + (i * 1.6) / letras.length), character_end_times_seconds: letras.map((_, i) => 0.1 + ((i + 1) * 1.6) / letras.length) } }));
    });
  });
  await new Promise((res) => eleven.listen(0, "127.0.0.1", res));
  const conVoz = { ...deps, cfg: { ...base, elevenKey: "clave-eleven-de-mentira", elevenVoz: "voz-de-mentira", elevenBase: `http://127.0.0.1:${eleven.address().port}` } };
  // ElevenLabs es OPCIONAL: aunque el servidor tenga la clave, solo se usa si el trabajo lo pide.
  crmFalso.encolar(V, "armado", null, { musica: crmFalso.fijo("musica.mp3") });
  r = await atender(conVoz);
  ok(r.ok && vistoVoz.llamadas === 0 && r.armado.modo === "veo", "voz: con clave de ElevenLabs en el servidor pero sin pedirla, NO se usa (manda el audio de los clips)");
  crmFalso.encolar(V, "armado", null, { musica: crmFalso.fijo("musica.mp3"), voz: "elevenlabs" });
  r = await atender(conVoz);
  const eVoz = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  const volVoz = await volumen(path.join(carpetas.entregados, `${r.trabajo.id}.mp4`));
  ok(r.ok && vistoVoz.llamadas === 4 && vistoVoz.textos.includes("Pídelo hoy con envío gratis.") && eVoz.sinVoz === false && !/sin voz/i.test(eVoz.avisos.join(" ")) && volVoz > -40, `voz: si el trabajo pide ElevenLabs (opciones.voz: "elevenlabs") y hay clave, se narran las escenas con texto, incluidas foto-real y cierre (4 llamadas)`);
  crmFalso.encolar(V, "armado", null, { musica: crmFalso.fijo("musica.mp3"), voz: "elevenlabs" });
  r = await atender(conVoz);
  ok(r.ok && vistoVoz.llamadas === 4 && r.armado.stats.finalReutilizado, "voz: al rearmar no se vuelve a pedir (ni a pagar) la misma narración");
  crmFalso.encolar(V, "armado", null, { voz: "elevenlabs" });
  r = await atender(); // el mismo pedido en un servidor SIN clave
  ok(r.ok && r.armado.modo === "veo" && /no tiene esa clave/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "voz: si se pide ElevenLabs y el servidor no tiene clave, no falla: usa el audio del clip y lo avisa");
  crmFalso.encolar(V, "armado", null, { voz: false });
  r = await atender(conVoz);
  ok(r.ok && vistoVoz.llamadas === 4 && crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].sinVoz === true, "voz: con «voz: false» no se narra nada");
  eleven.close();

  // ---- reinicio a mitad de una etapa: no se pide ni se reporta dos veces ----
  const R = "guion-reinicio";
  crmFalso.crearProyecto(R, "9:16", contexto(), [
    { n: 1, tipo: "generada", duracion: 4, voz: "", promptImagen: "Escena uno", promptVideo: "v1" },
    { n: 2, tipo: "generada", duracion: 4, voz: "", promptImagen: "Escena dos", promptVideo: "v2" },
  ]);
  const tR = crmFalso.encolar(R, "imagenes");
  Object.assign(crmFalso.trabajos.get(tR.id), { cortarCierre: true, fallarDefinitivo: false });
  const antes = pedidos.imagen;
  const tomado = await crm.tomar();
  const r1 = await procesar(tomado, deps); // el CRM corta justo al cerrar: el trabajo queda a medias en disco
  const estadoDisco = JSON.parse(fs.readFileSync(path.join(carpetas.trabajos, tR.id, "estado.json"), "utf8"));
  const r2 = await procesar(tomado, deps); // lo que hace el trabajador al arrancar de nuevo con lo que quedó en disco
  const reportes = progresoDe(tR.id).flatMap((p) => p.escenas || []);
  ok(!r1.ok && estadoDisco.escenas[1].reportada && r2.ok && pedidos.imagen === antes + 2 && reportes.length === 2, "reinicio a mitad de etapa: al retomar no se vuelve a generar ni a reportar lo que ya estaba (2 imágenes pedidas, 2 reportes)");

  // ---- el CRM contesta que una escena NO quedó registrada: se sube y se reporta otra vez, sin volver a generarla ----
  const tA = crmFalso.encolar(R, "imagenes", [1]);
  crmFalso.trabajos.get(tA.id).rechazarUnReporte = true;
  const antesA = pedidos.imagen;
  r = await atender();
  const subidasA = crmFalso.visto.subidas.filter((s) => s.includes(`${R}/escena-1-imagen-2`)).length;
  ok(r.ok && pedidos.imagen === antesA + 1 && subidasA === 2 && crmFalso.proyectos.get(R).escenas[0].imagen.estado === "por-aprobar", "acuse del CRM: si responde que una escena no quedó registrada, se vuelve a subir y a reportar (sin generarla de nuevo)");

  // ---- Kie imagen: servidor de mentira que imita su contrato ----
  const kieVisto = { creadas: [], listas: false, auth: new Set() };
  const kieFalso = http.createServer((req, res) => {
    let c = "";
    req.on("data", (d) => (c += d));
    req.on("end", () => {
      kieVisto.auth.add(req.headers.authorization || "");
      const json = (o) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      if (req.url === "/imagen.png") return res.writeHead(200, { "content-type": "image/png" }), res.end(fs.readFileSync(path.join(fijos, "kie.png")));
      if (req.headers.authorization !== "Bearer clave-kie-de-mentira") return json({ code: 401, msg: "You do not have access permissions" });
      if (req.method === "POST" && req.url === "/api/v1/jobs/createTask") {
        const cuerpo = JSON.parse(c);
        if (cuerpo.input.prompt.includes("SIN-CREDITOS")) return json({ code: 402, msg: "Insufficient credits" });
        kieVisto.creadas.push(cuerpo);
        return json({ code: 200, msg: "success", data: { taskId: `img_task_${kieVisto.creadas.length}` } });
      }
      if (req.method === "GET" && req.url.startsWith("/api/v1/jobs/recordInfo?taskId=")) {
        const taskId = req.url.split("=")[1];
        const lenta = kieVisto.creadas[Number(taskId.split("_")[2]) - 1].input.prompt.includes("LENTA") && !kieVisto.listas;
        return json({ code: 200, msg: "success", data: lenta ? { taskId, state: "generating" } : { taskId, state: "success", resultJson: JSON.stringify({ resultUrls: [`http://127.0.0.1:${kieFalso.address().port}/imagen.png`] }), creditsConsumed: 3 } });
      }
      json({ code: 404, msg: "not found" });
    });
  });
  await new Promise((res) => kieFalso.listen(0, "127.0.0.1", res));
  await ff.ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=720x1280:d=1", "-frames:v", "1", "-update", "1", "kie.png"], fijos);
  const cfgKie = { ...base, kieKey: "clave-kie-de-mentira", kieBase: `http://127.0.0.1:${kieFalso.address().port}`, config: { ...base.config, kieImagen: { ...base.config.kieImagen, consultarCadaSegundos: 0.1, limiteMinutosPorImagen: 0.004 } } };
  const depsKie = { ...deps, cfg: cfgKie, proveedorImagen: kieImagen };
  ok(typeof kieImagen.comprobar({ ...cfgKie, kieKey: "" }) === "string" && kieImagen.comprobar(cfgKie) === null, "kie imagen: sin KIE_API_KEY avisa qué falta");
  const mK = kieImagen.modeloPara(cfgKie, { formato: "ugc", opciones: {} });
  const conFotos = kieImagen.armarTarea(cfgKie, { prompt: "Mujer con el frasco", referencias: ["https://tienda.test/a.jpg", "https://tienda.test/b.jpg"], analisis: "Frasco de 12 cm", relacion: "9:16" }, mK);
  const sinFotos = kieImagen.armarTarea(cfgKie, { prompt: "Mujer cansada", referencias: [], analisis: "", relacion: "4:5" }, mK);
  ok(conFotos.model === "gpt-image-2-5-sunburst-image-to-image" && conFotos.input.input_urls.length === 2 && conFotos.input.aspect_ratio === "9:16" && conFotos.input.resolution === "1K" && /producto real/.test(conFotos.input.prompt) && /Frasco de 12 cm/.test(conFotos.input.prompt), "kie imagen con fotos: modelo imagen-a-imagen, fotos reales en input_urls, 9:16, 1K y la instrucción de producto idéntico");
  ok(sinFotos.model === "gpt-image-2-5-sunburst-text-to-image" && !("input_urls" in sinFotos.input) && sinFotos.input.aspect_ratio === "3:4", "kie imagen sin fotos: modelo de texto; una relación que el modelo no admite (4:5) pasa a la más cercana (3:4)");
  const nb = kieImagen.armarTarea(cfgKie, { prompt: "p", referencias: ["https://tienda.test/a.jpg"], analisis: "", relacion: "9:16" }, { alias: "nano-banana-2", ...cfgKie.config.kieImagen.modelos["nano-banana-2"] });
  ok(nb.model === "nano-banana-2" && nb.input.image_input.length === 1 && nb.input.output_format === "jpg", "kie imagen: el modelo se cambia en config.json (Nano Banana 2 usa image_input)");

  const K = "guion-kie";
  crmFalso.crearProyecto(K, "9:16", { ...contexto(), fotos: ["https://tienda.test/producto.jpg"] }, [
    { n: 1, tipo: "generada", duracion: 4, voz: "", promptImagen: "Mujer con el frasco", promptVideo: "v" },
    { n: 2, tipo: "generada", duracion: 4, voz: "", promptImagen: "LENTA mujer en la cocina", promptVideo: "v" },
  ]);
  const pk = crmFalso.proyectos.get(K);
  crmFalso.encolar(K, "imagenes");
  r = await atender(depsKie);
  ok(r.ok && pk.escenas[0].imagen.estado === "por-aprobar" && pk.costo.creditos === 3 && pk.escenas[1].imagen.estado === "fallo" && /se retoma la misma tarea/.test(pk.escenas[1].imagen.nota) && kieVisto.creadas.length === 2 && /\.jpg$/.test(pk.escenas[0].imagen.ruta), "kie de mentira: imagen 1 lista (3 créditos, PNG convertido a JPG); la 2 tarda de más y se reporta como fallo sin tumbar el trabajo");
  kieVisto.listas = true;
  crmFalso.encolar(K, "imagenes", [2]); // OTRO trabajo para la misma escena
  r = await atender(depsKie);
  ok(r.ok && pk.escenas[1].imagen.estado === "por-aprobar" && kieVisto.creadas.length === 2 && pk.costo.creditos === 6, "kie: al volver a pedir esa escena (en otro trabajo) se retoma la tarea ya creada: no se crea ni se paga otra");
  ok([...kieVisto.auth].every((a) => a === "" || a === "Bearer clave-kie-de-mentira"), "kie imagen: la clave solo viaja a la API (la descarga va sin ella)");
  crmFalso.crearProyecto("guion-kie-402", "9:16", contexto(), [
    { n: 1, tipo: "generada", duracion: 4, voz: "", promptImagen: "SIN-CREDITOS uno", promptVideo: "v" },
    { n: 2, tipo: "generada", duracion: 4, voz: "", promptImagen: "dos", promptVideo: "v" },
  ]);
  crmFalso.encolar("guion-kie-402", "imagenes");
  const creadasAntes = kieVisto.creadas.length;
  // De a una, para ver el corte: con varias a la vez, las que ya salieron reciben cada una su 402.
  r = await atender({ ...depsKie, limites: crearLimites({ ...cfgKie, config: { ...cfgKie.config, paralelo: { ...cfgKie.config.paralelo, imagenes: 1 } } }) });
  const p402 = crmFalso.proyectos.get("guion-kie-402");
  ok(r.ok && p402.escenas.every((e) => e.imagen.estado === "fallo" && /402/.test(e.imagen.nota)) && kieVisto.creadas.length === creadasAntes, "kie sin créditos (402 con HTTP 200): las escenas quedan en fallo con el motivo y no se sigue pidiendo a ciegas");
  kieFalso.close();

  // =============================================== proyecto horizontal ====
  const H = "guion-horizontal";
  crmFalso.crearProyecto(H, "16:9", contexto(), [
    { n: 1, paso: 1, tipo: "generada", duracion: 4, voz: "¿Cansado de dormir mal?", promptImagen: "Hombre desvelado en su sala", promptVideo: "Se frota los ojos" },
    { n: 2, paso: 3, tipo: "foto-real", duracion: 3, voz: "Mira el frasco real.", fotoUrl: crmFalso.fijo("alta.jpg"), movimiento: "alejar" },
    { n: 3, paso: 5, tipo: "cierre", duracion: 5, voz: "Pídelo hoy con envío gratis.", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
  ]);
  crmFalso.encolar(H, "imagenes");
  await atender();
  crmFalso.aprobar(H, "imagen", 1);
  crmFalso.encolar(H, "clips");
  await atender();
  crmFalso.aprobar(H, "clip", 1);
  crmFalso.encolar(H, "armado");
  r = await atender();
  tiempos.push(["armado completo, horizontal (3 escenas)", r.armado.segundos]);
  const finalH = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  info = await probar(finalH);
  ok(r.ok && info.video.width === 1920 && info.video.height === 1080 && Math.abs(info.dura - 12) < 0.25 && info.pistas === 2, `armado horizontal: ${info.video.width}x${info.video.height}, ${info.dura.toFixed(2)} s, video + audio`);
  const cH = r.armado.cierres[0];
  await fotograma(finalH, cH.inicio + 1.0, path.join(capturas, "horizontal-cierre-con-subtitulo.png"));
  await fotograma(finalH, cH.inicio + 4.5, path.join(capturas, "horizontal-cierre-final.png"));
  await fotograma(finalH, 4 + 0.1, path.join(capturas, "horizontal-foto-real-alta-alejar-inicio.png"));
  await fotograma(finalH, 4 + 2.9, path.join(capturas, "horizontal-foto-real-alta-alejar-fin.png"));
  fs.copyFileSync(finalH, path.join(capturas, "horizontal-final.mp4"));

  // ================================== quién habla, acento, uniones, música, análisis ====
  {
    // ---- acento e idioma: salen del trabajo; si no, del país ----
    const con = (extra) => ({ formato: "ugc", opciones: {}, contexto: { pais: "CO" }, ...extra });
    const porPais = (p) => habla.acentoPara(base, con({ contexto: { pais: p } }));
    ok(/España/.test(porPais("ES")) && /México/.test(porPais("MX")) && /Colombia/.test(porPais("CO")) && /Argentina/.test(porPais("AR")) && /Chile/.test(porPais("CL")) && /Perú/.test(porPais("PE")) && /Ecuador/.test(porPais("EC")) && porPais("US") === "español latino neutro" && porPais("") === "español latino neutro" && /Colombia/.test(porPais("Colombia")) && /España/.test(porPais("España")), "acento por país cuando el trabajo no lo dice: España → castellano peninsular; MX, CO, AR, CL, PE, EC → el suyo; el resto → español neutro");
    ok(habla.acentoPara(base, con({ contexto: { pais: "CO", voz: { acento: "español paisa de Medellín" } } })) === "español paisa de Medellín" && habla.acentoPara(base, con({ contexto: { pais: "BR", voz: { idioma: "portugués de Brasil" } } })) === "portugués de Brasil" && /México/.test(habla.acentoPara(base, con({ contexto: { pais: "CO", voz: { pais: "MX" } } }))), "acento: lo que manda el trabajo (contexto.voz.acento, idioma o país) le gana al país del proyecto");
    const tVoz = con({ imagenesProducto: [], contexto: { pais: "MX", voz: { descripcion: "mujer de unos 35 años, voz cálida y cercana" } } });
    const p1 = kieVideo.armarEntrada(base, { escena: { prompt: "Mujer en su cocina", duracion: 8, usaImagenProducto: false, voz: "Mira lo que encontré." }, trabajo: tVoz, relacion: "9:16", audio: "veo" }, kieVideo.modeloPara(base, tVoz, false)).input.prompt;
    const p2 = kieVideo.armarEntrada(base, { escena: { prompt: "La misma mujer en la sala", duracion: 8, usaImagenProducto: false, voz: "Y funciona." }, trabajo: tVoz, relacion: "9:16", audio: "veo" }, kieVideo.modeloPara(base, tVoz, false)).input.prompt;
    const lineaVoz = (p) => p.split("\n").find((l) => l.startsWith("Voz:"));
    ok(/dice a cámara, en español de México/.test(p1) && /"Mira lo que encontré\."/.test(p1) && lineaVoz(p1) && lineaVoz(p1) === lineaVoz(p2) && /Sin música de fondo/.test(p1) && !/español latino,/.test(p1), "prompt del clip: la frase con el acento del país y la MISMA descripción de voz en todas las escenas");
    const tNarr = con({ formato: "historia", imagenesProducto: [], contexto: { pais: "ES" } });
    const p3 = kieVideo.armarEntrada(base, { escena: { prompt: "Un muñeco de plastilina camina", duracion: 8, usaImagenProducto: false, voz: "Érase una vez." }, trabajo: tNarr, relacion: "9:16", audio: "veo" }, kieVideo.modeloPara(base, tNarr, false)).input.prompt;
    ok(/Narrador fuera de cámara/.test(p3) && /castellano peninsular/.test(p3) && !/dice a cámara/.test(p3), "formatos narrados (historia, crochet, esqueleto, plastilina): se pide narrador fuera de cámara");
    const d = (formato, voz, tts) => habla.decidirAudio(base, { formato, opciones: voz === undefined ? {} : { voz } }, tts).modo;
    ok(["ugc", "historia", "crochet", "esqueleto", "plastilina"].every((f) => d(f, undefined, false) === "veo" && d(f, true, true) === "veo") && d("ugc", "elevenlabs", true) === "elevenlabs" && d("ugc", "elevenlabs", false) === "veo" && d("ugc", false, true) === "ninguno" && d("musica", undefined, true) === "ninguno", "audio por defecto: TODOS los formatos con el audio del clip; ElevenLabs solo si el trabajo lo pide y hay clave; «voz: false» = sin voz");
  }

  // ---- clips que hablan: aviso de clip mudo, recorte de silencios, volumen parejo, entrada en seco ----
  // Proveedor de mentira cuyos clips traen audio, como Veo: silencio + «frase» (un tono) + silencio.
  const formas = {
    1: { antes: 1.0, frase: 3.0, despues: 2.0, vol: 4 }, // silencios largos a los dos lados, fuerte (el tono de ffmpeg nace a -18 dB)
    2: { antes: 0.4, frase: 3.0, despues: 0.5, vol: 1 }, // silencios cortos, 12 dB más bajo
    3: { antes: 0, frase: 0, despues: 4.0, vol: 0 }, // tiene frase en el guion pero el clip volvió en silencio
  };
  const hablador = {
    nombre: "hablador-de-mentira",
    daAudio: true,
    comprobar: () => null,
    async generarEscena(c) {
      const f = formas[c.escena.n];
      const total = f.antes + f.frase + f.despues;
      const audio = f.frase ? `sine=frequency=440:duration=${f.frase},volume=${f.vol},adelay=${Math.round(f.antes * 1000)}:all=1,apad=whole_dur=${total}` : `anullsrc=r=44100:cl=mono,atrim=duration=${total}`;
      await c.ff.ffmpeg(["-f", "lavfi", "-i", `testsrc2=s=720x1280:r=24:d=${total}`, "-f", "lavfi", "-i", audio, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", String(total), c.salida], c.carpeta);
      return { segundos: 8, modelo: "hablador", costoUsd: null };
    },
  };
  const HB = "guion-hablado";
  const ph = crmFalso.crearProyecto(HB, "9:16", contexto(), [
    { n: 1, tipo: "generada", duracion: 6, voz: "¿A ti también te pasa esto?", promptImagen: "i1", promptVideo: "v1" },
    { n: 2, tipo: "generada", duracion: 3, voz: "Yo lo arreglé con esto.", promptImagen: "i2", promptVideo: "v2" },
    { n: 3, tipo: "generada", duracion: 4, voz: "Míralo bien.", promptImagen: "i3", promptVideo: "v3" },
    { n: 4, tipo: "cierre", duracion: 5, voz: "Pídelo hoy.", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
  ]);
  for (const e of ph.escenas.filter((x) => x.tipo === "generada")) Object.assign(e.imagen, { estado: "aprobada", url: crmFalso.fijo("cuadrada.jpg"), intentos: 1 });
  const depsH = { ...deps, proveedor: hablador };
  const tHC = crmFalso.encolar(HB, "clips");
  r = await atender(depsH);
  const repH = progresoDe(tHC.id).flatMap((p) => p.escenas || []);
  ok(r.ok && repH.filter((e) => e.aviso).length === 1 && /^sin audio/.test(repH.find((e) => e.n === 3).aviso) && repH.find((e) => e.n === 3).ruta && !repH.find((e) => e.n === 1).aviso, "clip con frase que vuelve sin audio: se avisa EN LA ESCENA (campo «aviso») y el clip se entrega igual");
  for (const n of [1, 2, 3]) crmFalso.aprobar(HB, "clip", n);
  crmFalso.encolar(HB, "armado");
  r = await atender(depsH);
  const eH = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  const sg = r.armado.segmentos;
  const dirCacheH = path.join(datos, "cache");
  const m1 = await ff.medirAudio(sg[0].archivo, dirCacheH);
  const m2 = await ff.medirAudio(sg[1].archivo, dirCacheH);
  ok(r.ok && Math.abs(sg[0].dura - 3.4) < 0.15 && m1.desde < 0.15 && Math.abs(m1.hasta - m1.desde - 3.0) < 0.2, `uniones: al clip con 1 s de silencio antes y 2 s después se le quitan los silencios (6 s → ${sg[0].dura.toFixed(2)} s) y la frase queda entera (${(m1.hasta - m1.desde).toFixed(2)} s de 3)`);
  ok(Math.abs(sg[1].dura - 3.75) < 0.1 && /escena 2 quedó en 3\.[78] s \(se pedían 3\) para no cortar la frase/.test(eH.avisos.join(" ")), `uniones: si la duración pedida (3 s) cortaría la frase, manda la frase (${sg[1].dura.toFixed(2)} s) y se avisa`);
  ok(Math.abs(m1.lufs - m2.lufs) < 1.5 && Math.abs(m1.lufs - -16) < 1.5, `volumen parejo entre clips: llegaban con 12 dB de diferencia y quedan a ${m1.lufs} y ${m2.lufs} LUFS (objetivo -16)`);
  const finalHablado = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  const mF = await ff.medirAudio(finalHablado, undefined);
  ok(mF.desde < 0.15 && sg[0].subtitulo && sg[0].subtitulo.desde < 0.2 && Math.abs(sg[1].subtitulo.desde - 0.4) < 0.15, `entrada en seco: el video arranca con la frase a los ${mF.desde.toFixed(2)} s (el clip traía 1 s de silencio), y los subtítulos empiezan donde empieza la frase de cada escena`);
  ok(JSON.stringify(r.armado.sinAudio) === "[3]" && /escena 3 llegó en silencio/.test(eH.avisos.join(" ")) && eH.sinVoz === false && JSON.stringify(r.armado.sinLocucion) === "[4]", "nunca mudo sin avisar: el clip en silencio y la escena de foto sin locución quedan en los avisos del video");
  ok(/SIN música/.test(eH.avisos.join(" ")) && r.armado.conMusica === false, "música: con la carpeta de música vacía el video sale sin música, lo dice y NO falla");
  ok(/SIN VOZ en todas/.test(entrega.avisos.join(" ")), "nunca mudo sin avisar: un video donde ninguna escena tiene voz lo dice en el primer aviso");

  // ---- música por tono desde la carpeta local ----
  fs.mkdirSync(path.join(carpetas.musica, "Suspenso"), { recursive: true });
  fs.mkdirSync(path.join(carpetas.musica, "neutro"), { recursive: true });
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=110:duration=5", "-c:a", "libmp3lame", "-b:a", "128k", "tension.mp3"], path.join(carpetas.musica, "Suspenso"));
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=330:duration=5,volume=0.1", "-c:a", "libmp3lame", "-b:a", "128k", "suave.mp3"], path.join(carpetas.musica, "neutro"));
  crmFalso.encolar(HB, "armado", null, { tonoMusica: "suspenso" });
  r = await atender(depsH);
  const conTono = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  const tramoVol = async (archivo, desde, dura) => {
    const { se } = await correr(cfg.ffmpeg, ["-hide_banner", "-ss", String(desde), "-t", String(dura), "-i", archivo, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
    return Number((/mean_volume: (-?[\d.]+) dB/.exec(se) || [])[1]);
  };
  const s3 = r.armado.segmentos[2];
  const volFrase = await tramoVol(conTono, 0.3, 2.4); // la frase de la escena 1
  const volSoloMusica = await tramoVol(conTono, s3.inicio + 0.5, 3); // la escena 3 no tiene voz: solo suena la música
  ok(r.ok && r.armado.conMusica && r.armado.tonoMusica === "suspenso" && r.armado.stats.segmentosHechos === 0 && volSoloMusica > -45 && volFrase - volSoloMusica > 8, `música por tono (opciones.tonoMusica: "suspenso"): sale de la carpeta local, sin recodificar el video, y queda por debajo de la voz (${volFrase} dB la frase, ${volSoloMusica} dB la música sola)`);
  crmFalso.encolar(HB, "armado", null, { tonoMusica: "Energía" });
  r = await atender(depsH);
  ok(r.ok && r.armado.tonoMusica === "neutro" && /No hay pistas de tono «energia».*se usó una de «neutro»/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "música: si no hay pistas del tono pedido se usa la de respaldo y se avisa");
  crmFalso.encolar(HB, "armado");
  r = await atender(depsH);
  ok(r.ok && r.armado.tonoMusica === "neutro", "música: sin tono en el trabajo se usa el tono por defecto de config.json");
  crmFalso.encolar(HB, "armado", null, { musica: false });
  r = await atender(depsH);
  ok(r.ok && !r.armado.conMusica && !/música/i.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.filter((a) => !/^Audio:/.test(a)).join(" ")), "música: con «musica: false» no se pone ni se avisa");
  crmFalso.encolar(HB, "armado", null, { musica: "http://127.0.0.1:9/no-existe.mp3" });
  r = await atender(depsH);
  ok(r.ok && !r.armado.conMusica && /SIN música/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "música: si la pista del trabajo no se puede bajar, el video sale sin música y lo dice (no falla)");

  // ---- música generada por Kie (preparado, apagado por defecto): servidor de mentira ----
  const km = { creadas: [], consultas: 0 };
  const kieMusica = http.createServer((req, res) => {
    let c = "";
    req.on("data", (x) => (c += x));
    req.on("end", () => {
      const json = (o) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      if (req.url === "/pista.mp3") return res.writeHead(200), res.end(fs.readFileSync(path.join(fijos, "musica.mp3")));
      if (req.method === "POST" && req.url === "/api/v1/jobs/createTask") {
        km.creadas.push(JSON.parse(c));
        return json({ code: 200, msg: "success", data: { taskId: `musica_${km.creadas.length}` } });
      }
      if (req.url.startsWith("/api/v1/jobs/recordInfo")) {
        return json({ code: 200, msg: "success", data: ++km.consultas < 2 ? { state: "generating" } : { state: "success", creditsConsumed: 12, response: { data: [{ audio_url: `http://127.0.0.1:${kieMusica.address().port}/pista.mp3`, duration: 6 }, { audio_url: `http://127.0.0.1:${kieMusica.address().port}/pista.mp3`, duration: 6 }] } } });
      }
      json({ code: 404, msg: "not found" });
    });
  });
  await new Promise((res) => kieMusica.listen(0, "127.0.0.1", res));
  ok(cfg.config.musica.generarConKie === false, "música generada por Kie: viene APAGADA en config.json");
  const cfgM = { ...base, kieKey: "clave-kie-de-mentira", kieBase: `http://127.0.0.1:${kieMusica.address().port}`, config: { ...base.config, musica: { ...base.config.musica, generarConKie: true, kie: { ...base.config.musica.kie, consultarCadaSegundos: 0.1 } } } };
  crmFalso.encolar(HB, "armado", null, { tonoMusica: "emotivo" });
  r = await atender({ ...depsH, cfg: cfgM });
  const pedidaM = km.creadas[0] || { input: {} };
  ok(r.ok && r.armado.tonoMusica === "emotivo" && km.creadas.length === 1 && pedidaM.model === "ai-music-api/generate" && pedidaM.input.instrumental === true && pedidaM.input.custom_mode === true && pedidaM.input.duration >= 10 && fs.readdirSync(path.join(carpetas.musica, "emotivo")).some((f) => /^kie-.*\.mp3$/.test(f)) && /generada con Kie \(12 créditos\)/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "música generada por Kie (de mentira, encendida solo en la prueba): pide una instrumental del tono, la guarda en la carpeta y avisa los créditos");
  crmFalso.crearHijo(HB, "hablado-variacion");
  crmFalso.encolar("hablado-variacion", "armado", null, { tonoMusica: "emotivo" });
  r = await atender({ ...depsH, cfg: cfgM });
  ok(r.ok && km.creadas.length === 1 && r.armado.tonoMusica === "emotivo", "música generada: el siguiente video de ese tono reutiliza la pista guardada (no se paga otra)");
  kieMusica.close();

  // ---- lo que manda el CRM desde el 14-oct: contexto.voz y locucion por escena ----
  {
    const tCrm = { formato: "ugc", imagenesProducto: [], opciones: {}, contexto: { pais: "CO", voz: { motor: "clip", idioma: "es-MX", acento: "español de México, tono cercano", descripcion: "mujer de 30 años" } } };
    const conBloque = "La mujer levanta el frasco.\nAUDIO: la persona en pantalla dice, en español de México: \"Mira esto.\" Voz: mujer de 30 años.";
    const pA = kieVideo.armarEntrada(base, { escena: { prompt: conBloque, duracion: 8, usaImagenProducto: false, voz: "Mira esto.", locucion: "camara" }, trabajo: tCrm, relacion: "9:16", audio: "veo", audioEnPrompt: habla.audioYaEnPrompt(tCrm, conBloque) }, kieVideo.modeloPara(base, tCrm, false)).input.prompt;
    ok((pA.match(/Mira esto\./g) || []).length === 1 && !/Sin diálogo/.test(pA) && !/dice a cámara, en/.test(pA), "si el CRM ya trae su bloque «AUDIO» en el prompt (contexto.voz.motor: \"clip\"), el trabajador no agrega otra instrucción de voz ni pide «sin diálogo»");
    ok(habla.decidirAudio(base, tCrm, true).modo === "veo" && habla.decidirAudio(base, { ...tCrm, contexto: { voz: { motor: "narracion" } } }, true).modo === "elevenlabs" && habla.decidirAudio(base, { ...tCrm, contexto: { voz: { motor: "narracion" } } }, false).modo === "veo" && /México/.test(habla.acentoPara(base, { contexto: { pais: "CO", voz: { idioma: "es-MX" } } })) && /inglés/.test(habla.acentoPara(base, { contexto: { voz: { idioma: "en-US" } } })), "contexto.voz: motor «clip» nunca usa ElevenLabs aunque haya clave; «narracion» sí (si hay clave); el idioma «es-MX» decide el acento cuando no viene escrito");
    ok(habla.seHabla({ voz: "Hola", locucion: "camara" }) && habla.seHabla({ voz: "Hola", locucion: "narrador" }) && habla.seHabla({ voz: "Hola" }) && !habla.seHabla({ voz: "50% OFF", locucion: "texto" }) && !habla.seHabla({ voz: "", locucion: "camara" }) && habla.esNarrado(base, { formato: "ugc" }, { locucion: "narrador" }) && !habla.esNarrado(base, { formato: "historia" }, { locucion: "camara" }), "locucion por escena: «camara» y «narrador» se dicen; «texto» y «sin-voz» no (solo subtítulo); la escena le gana al formato");
  }
  // Una escena de solo texto (locucion «texto») con un clip en silencio: lleva subtítulo y NO cuenta como clip mudo.
  ph.escenas[2].locucion = "texto";
  crmFalso.encolar(HB, "armado", null, { musica: false });
  r = await atender(depsH);
  ok(r.ok && JSON.stringify(r.armado.sinAudio) === "[]" && r.armado.segmentos[2].subtitulo && !/escena 3 llegó/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "locucion «texto»: la escena lleva su subtítulo y no se reporta como clip sin audio");
  delete ph.escenas[2].locucion;

  // ---- fotogramas del video armado para el control de calidad del CRM, y confirmación de subtítulos ----
  const eQ = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  const q1 = eQ.fotogramas && eQ.fotogramas.length ? crmFalso.archivos.get(eQ.fotogramas[0]) : null;
  ok(eQ.subtitulos === true && Array.isArray(eQ.fotogramas) && eQ.fotogramas.length === 6 && eQ.fotogramas.every((f, i) => f.endsWith(`final-f${i + 1}.jpg`) && crmFalso.archivos.has(f)) && q1 && q1[0] === 0xff && q1[1] === 0xd8, "armado: manda 6 fotogramas del video ya armado (dos de los primeros 3 s y uno del cierre) (subida «fotograma-final») y confirma «subtitulos: true» para el control de calidad del CRM");
  if (q1) {
    fs.writeFileSync(path.join(capturas, "control-fotograma-1-gancho.jpg"), q1);
    fs.writeFileSync(path.join(capturas, "control-fotograma-5-cierre.jpg"), crmFalso.archivos.get(eQ.fotogramas[5]));
  }

  // ---- etapa «analisis»: desarmar un video de referencia ----
  // Un «anuncio» de prueba hecho con ffmpeg: tres tomas (2 s + 3 s + 1,5 s) con audio.
  await ff.ffmpeg(
    ["-f", "lavfi", "-i", "color=c=0xB71C1C:s=640x1136:r=25:d=2", "-f", "lavfi", "-i", "testsrc2=s=640x1136:r=25:d=3", "-f", "lavfi", "-i", "color=c=0x0D47A1:s=640x1136:r=25:d=1.5", "-f", "lavfi", "-i", "sine=frequency=500:duration=6.5,volume=4",
      "-filter_complex", "[0:v][1:v][2:v]concat=n=3:v=1:a=0[v]", "-map", "[v]", "-map", "3:a", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "6.5", "referencia.mp4"],
    fijos,
  );
  const tAn = crmFalso.encolarAnalisis(crmFalso.fijo("referencia.mp4"));
  r = await atender();
  const an = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  const cerca = (a, b, t = 0.15) => Math.abs(a - b) <= t;
  ok(r.ok && an.etapa === "analisis" && cerca(an.duracion, 6.5) && an.tomas.length === 3 && cerca(an.tomas[0].hasta, 2) && cerca(an.tomas[1].hasta, 5) && cerca(an.tomas[2].hasta, 6.5), `análisis: ${an.duracion} s, ${an.tomas ? an.tomas.length : 0} tomas detectadas en ${(an.tomas || []).map((t) => `${t.desde}–${t.hasta}`).join(", ")} (el video de prueba corta en 2 y 5 s)`);
  const jpgAn = an.tomas && an.tomas[0] ? crmFalso.archivos.get(an.tomas[0].fotograma) : null;
  ok((an.tomas || []).every((t, i) => typeof t.fotograma === "string" && t.fotograma.endsWith(`/f${i + 1}.jpg`) && crmFalso.archivos.has(t.fotograma)) && jpgAn && jpgAn[0] === 0xff && jpgAn[1] === 0xd8 && typeof an.audio === "string" && an.audio.endsWith("/audio.mp3") && crmFalso.archivos.has(an.audio), "análisis: un fotograma JPG por toma (del medio) y el audio en MP3, subidos al CRM con las rutas que él entrega");
  ok(an.transcripcion === null && /TRANSCRIPCION/.test(an.transcripcionMotivo), "análisis: sin servicio de transcripción configurado devuelve transcripcion: null con el motivo (no inventa texto)");
  ok(!fs.existsSync(path.join(carpetas.trabajos, tAn.id)), "análisis: al terminar no queda nada en disco (ni el original ni los fotogramas)");
  if (jpgAn) fs.writeFileSync(path.join(capturas, "analisis-fotograma-toma-1.jpg"), jpgAn);
  crmFalso.encolarAnalisis(crmFalso.fijo("referencia.mp4"));
  r = await atender({ ...deps, cfg: { ...base, transcripcion: "simulado" } });
  const an2 = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  ok(r.ok && Array.isArray(an2.transcripcion) && an2.transcripcion.length === 2 && an2.transcripcion[1].hasta > 6 && an2.transcripcion[0].texto && !("transcripcionMotivo" in an2), "análisis: con un servicio enchufado (el de prueba) la transcripción viaja como [{ desde, hasta, texto }]: el punto de extensión funciona");
  {
    const cortes = Array.from({ length: 29 }, (_, i) => (i + 1) * 2 + (i % 3 === 0 ? 0.9 : 0)); // 30 tomas de largos distintos
    const { tomas, unidas } = require("../lib/analisis").armarTomas(cortes, 60, { tomaMinima: 0.6, maxTomas: 16 });
    ok(tomas.length === 16 && unidas === 14 && tomas[0].desde === 0 && tomas[15].hasta === 60 && tomas.every((t, i) => i === 0 || t.desde === tomas[i - 1].hasta), "análisis: si hay más cortes que tomas admite el CRM (16), se unen las más cortas y no queda ningún hueco");
  }
  const fallosAn = crmFalso.visto.fallos.length;
  crmFalso.encolarAnalisis(crmFalso.fijo("referencia.mp4"));
  r = await atender({ ...deps, cfg: { ...base, config: { ...base.config, analisis: { ...base.config.analisis, maxSegundos: 5 } } } });
  const largo = crmFalso.visto.fallos[crmFalso.visto.fallos.length - 1];
  crmFalso.encolarAnalisis(crmFalso.fijo("referencia.mp4"));
  const r4 = await atender({ ...deps, cfg: { ...base, config: { ...base.config, analisis: { ...base.config.analisis, maxMb: 0.01 } } } });
  const pesado = crmFalso.visto.fallos[crmFalso.visto.fallos.length - 1];
  crmFalso.encolarAnalisis(crmFalso.fijo("musica.mp3"));
  const r5 = await atender();
  const noVideo = crmFalso.visto.fallos[crmFalso.visto.fallos.length - 1];
  ok(!r.ok && !r4.ok && !r5.ok && crmFalso.visto.fallos.length === fallosAn + 3 && /^no analizable: el video dura 7 s y el máximo es 5 s/.test(largo.motivo) && /^no analizable: el archivo pesa más de/.test(pesado.motivo) && /^no analizable: el archivo no es un video/.test(noVideo.motivo) && fs.readdirSync(carpetas.trabajos).every((d) => !fs.existsSync(path.join(carpetas.trabajos, d, "original.bin"))), "análisis: un video demasiado largo, demasiado pesado o que no es video se rechaza con un motivo claro («no analizable: …») y el original se borra igual");
  ok(cfg.config.analisis.maxSegundos === 180 && cfg.config.analisis.maxMb === 200 && cfg.config.analisis.maxTomas === 16, "análisis: límites por defecto los acordados con el CRM (3 minutos, 200 MB, 16 tomas)");

  // ============== edición: cierre nuevo, plantillas de subtítulos, transiciones, narración ====
  {
    // ---- cifras y símbolos como se dicen ----
    const d = (t, p) => vozLib.paraDecir(t, p).texto;
    ok(d("Dos gafas por 79 €", "ES") === "Dos gafas por 79 euros" && d("Solo 79€ hoy", "ES") === "Solo 79 euros hoy" && d("Elimina el 99,14 % del ruido", "ES") === "Elimina el 99,14 por ciento del ruido" && d("99,14% menos", "ES") === "99,14 por ciento menos" && d("2x1 esta semana", "ES") === "dos por uno esta semana" && d("Llévalo por $89.900.", "CO") === "Llévalo por 89.900 pesos." && d("Por US$20", "CO") === "Por 20 dólares" && d("1 € más", "ES") === "1 euro más", "narración: las cifras se escriben como se dicen («79 €» → «79 euros», «99,14 %» → «99,14 por ciento», «2x1» → «dos por uno», «$89.900» → pesos en Colombia)");
    const pd = vozLib.paraDecir("Solo 79€ y 2x1", "ES");
    const dichas = pd.texto.split(" ").map((t, i) => ({ texto: t, inicio: i, fin: i + 0.9 }));
    const tg = vozLib.tiemposDelGuion(pd.originales, pd.grupos, dichas);
    ok(tg.length === 4 && tg[1].texto === "79€" && tg[1].inicio === 1 && tg[1].fin === 2.9 && tg[3].texto === "2x1" && tg[3].fin === 6.9 && vozLib.tiemposDelGuion(pd.originales, pd.grupos, dichas.slice(1)) === null, "narración: cada palabra ESCRITA del guion recibe el tiempo de lo que se dijo por ella (el subtítulo muestra «79€», la voz dice «79 euros»)");
    const al = vozLib.palabrasDeAlineacion({ characters: [..."Hola tú"], character_start_times_seconds: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], character_end_times_seconds: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7] });
    ok(al.length === 2 && al[0].texto === "Hola" && al[0].fin === 0.4 && al[1].inicio === 0.5 && al[1].fin === 0.7, "narración: de la alineación por letras de ElevenLabs salen las palabras con su tiempo");
    const conPais = { ...base, elevenVoz: "vozDelEnv0000000001", config: { ...base.config, voz: { ...base.config.voz, porPais: { ES: [{ nombre: "Lucía", sexo: "mujer", id: "vozEspanola000000001" }, { nombre: "Pablo", sexo: "hombre", id: "vozEspanol0000000002" }] } } } };
    ok(vozLib.vozPara(conPais, { contexto: { pais: "ES" } }).id === "vozEspanola000000001" && vozLib.vozPara(conPais, { contexto: { voz: { idioma: "es-ES", sexo: "hombre" } } }).id === "vozEspanol0000000002" && vozLib.vozPara(conPais, { contexto: { pais: "CO" } }).id === "vozDelEnv0000000001" && vozLib.vozPara(base, { contexto: { pais: "ES" } }).origen === "ELEVENLABS_VOICE_ID" && vozLib.vozPara(conPais, { contexto: { pais: "ES", voz: { vozId: "vozDelTrabajo00000001" } } }).id === "vozDelTrabajo00000001", "voz por país: si config.json tiene una voz para el país (y sexo) se usa esa; si no, la del .env; los «id» vienen vacíos, no inventados");

    // ---- transiciones: con qué criterio se eligen ----
    const tr = (o) => efectos.elegirTransicion({ semilla: "x", ...o });
    const rapidas = [1, 2, 3, 4].map((i) => tr({ indice: i, inicio: 1, ritmo: "rapido" }));
    const medias = [1, 2, 3, 4, 5, 6].map((i) => tr({ indice: i, inicio: 20, ritmo: "medio" }));
    ok(tr({ indice: 0, inicio: 0 }) === "corte" && tr({ indice: 3, inicio: 10, tipo: "cierre" }) === "corte" && tr({ indice: 2, inicio: 10, pedida: "glitch" }) === "glitch" && rapidas.every((t) => t !== "corte") && medias.includes("corte") && efectos.CICLO === undefined && tr({ indice: 1, inicio: 1 }) === tr({ indice: 1, inicio: 1, ritmo: "rapido" }) && tr({ indice: 1, inicio: 9 }) === tr({ indice: 1, inicio: 9, ritmo: "medio" }) && tr({ indice: 2, inicio: 5, activas: false }) === "corte", `transiciones: el video entra en seco, hacia el cierre va corte, «rapido» no usa cortes secos (${rapidas.join(", ")}), «medio» los alterna (${medias.join(", ")}); sin ritmo, rápido en los primeros 3 s`);
    ok(efectos.TRANSICIONES.length === 7 && ["zoom", "barrido", "flash", "glitch", "deslizar", "fundido"].every((t) => efectos.TRANSICIONES.includes(t) && efectos.DURA[t] > 0 && efectos.DURA[t] <= 0.3), "transiciones: siete (corte, zoom, barrido, flash, glitch, deslizar, fundido), todas de tres décimas de segundo o menos");
    const calmadas = [1, 2, 3, 4, 5, 6, 7].map((i) => tr({ indice: i, inicio: i * 4, ritmo: "calmado" }));
    ok(calmadas.every((t) => t === "corte" || t === "fundido") && calmadas.includes("fundido"), `ritmo «calmado» (el tercero que manda el CRM): solo cortes secos y fundidos suaves (${calmadas.join(", ")})`);

    // ---- plantillas de subtítulos ----
    const palabras = subt.palabrasConTiempo("Dermatológicamente probado: bloquea el 99,14 % de la luz azul. ¡Pídelas hoy!", 0.2, 5);
    const H16 = 1920;
    let bien = true;
    const fuentesVistas = new Set();
    for (const estilo of subt.ESTILOS) {
      const s = subt.subtitulosDeEscena({ estilo, palabras, ancho: 1080, alto: H16, marca: "#0553C9", enfasis: ["probado", "hoy"], hasta: 6 });
      fuentesVistas.add(s.estilos[0].split(",")[1]);
      fs.writeFileSync(path.join(datos, "cache", `prueba-${estilo}.ass`), subt.documentoAss({ ancho: 1080, alto: H16, estilos: s.estilos, eventos: s.eventos }));
      // Se dibuja de verdad y se mira dónde cae cada cuadro: nada fuera de la zona segura.
      const texto = await ff.informe(["-f", "lavfi", "-i", "color=black:s=1080x1920:r=10:d=6", "-vf", `ass=prueba-${estilo}.ass:fontsdir=fuentes,bbox=min_val=40`], path.join(datos, "cache"));
      const cajas = [...texto.matchAll(/x1:(\d+) x2:(\d+) y1:(\d+) y2:(\d+)/g)].map((m) => m.slice(1).map(Number));
      const arriba = Math.min(...cajas.map((c) => c[2]));
      const abajo = Math.max(...cajas.map((c) => c[3]));
      const izq = Math.min(...cajas.map((c) => c[0]));
      const der = Math.max(...cajas.map((c) => c[1]));
      const okZona = cajas.length > 20 && arriba >= H16 * 0.12 && abajo <= H16 * 0.84 && izq >= 1080 * 0.03 && der <= 1080 * 0.97;
      if (!okZona || !s.eventos.length || /FFE600|00E6FF/i.test(s.eventos.join("") + s.estilos.join(""))) {
        bien = false;
        console.log(`     plantilla «${estilo}» fuera de zona:`, { cuadros: cajas.length, arriba, abajo, izq, der });
      }
    }
    ok(bien && subt.ESTILOS.length === 5 && fuentesVistas.size === 5, `subtítulos: 5 plantillas (${subt.ESTILOS.join(", ")}) dibujadas de verdad con una frase larga: todas caen entre el 12 % y el 84 % del alto, sin salirse por los lados, y ninguna usa el amarillo fijo`);
    const sinMarca = subt.subtitulosDeEscena({ estilo: "karaoke", palabras, ancho: 1080, alto: H16, marca: "", hasta: 6 });
    const conMarca = subt.subtitulosDeEscena({ estilo: "karaoke", palabras, ancho: 1080, alto: H16, marca: "#0553C9", hasta: 6 });
    ok(!/\\1c&H(?!FFFFFF)/.test(sinMarca.eventos.join("")) && new RegExp(`\\\\1c&H${subt.bgr(subt.colorLegible("#0553C9"))}&`).test(conMarca.eventos.join("")) && subt.luminancia(subt.colorLegible("#0553C9")) >= 0.42 && subt.colorLegible("#FFD60A") === "FFD60A", `subtítulos: el resaltado es el color de la marca (un azul oscuro se aclara a #${subt.colorLegible("#0553C9")} para leerse sobre video); sin color de marca, blanco con contorno`);
    ok(subt.elegirEstilo("Máquina") === "maquina" && subt.elegirEstilo("palabra") === "karaoke" && subt.elegirEstilo("caja") === "titular" && subt.elegirEstilo("limpio") === "limpio" && subt.elegirEstilo("impacto") === "impacto" && subt.elegirEstilo("") === "karaoke" && subt.elegirEstilo(undefined, "x") === "karaoke" && subt.elegirEstilo("no-existe", "z") === "karaoke" && subt.elegirEstilo("auto", "producto A") === subt.elegirEstilo("auto", "producto A") && new Set(["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].map((x) => subt.elegirEstilo("auto", x))).size >= 4, "subtítulos: valen los nombres que manda el CRM (palabra → karaoke, caja → titular, limpio, impacto) y los cinco propios; sin valor o desconocido → karaoke; «auto» → una fija por producto, repartida entre las cinco");

    // ---- tarjeta de cierre: textos, color y reparto ----
    const tc = textosDelCierre({ oferta: "2x1: dos gafas por 79 €", llamadoALaAccion: "Pídelas", titular: "2x1", detalle: "Dos gafas por 79 €", color: "#0553C9" });
    const viejo = textosDelCierre({ oferta: "2 unidades por $89.900", llamadoALaAccion: "Pide el tuyo" });
    const soloDetalle = textosDelCierre({ oferta: "x", detalle: "Dos gafas por 79 €", color: "#FFD60A" });
    ok(tc.principal === "2x1" && tc.esTitular && tc.detalle === "Dos gafas por 79 €" && tc.color === "0553C9" && tc.textoBoton === "FFFFFF" && viejo.principal === "2 unidades por $89.900" && viejo.detalle === "" && viejo.color === "0553C9" && soloDetalle.principal === "" && soloDetalle.detalle === "Dos gafas por 79 €" && soloDetalle.textoBoton === "0B1220", "cierre: lee titular, detalle y color; trabajo viejo sin titular ni detalle → la oferta entera; sin color → #0553C9; botón claro → texto oscuro");
    const pisa = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    fs.copyFileSync(path.join(fijos, "cuadrada.jpg"), path.join(datos, "cache", "f-prueba-cuadrada.jpg"));
    await ff.ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=900x1200:d=1", "-frames:v", "1", "-q:v", "3", "-update", "1", "f-prueba-oscura.jpg"], path.join(datos, "cache"));
    let reparto = true;
    const casos = [
      [1080, 1920, { titular: "2x1", detalle: "Dos gafas Ceryon Eclipse por 79 €", llamadoALaAccion: "Pídelas en el enlace de abajo", color: "#0553C9" }],
      [1080, 1920, { titular: "50% de descuento hoy", detalle: "Lleva tres y paga dos solo por esta semana, con envío gratis a todo el país", llamadoALaAccion: "Toca el botón de abajo y pide el tuyo antes de que se agoten", urgencia: "Solo esta semana", color: "#C2185B" }],
      [1080, 1920, { oferta: "Lleva 3 y paga 2 solo por esta semana: envío gratis a todo el país y pago contra entrega", llamadoALaAccion: "Pide el tuyo" }],
      [1920, 1080, { titular: "2x1", detalle: "Dos gafas Ceryon Eclipse por 79 €", llamadoALaAccion: "Pídelas en el enlace de abajo", urgencia: "Últimos días", color: "#0553C9" }],
      [1080, 1080, { titular: "2x1", detalle: "Dos gafas por 79 €", llamadoALaAccion: "Pídelas ya", color: "#FFD60A" }],
    ];
    let conUrgencia = null;
    for (const [w, h, c] of casos) {
      const t = await prepararCierre({ ff, carpeta: path.join(datos, "cache"), ancho: w, alto: h, fps: 30, dura: 5, foto: "f-prueba-cuadrada.jpg", previa: null, cierre: c });
      const z = [t.zonas.producto, t.zonas.urgencia, t.zonas.principal, t.zonas.detalle, t.zonas.boton].filter(Boolean);
      const dentro = z.every((r) => r.x >= 0 && r.x + r.w <= w && r.y >= t.zonas.seguro.y0 && r.y + r.h <= t.zonas.seguro.y1);
      const libre = z.every((a, i) => z.every((b, j) => i === j || !pisa(a, b)));
      if (c.urgencia && h > w) conUrgencia = t;
      if (!dentro || !libre || /FFE600|00E6FF/i.test(t.eventos.join("")) || (h > w && t.zonas.producto.w < w * 0.3)) {
        reparto = false;
        console.log("     reparto malo:", w, h, JSON.stringify(t.zonas));
      }
    }
    const normal = await prepararCierre({ ff, carpeta: path.join(datos, "cache"), ancho: 1080, alto: 1920, fps: 30, dura: 5, foto: "f-prueba-cuadrada.jpg", previa: null, cierre: casos[0][2] });
    ok(reparto && Math.abs(normal.zonas.producto.w - 1080 * 0.62) < 12 && normal.zonas.principal.h > 150 && new RegExp(`\\\\1c&H${subt.bgr("0553C9")}&`).test(normal.eventos.join("")), `tarjeta de cierre: producto, titular, detalle, botón y etiqueta no se pisan y quedan entre el 12 % de arriba y el 16 % de abajo (vertical, horizontal y cuadrado; textos cortos y muy largos); el producto ocupa ${Math.round((normal.zonas.producto.w / 1080) * 100)} % del ancho y el botón lleva el color de la marca`);
    ok(conUrgencia && conUrgencia.zonas.urgencia && conUrgencia.zonas.urgencia.y >= conUrgencia.zonas.detalle.y + conUrgencia.zonas.detalle.h && conUrgencia.zonas.urgencia.y + conUrgencia.zonas.urgencia.h <= conUrgencia.zonas.boton.y && conUrgencia.eventos.some((e) => /SOLO ESTA SEMANA/.test(e)) && !normal.zonas.urgencia && !normal.eventos.some((e) => /SEMANA|ÚLTIM/i.test(e)), "cierre con urgencia: una línea corta en mayúsculas entre el detalle y el botón, solo si el CRM manda `urgencia` y con sus palabras; si no la manda, no se inventa nada");
    const oscura = await prepararCierre({ ff, carpeta: path.join(datos, "cache"), ancho: 1080, alto: 1920, fps: 30, dura: 5, foto: "f-prueba-oscura.jpg", previa: { archivo: "f-prueba-cuadrada.jpg", segundo: null }, cierre: casos[0][2] });
    const sinNada = await prepararCierre({ ff, carpeta: path.join(datos, "cache"), ancho: 1080, alto: 1920, fps: 30, dura: 5, foto: null, previa: null, cierre: casos[0][2] });
    ok(normal.fotoClara && normal.fondoDe === "degradado" && oscura.fondoDe === "foto" && !oscura.fotoClara && sinNada.fondoDe === "degradado" && sinNada.zonas.producto === null && /sin foto|no trae foto/.test(sinNada.avisos.join(" ")), "cierre: el fondo es la propia foto desenfocada; si la foto es de fondo blanco, el último cuadro de la escena anterior; y si no hay de dónde, un degradado del color de la marca (nunca un gris plano)");
  }

  // ---- armado con la edición nueva: cierre sin subtítulo, subtítulo que no se repite, plantilla elegida ----
  crmFalso.encolar(HB, "armado", null, { musica: false, estiloSubtitulos: "impacto" });
  r = await atender(depsH);
  ok(r.ok && r.armado.estiloSubtitulos === "impacto" && r.armado.segmentos[3].subtitulo === null && r.armado.segmentos[0].subtitulo.palabras === 6 && r.armado.cierres[0].fondo === "escena-anterior" && r.armado.transiciones[0] === "corte" && r.armado.transiciones[3] === "corte" && r.armado.transiciones.slice(1, 3).every((t) => efectos.TRANSICIONES.includes(t)), `armado: el cierre va SIN subtítulo quemado (la tarjeta ya lo dice), su fondo sale del último clip, y las escenas entran con ${r.armado.transiciones.slice(1, 3).join(" y ")}`);
  const frH = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  const cierreH = r.armado.cierres[0];
  for (const s of [0.2, 0.6, 2]) await fotograma(frH, cierreH.inicio + s, path.join(capturas, `cierre-simulado-${String(s).replace(".", "_")}s.png`));
  ph.escenas[1].voz = ph.escenas[0].voz; // dos escenas seguidas con la misma frase
  crmFalso.encolar(HB, "armado", null, { musica: false, estiloSubtitulos: "impacto" });
  r = await atender(depsH);
  ok(r.ok && r.armado.segmentos[0].subtitulo && r.armado.segmentos[1].subtitulo === null, "subtítulos: si dos escenas seguidas traen la misma frase, no se repite en pantalla");
  ph.escenas[1].voz = "Yo lo arreglé con esto.";

  // ---- apertura de cortes rápidos sobre clips que ya existen ----
  crmFalso.encolar(HB, "armado", null, { musica: false }, { apertura: [{ n: 1, desde: 1.2, hasta: 1.7 }, { n: 2, desde: 1.0, hasta: 1.6 }, { n: 1, desde: 2.5, hasta: 3.1 }, { n: 99, desde: 0, hasta: 1 }] });
  r = await atender(depsH);
  const ap = r.armado.segmentos.slice(0, 3);
  ok(r.ok && r.armado.segmentos.length === 7 && ap.every((s) => String(s.n).startsWith("apertura-") && s.dura >= 0.45 && s.dura <= 0.65 && s.subtitulo === null && s.audio === "silencio") && ap.slice(1).some((s) => s.transicion !== "corte") && r.armado.segmentos[3].n === 1, `apertura: ${ap.length} cortes de ~0,5 s sacados de clips del proyecto antes de la escena 1, sin subtítulo, con transición rápida pero sin pasarse del tope de efectos por segundo (${ap.slice(1).map((s) => s.transicion).join(", ")}); el corte que apunta a una escena que no existe se ignora`);

  // ---- apertura en cortes como la manda el CRM: UN clip de `duracionClip` s del que se usan solo los `cortes` ----
  const pedidosCortes = [];
  const pcx = crmFalso.crearProyecto("guion-cortes", "9:16", contexto(), [
    { n: 1, tipo: "generada", duracion: 3, duracionClip: 8, cortes: [{ desde: 0, hasta: 1 }, { desde: 2.2, hasta: 2.9 }, { desde: 4.2, hasta: 4.9 }, { desde: 6.2, hasta: 6.8 }], voz: "", promptImagen: "i", promptVideo: "cuatro momentos" },
    { n: 2, tipo: "generada", duracion: 4, voz: "", promptImagen: "i", promptVideo: "v" },
  ]);
  for (const e of pcx.escenas) Object.assign(e.imagen, { estado: "aprobada", url: crmFalso.fijo("cuadrada.jpg"), intentos: 1 });
  crmFalso.encolar("guion-cortes", "clips");
  r = await atender({ ...deps, proveedor: { ...simVideo, generarEscena: (c) => (pedidosCortes.push(c.escena.duracion), simVideo.generarEscena(c)) } });
  for (const n of [1, 2]) crmFalso.aprobar("guion-cortes", "clip", n);
  crmFalso.encolar("guion-cortes", "armado", null, { musica: false, estiloSubtitulos: "palabra", ritmo: "calmado" });
  r = await atender();
  const sc = r.armado.segmentos;
  ok(r.ok && pedidosCortes.sort().join() === "4,8" && sc[0].cortes === 4 && Math.abs(sc[0].dura - 3) < 0.07 && sc[1].cortes === 0 && Math.abs(sc[1].dura - 4) < 0.07 && r.armado.estiloSubtitulos === "karaoke" && ["corte", "fundido"].includes(sc[1].transicion), `apertura en cortes (forma del CRM): el clip se pide de 8 s (duracionClip) y en el armado la escena usa solo sus 4 tramos, pegados en seco: dura ${sc[0].dura.toFixed(2)} s; «palabra» se entiende como karaoke y «calmado» entra con ${sc[1].transicion}`);
  pcx.escenas[0].cortes = [{ desde: 0, hasta: 1 }, { desde: 7.9, hasta: 9 }, { desde: 20, hasta: 21 }];
  crmFalso.encolar("guion-cortes", "armado", null, { musica: false });
  r = await atender();
  ok(r.ok && r.armado.segmentos[0].cortes === 1 && Math.abs(r.armado.segmentos[0].dura - 1) < 0.07, "cortes que se salen del clip: el tramo se recorta al final del clip y, si queda en menos de 0,3 s, se salta");

  // ---- narración de ElevenLabs con tiempos por palabra (servidor de mentira) ----
  const en = { pedidos: [], rutas: [], sinTiempos: false };
  const elevenT = http.createServer((req, res) => {
    let c = "";
    req.on("data", (x) => (c += x));
    req.on("end", () => {
      const cuerpo = JSON.parse(c);
      en.pedidos.push(cuerpo);
      en.rutas.push(req.url);
      if (req.headers["xi-api-key"] !== "clave-eleven-de-mentira") return res.writeHead(401), res.end("{}");
      const audio = fs.readFileSync(path.join(fijos, "voz.mp3")); // 1,8 s
      if (!req.url.includes("/with-timestamps")) return res.writeHead(200, { "content-type": "audio/mpeg" }), res.end(audio);
      if (en.sinTiempos) return res.writeHead(404), res.end('{"detail":"not found"}');
      // Cada letra ocupa su parte de 1,6 s (de 0,1 a 1,7), como la alineación real.
      const letras = [...cuerpo.text];
      const paso = 1.6 / letras.length;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ audio_base64: audio.toString("base64"), alignment: { characters: letras, character_start_times_seconds: letras.map((_, i) => 0.1 + i * paso), character_end_times_seconds: letras.map((_, i) => 0.1 + (i + 1) * paso) } }));
    });
  });
  await new Promise((res) => elevenT.listen(0, "127.0.0.1", res));
  const cfgN = { ...base, elevenKey: "clave-eleven-de-mentira", elevenVoz: "vozDeMentira00000001", elevenBase: `http://127.0.0.1:${elevenT.address().port}` };
  const NR = "guion-narrado";
  const pn = crmFalso.crearProyecto(NR, "9:16", { ...contexto(), pais: "ES", voz: { motor: "narracion", idioma: "es-ES" }, cierre: { oferta: "2x1: dos gafas por 79 €", llamadoALaAccion: "Pídelas hoy", titular: "2x1", detalle: "Dos gafas por 79 €", color: "#0553C9" } }, [
    { n: 1, tipo: "generada", duracion: 6, voz: "¿Te duelen los ojos?", locucion: "narrador", promptImagen: "i", promptVideo: "v1\nAUDIO: sin voz, solo sonido ambiente." },
    { n: 2, tipo: "generada", duracion: 6, voz: "Bloquean el 99,14 % por 79 €.", locucion: "narrador", promptImagen: "i", promptVideo: "v2" },
    { n: 3, tipo: "foto-real", duracion: 4, voz: "Míralas de cerca.", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
    { n: 4, tipo: "cierre", duracion: 5, voz: "Pídelas hoy.", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
  ]);
  for (const e of pn.escenas.filter((x) => x.tipo === "generada")) Object.assign(e.imagen, { estado: "aprobada", url: crmFalso.fijo("cuadrada.jpg"), intentos: 1 });
  // Con narración los clips se piden SIN diálogo: si el CRM ya lo dice en su bloque AUDIO no se agrega nada; si no, lo agrega el trabajador.
  const tNarr = { formato: "ugc", imagenesProducto: [], opciones: {}, contexto: pn.contexto };
  const pSin = (prompt) => kieVideo.armarEntrada(cfgN, { escena: { prompt, duracion: 8, usaImagenProducto: false, voz: "Hola.", locucion: "narrador" }, trabajo: tNarr, relacion: "9:16", audio: "elevenlabs", audioEnPrompt: /(^|\n)\s*AUDIO\b/.test(prompt) }, kieVideo.modeloPara(cfgN, tNarr, false)).input.prompt;
  ok(habla.decidirAudio(cfgN, tNarr, true).modo === "elevenlabs" && /nadie habla\. Solo sonido ambiente/.test(pSin("Plano de la mesa")) && !/Hola\./.test(pSin("Plano de la mesa")) && !/nadie habla/.test(pSin("Plano\nAUDIO: sin voz, solo sonido ambiente.")), "narración: los clips se piden sin diálogo, solo con sonido ambiente (y si el CRM ya lo dice en su bloque AUDIO, no se repite)");
  const depsN = { ...deps, cfg: cfgN, proveedor: { ...hablador, async generarEscena(c) { // clips con ambiente continuo, sin voz
    await c.ff.ffmpeg(["-f", "lavfi", "-i", "testsrc2=s=720x1280:r=24:d=4", "-f", "lavfi", "-i", "anoisesrc=color=brown:duration=4:seed=5:amplitude=0.4", "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-t", "4", c.salida], c.carpeta);
    return { segundos: 4, modelo: "hablador", costoUsd: null };
  } } };
  crmFalso.encolar(NR, "clips");
  r = await atender(depsN);
  for (const n of [1, 2]) crmFalso.aprobar(NR, "clip", n);
  crmFalso.encolar(NR, "armado", null, { musica: false, estiloSubtitulos: "karaoke" });
  r = await atender(depsN);
  const eN = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  const sN = r.armado.segmentos;
  const p2 = en.pedidos[1] || {};
  ok(r.ok && en.pedidos.length === 4 && en.rutas.every((u) => u.includes("/vozDeMentira00000001/with-timestamps")) && en.pedidos.every((p) => p.model_id === "eleven_multilingual_v2" && p.voice_settings.speed === 1.08 && !("language_code" in p)), "narración: UNA sola voz para todo el video (4 frases, la misma voz), modelo multilingüe, ritmo de anuncio, por la ruta con marcas de tiempo");
  ok(p2.text === "Bloquean el 99,14 por ciento por 79 euros." && p2.previous_text === "¿Te duelen los ojos?" && p2.next_text === "Míralas de cerca.", "narración: cada escena lleva su frase completa con las cifras dichas bien, y la frase anterior y la siguiente como contexto (entonación continua)");
  ok(sN.slice(0, 3).every((s) => s.audio === "voz" && Math.abs(s.dura - (0.1 + 1.8 + 0.22)) < 0.08) && sN[0].velocidad === 1.2 && sN[3].dura >= 5 && eN.sinVoz === false && /Narración de ElevenLabs/.test(eN.avisos.join(" ")), `narración: cada escena dura lo que dura su frase (${sN[0].dura.toFixed(2)} s para una frase de 1,8 s, con pausas cortas); el clip de 4 s se acelera ${sN[0].velocidad}× y se recorta, sin cortar la frase`);
  ok(Math.abs(sN[1].subtitulo.desde - 0.2) < 0.06 && sN[1].subtitulo.palabras === 7 && Math.abs(sN[1].subtitulo.dura - 1.6) < 0.08, "narración: los subtítulos usan el tiempo REAL de cada palabra que devuelve la voz (empiezan a 0,2 s y duran 1,6 s, como la alineación)");
  const finalN = path.join(carpetas.entregados, `${r.trabajo.id}.mp4`);
  const volVozN = await tramoVol(finalN, 0.25, 1.3);
  const volAmbN = await tramoVol(finalN, sN[0].dura - 0.2, 0.18);
  ok(volVozN - volAmbN > 12 && volAmbN > -70, `narración: el sonido del clip queda de ambiente, muy por debajo de la voz (${volVozN} dB con voz, ${volAmbN} dB el ambiente solo)`);
  const antesN = en.pedidos.length;
  crmFalso.encolar(NR, "armado", null, { musica: false, estiloSubtitulos: "limpio" });
  r = await atender(depsN);
  ok(r.ok && en.pedidos.length === antesN && r.armado.caracteresNarrados === 0 && r.armado.stats.segmentosHechos === 3, "narración: al cambiar la plantilla de subtítulos NO se vuelve a pedir (ni a pagar) la voz; solo se recodifican las escenas con subtítulo");
  en.sinTiempos = true;
  pn.escenas[0].voz = "¿Te arden los ojos de noche?";
  crmFalso.encolar(NR, "armado", null, { musica: false, estiloSubtitulos: "limpio" });
  r = await atender(depsN);
  ok(r.ok && r.armado.segmentos[0].audio === "voz" && r.armado.segmentos[0].subtitulo && /tiempos estimados/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "narración: si la cuenta no tiene la ruta con marcas de tiempo (404), se narra igual por la ruta normal y los subtítulos van con tiempos estimados, avisando");
  crmFalso.encolar(NR, "armado", null, { musica: false });
  r = await atender(deps); // el mismo proyecto en un servidor SIN clave de ElevenLabs
  ok(!r.ok && /^No se puede armar con narración: el servidor no tiene ELEVENLABS_API_KEY/.test(crmFalso.visto.fallos[crmFalso.visto.fallos.length - 1].motivo), "narración pedida por el CRM y servidor SIN clave: el armado falla con un motivo claro (no se entrega un video mudo)");
  if (false) ok(true, "narración sin clave en el servidor: no falla; sigue con el audio del clip y lo avisa");
  elevenT.close();

  // ================== transiciones v2, cortes al golpe de la música y subtítulos de Captions ====
  {
    const tr = (o) => efectos.elegirTransicion({ semilla: "x", ...o });
    const muy = [1, 2, 3, 4, 5, 6].map((i) => tr({ indice: i, inicio: i * 2, ritmo: "muy-rapido" }));
    ok(efectos.normalizarRitmo("Muy rápido") === "muy-rapido" && efectos.normalizarRitmo("muy_rapido") === "muy-rapido" && efectos.normalizarRitmo("calmado") === "calmado" && efectos.normalizarRitmo("otro") === "rapido" && efectos.normalizarRitmo("") === "" && muy.every((t) => ["zoom", "flash", "glitch", "barrido"].includes(t)) && muy.every((t) => t !== "corte" && t !== "fundido") && efectos.INTENSIDAD["muy-rapido"] > efectos.INTENSIDAD.rapido && efectos.INTENSIDAD.rapido > efectos.INTENSIDAD.medio, `ritmo «muy rápido» (nuevo): todas las transiciones son enérgicas (${muy.join(", ")}) y más intensas que en «rápido»`);
    ok(tr({ indice: 2, inicio: 5, ritmo: "rapido", desdeUltimo: 0.5 }) === "corte" && tr({ indice: 2, inicio: 5, ritmo: "rapido", desdeUltimo: 0.9 }) !== "corte" && tr({ indice: 2, inicio: 5, ritmo: "muy-rapido", desdeUltimo: 0.5 }) !== "corte" && tr({ indice: 2, inicio: 5, ritmo: "muy-rapido", desdeUltimo: 0.3 }) === "corte" && tr({ indice: 3, inicio: 9, ritmo: "muy-rapido", tipo: "cierre", pedida: "zoom" }) === "corte" && tr({ indice: 3, inicio: 9, tipo: "cierre", pedida: "fundido" }) === "fundido", "nada de mareo: entre un efecto y el siguiente pasa un mínimo (0,7 s en rápido, 0,45 s en muy rápido); sobre la tarjeta de cierre nunca hay efecto aunque se pida (solo el fundido suave que manda el CRM)");
    const z = efectos.entrada("zoom", { W: 1080, i: 1 });
    const b = efectos.entrada("barrido", { W: 1080, i: 1.3 });
    const f = efectos.entrada("flash", { W: 1080, i: 1, marca: "0553C9" });
    ok(/gblur/.test(z.cadena) && /sin\(/.test(z.dx) && /tmix/.test(b.cadena) && /pow/.test(b.dx) && /0x0553C9@/.test(f.cadena) && /sin\(/.test(f.dx) && !/FFFFFF/.test(f.cadena) && /0xFFFFFF@/.test(efectos.entrada("flash", { W: 1080 }).cadena), "transiciones más dinámicas: zoom con desenfoque de movimiento y sacudida, barrido con entrada de lado y estela, y flash del color de la marca (blanco si no hay color)");
    const a1 = efectos.aceleron("rapido", 3);
    const a2 = efectos.aceleron("muy-rapido", 3);
    ok(/^setpts='if\(lt\(T,/.test(a1.filtro) && a2.filtro.length > a1.filtro.length && efectos.aceleron("medio", 3).filtro === "" && efectos.aceleron("rapido", 1).filtro === "" && a1.deMas > 0 && a1.deMas < 0.3, "acelerón (speed-ramp): la toma entra acelerada en «rápido»; en «muy rápido» también sale acelerada; nunca en «medio» ni en tomas de menos de 1,6 s");
    ok(efectos.golpeCercano({ golpes: [0.5, 1, 1.5], dura: 2 }, 1.1) === 1 && efectos.golpeCercano({ golpes: [0.5, 1, 1.5], dura: 2 }, 1.25) === null && efectos.golpeCercano({ golpes: [0.5, 1, 1.5], dura: 2 }, 4.45) === 4.5 && efectos.golpeCercano(null, 1) === null, "cortes al golpe: se busca el golpe más cercano dentro de ±0,15 s (la pista se repite si es más corta que el video)");
  }
  {
    // golpes visuales dentro de la toma (contrato del 18-oct)
    const g = efectos.golpesVisuales([2.7, 5.3], { dura: 8, H: 1920, fps: 30 });
    const g3 = efectos.golpesVisuales([5.9, 2, 4, 2.1, 0.1], { dura: 6.2, H: 1920, fps: 30 });
    const auto = efectos.golpesVisuales(undefined, { dura: 6, H: 1920, cadaSiFaltan: 1.5 });
    ok(g.marcas.join() === "2.7,5.3" && /^0\.15\*clip\(\(t-2\.7\)\/0\.067,0,1\)-0\.15\*clip\(\(t-5\.3\)/.test(g.zoom) && g.dy === "" && g3.marcas.join() === "2,4" && efectos.golpesVisuales([], { dura: 8, H: 1920 }).zoom === "" && auto.marcas.join() === "1.5,3,4.5" && /-\d+\*\(clip/.test(auto.dy), "golpes visuales: en cada marca un acercamiento brusco (15 % en 2 cuadros) que se mantiene hasta la siguiente y vuelve; se descartan las marcas pegadas a los bordes o entre sí; el segundo acercamiento ancla en el tercio superior; en «muy rápido», una cada 1,5 s si la escena no trae");
  }
  // Una pista con pulso claro (un golpe grave cada 0,5 s), fabricada con ffmpeg.
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=60:duration=0.09,volume=6,apad=whole_dur=0.5,aloop=loop=15:size=22050", "-t", "8", "-c:a", "libmp3lame", "-b:a", "128k", "pulso.mp3"], fijos);
  const pulso = await efectos.golpesDeMusica(ff, "pulso.mp3", fijos);
  const pasos = pulso.golpes.slice(1).map((g, i) => g - pulso.golpes[i]);
  ok(pulso.golpes.length >= 13 && pulso.golpes.length <= 16 && pasos.every((p) => Math.abs(p - 0.5) < 0.05), `golpes de la música: en una pista con un golpe cada 0,5 s se detectan ${pulso.golpes.length} golpes, separados ${Math.min(...pasos).toFixed(2)}–${Math.max(...pasos).toFixed(2)} s`);
  const RB = "guion-al-ritmo";
  const prb = crmFalso.crearProyecto(RB, "9:16", { ...contexto(), producto: "Otro producto" }, [
    { n: 1, tipo: "generada", duracion: 2.1, voz: "", promptImagen: "i", promptVideo: "v" },
    { n: 2, tipo: "generada", duracion: 2.1, voz: "", promptImagen: "i", promptVideo: "v" },
    { n: 3, tipo: "generada", duracion: 1.9, voz: "", promptImagen: "i", promptVideo: "v" },
    { n: 4, tipo: "cierre", duracion: 5, voz: "", fotoUrl: crmFalso.fijo("cuadrada.jpg") },
  ]);
  for (const e of prb.escenas.filter((x) => x.tipo === "generada")) Object.assign(e.imagen, { estado: "aprobada", url: crmFalso.fijo("cuadrada.jpg"), intentos: 1 });
  crmFalso.encolar(RB, "clips");
  await atender();
  for (const n of [1, 2, 3]) crmFalso.aprobar(RB, "clip", n);
  crmFalso.encolar(RB, "armado", null, { musica: crmFalso.fijo("pulso.mp3"), ritmo: "muy rapido" });
  r = await atender();
  const cortesRB = r.armado.segmentos.slice(1).map((x) => x.inicio);
  const alGolpe = cortesRB.every((c) => pulso.golpes.some((g) => Math.abs(((c % pulso.dura) + pulso.dura) % pulso.dura - g) < 0.04 || Math.abs(c - g) < 0.04));
  ok(r.ok && r.armado.cortesAlGolpe === 3 && alGolpe && r.armado.transiciones.slice(1, 3).every((t) => t !== "corte") && r.armado.transiciones[3] === "corte", `cortes al ritmo de la música: las escenas pedían cortar en 2,1 / 4,2 / 6,1 s y los cortes quedaron en ${cortesRB.map((c) => c.toFixed(2)).join(" / ")} s, sobre los golpes de la pista; «muy rápido» entra con ${r.armado.transiciones.slice(1, 3).join(" y ")} y el cierre en corte`);
  crmFalso.encolar(RB, "armado", null, { musica: crmFalso.fijo("pulso.mp3"), ritmo: "calmado" });
  r = await atender();
  ok(r.ok && r.armado.cortesAlGolpe === 0 && Math.abs(r.armado.segmentos[1].inicio - 2.1) < 0.04, "en «calmado» no se mueven los cortes ni hay golpes de sonido");

  // ---- lo que manda el CRM desde el 18-oct: transición por escena, golpes visuales y cierre con fundido ----
  ph.escenas[1].transicion = "glitch";
  ph.escenas[2].transicion = "deslizar";
  ph.escenas[2].golpesVisuales = [1.3, 2.6];
  ph.escenas[3].transicion = "fundido";
  crmFalso.encolar(HB, "armado", null, { musica: false, ritmo: "muy-rapido", estiloSubtitulos: "impacto" });
  r = await atender(depsH);
  const s18 = r.armado.segmentos;
  ok(r.ok && r.armado.transiciones.join() === "corte,glitch,deslizar,fundido" && s18[2].golpesVisuales.join() === "1.3,2.6" && s18[0].golpesVisuales.length >= 1 && s18[3].golpesVisuales.length === 0 && s18[3].tipo === "cierre", `campos del 18-oct: cada escena entra con la transición que manda el CRM (${r.armado.transiciones.join(", ")}), los golpes visuales van donde los marca, en «muy-rapido» se ponen solos donde faltan (escena 1: ${s18[0].golpesVisuales.join(" y ")} s) y nunca en el cierre`);
  for (const e of ph.escenas) {
    delete e.transicion;
    delete e.golpesVisuales;
  }

  // ---- Captions (Mirage): servidor de mentira con el contrato de su documentación ----
  const kc = { plantillas: 0, envios: [], consultas: 0, descargas: 0, modo: "bien", subido: null };
  const todasCap = [["ctpl_yvE0ZnYzEj6ClCD2ee1f", "Buzz"], ["ctpl_FbiwB6xaJm9CQA3Ot4Tx", "Cove"], ["ctpl_DxflLOnuKkb198FNdI9E", "Heat"]];
  const capFalso = http.createServer((req, res) => {
    const trozos = [];
    req.on("data", (d) => trozos.push(d));
    req.on("end", () => {
      const cuerpo = Buffer.concat(trozos);
      const json = (codigo, o) => (res.writeHead(codigo, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      const u = new URL(req.url, "http://x");
      if (u.pathname === "/archivo.mp4") return res.writeHead(200, { "content-type": "video/mp4" }), res.end(kc.subido);
      if (req.headers["x-api-key"] !== "clave-captions-de-mentira") return json(401, { error: { code: "unauthorized", message: "Invalid API key" } });
      if (req.method === "GET" && u.pathname === "/v1/videos/captions/templates") {
        kc.plantillas++;
        // De a dos por página, para probar la paginación con `after`.
        const desde = u.searchParams.get("after") ? todasCap.findIndex((t) => t[0] === u.searchParams.get("after")) + 1 : 0;
        const pagina = todasCap.slice(desde, desde + 2);
        return json(200, { object: "list", data: pagina.map(([id, name]) => ({ id, object: "caption_template", name, preview_url: null, created_at: 1730000000 })), has_more: desde + 2 < todasCap.length });
      }
      if (req.method === "POST" && u.pathname === "/v1/videos/captions") {
        const texto = cuerpo.toString("latin1");
        const plantilla = (/name="caption_template_id"\r\n\r\n([^\r]+)/.exec(texto) || [])[1];
        const ini = texto.indexOf("\r\n\r\n", texto.indexOf('name="video"')) + 4;
        const fin = texto.lastIndexOf("\r\n--");
        kc.subido = cuerpo.subarray(ini, fin);
        kc.envios.push({ plantilla, bytes: kc.subido.length, multipart: /^multipart\/form-data/.test(req.headers["content-type"] || "") });
        kc.consultas = 0;
        return json(200, { id: `video_cap${kc.envios.length}`, object: "video", status: "QUEUED", progress: 0, error: null, caption_template_id: plantilla });
      }
      const m = /^\/v1\/videos\/(video_cap\d+)(\/content)?$/.exec(u.pathname);
      if (req.method === "GET" && m && m[2]) {
        kc.descargas++;
        return res.writeHead(302, { location: `http://127.0.0.1:${capFalso.address().port}/archivo.mp4` }), res.end();
      }
      if (req.method === "GET" && m) {
        kc.consultas++;
        if (kc.modo === "falla") return json(200, { id: m[1], object: "video", status: "FAILED", error: { code: "processing_error", message: "no se pudo" } });
        if (kc.modo === "lento") return json(200, { id: m[1], object: "video", status: "PROCESSING", progress: 10, error: null });
        return json(200, { id: m[1], object: "video", status: kc.consultas === 1 ? "PROCESSING" : "COMPLETE", progress: kc.consultas === 1 ? 50 : 100, error: null });
      }
      json(404, { error: { code: "not_found", message: "not found" } });
    });
  });
  await new Promise((res) => capFalso.listen(0, "127.0.0.1", res));
  const captionsLib = require("../lib/captions");
  const cfgC = { ...base, captionsKey: "clave-captions-de-mentira", captionsBase: `http://127.0.0.1:${capFalso.address().port}`, config: { ...base.config, captions: { ...base.config.captions, consultarCadaSegundos: 0.1 } } };
  const depsC = { ...depsH, cfg: cfgC };
  const listaC = await captionsLib.plantillas(cfgC);
  ok(listaC.length === 3 && kc.plantillas === 2 && listaC[1].nombre === "Cove" && (await captionsLib.resolverPlantilla(cfgC, "cove")).id === "ctpl_FbiwB6xaJm9CQA3Ot4Tx" && (await captionsLib.resolverPlantilla(cfgC, "ctpl_DxflLOnuKkb198FNdI9E")).id === "ctpl_DxflLOnuKkb198FNdI9E" && cfg.config.captions.porDefecto === false, "Captions: lista las plantillas de la cuenta (con paginación) y resuelve una por nombre («cove») o por su id; viene APAGADO por defecto");
  const conCap = { subtitulos: { proveedor: "captions", plantilla: "Cove" }, musica: false };
  crmFalso.encolar(HB, "armado", null, conCap);
  r = await atender(depsC);
  const eC = crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1];
  fs.writeFileSync(path.join(datos, "enviado-a-captions.mp4"), kc.subido);
  const capEnviado = await probar(path.join(datos, "enviado-a-captions.mp4"));
  const cuerpoH = r.armado.segmentos.filter((x) => x.tipo !== "cierre").reduce((a, x) => a + x.dura, 0);
  ok(r.ok && kc.envios.length === 1 && kc.envios[0].plantilla === "ctpl_FbiwB6xaJm9CQA3Ot4Tx" && kc.envios[0].multipart && kc.descargas === 1 && r.armado.estiloSubtitulos === "captions:Cove" && r.armado.segmentos.every((x) => x.subtitulo === null) && eC.subtitulos === true && /Subtítulos hechos por Captions, plantilla «Cove»/.test(eC.avisos.join(" ")), "Captions: con clave y opciones.subtitulos.proveedor = \"captions\", el video se arma SIN subtítulos quemados, se manda con la plantilla elegida (multipart, x-api-key), se espera (QUEUED → PROCESSING → COMPLETE) y se descarga");
  ok(Math.abs(capEnviado.dura - cuerpoH) < 0.3 && Math.abs(r.armado.duracion - (cuerpoH + 5)) < 0.4 && capEnviado.video.width === 1080 && capEnviado.video.height === 1920, `Captions: a la API va solo el cuerpo (${capEnviado.dura.toFixed(1)} s, 9:16); la tarjeta de cierre (5 s) se pega DESPUÉS, sin subtítulos encima (final de ${r.armado.duracion.toFixed(1)} s)`);
  crmFalso.encolar(HB, "armado", null, { ...conCap, musica: crmFalso.fijo("musica.mp3") });
  r = await atender(depsC);
  ok(r.ok && kc.envios.length === 1 && r.armado.captions && r.armado.captions.yaEstaba && r.armado.conMusica, "Captions: al rearmar (aquí, para ponerle música) no se manda ni se paga de nuevo: se reutiliza el video ya subtitulado");
  const respaldo = async (cfgX, opciones, cambia) => {
    if (cambia) cambia();
    crmFalso.encolar(HB, "armado", null, opciones);
    const rr = await atender({ ...depsH, cfg: cfgX });
    return { rr, avisos: crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ") };
  };
  // Para forzar un envío nuevo en cada caso se cambia la duración de una escena (cambia el cuerpo que se manda).
  const otraFrase = (d) => () => (ph.escenas[2].duracion = d);
  const capSinClave = await respaldo(base, conCap);
  kc.modo = "falla";
  const capFallo = await respaldo(cfgC, conCap, otraFrase(3.6));
  kc.modo = "lento";
  const capLento = await respaldo({ ...cfgC, config: { ...cfgC.config, captions: { ...cfgC.config.captions, limiteMinutos: 0.01 } } }, conCap, otraFrase(3.2));
  kc.modo = "bien";
  const capPesado = await respaldo({ ...cfgC, config: { ...cfgC.config, captions: { ...cfgC.config.captions, maxMb: 0.05 } } }, conCap, otraFrase(2.8));
  const sinPlantilla = await respaldo(cfgC, { subtitulos: { proveedor: "captions", plantilla: "Velocity" }, musica: false });
  const propios = (x) => x.rr.ok && x.rr.armado.segmentos[0].subtitulo && !/^captions:/.test(x.rr.armado.estiloSubtitulos);
  ok(propios(capSinClave) && /no tiene CAPTIONS_API_KEY/.test(capSinClave.avisos) && propios(capFallo) && /Captions no se pudieron hacer \(.*FAILED/.test(capFallo.avisos) && propios(capLento) && /lleva más de/.test(capLento.avisos) && propios(capPesado) && /pesa más de/.test(capPesado.avisos) && propios(sinPlantilla) && /ninguna plantilla llamada «Velocity»/.test(sinPlantilla.avisos), "Captions, respaldo automático: sin clave, si la API falla, si tarda de más, si el video no baja de 50 MB ni comprimido, o si la plantilla no existe, el video sale con las plantillas propias y lo avisa (nunca falla)");
  ph.escenas[2].duracion = 4;
  crmFalso.encolar(H, "armado", null, { subtitulos: { proveedor: "captions", plantilla: "Cove" } });
  r = await atender({ ...deps, cfg: cfgC });
  ok(r.ok && /solo subtitula videos verticales 9:16/.test(crmFalso.visto.cierres[crmFalso.visto.cierres.length - 1].avisos.join(" ")), "Captions: un video horizontal no se manda (la API solo admite 9:16): plantillas propias y aviso");
  const logC = fs.readFileSync(registro.archivo, "utf8");
  ok(!logC.includes("clave-captions-de-mentira"), "Captions: la clave no queda escrita en el registro");
  capFalso.close();

  // =========================================== varios trabajos a la vez ====
  // Piezas sueltas de lib/limites.js
  {
    const sem = crearSemaforo(1);
    const orden = [];
    const tarea = (nombre, prioridad, grupo) => sem.usar({ prioridad, grupo }, async () => (orden.push(nombre), new Promise((res) => setTimeout(res, 5))));
    await Promise.all([tarea("A1", 0, "A"), tarea("A2", 0, "A"), tarea("A3", 0, "A"), tarea("B1", 0, "B"), tarea("B2", 0, "B"), tarea("urgente", 1, "C")]);
    ok(orden.join(" ") === "A1 urgente B1 A2 B2 A3", `turnos: primero lo urgente y después se alterna entre proyectos (${orden.join(" ")})`);
    const pr = crearPresupuesto(7);
    const admitidas = [await pr.admitir()]; // la primera va sola: con ella se aprende cuánto cuesta una
    pr.terminar(3);
    admitidas.push(await pr.admitir());
    const tercera = pr.admitir(); // 3 gastados + 3 en curso + 3 = 9 > 7: espera a ver cuánto cobra la que está en curso
    pr.terminar(3);
    admitidas.push(await tercera);
    ok(admitidas.join() === "true,true,false" && crearPresupuesto(null).limite === null, "tope de gasto: con máximo 7 y tareas de 3 créditos se admiten 2 y la tercera no");
    const d = ajustesParalelo(cfg);
    ok(cfg.config.paralelo.trabajos === 3 && cfg.config.paralelo.imagenes === 4 && cfg.config.paralelo.clips === 3 && d.armados === (d.nucleos >= 8 ? 2 : 1) && d.hilosFfmpeg * d.armados <= Math.max(1, d.nucleos / 2), `límites por defecto: 3 trabajos, 4 imágenes, 3 clips; en este equipo (${d.nucleos} núcleos) ${d.armados} armado(s) con ${d.hilosFfmpeg} hilo(s) de ffmpeg cada uno (máximo la mitad de los núcleos)`);
    ok(prioridadDe({ etapa: "armado" }) === 1 && prioridadDe({ etapa: "imagenes", escenas: [{}] }) === 1 && prioridadDe({ etapa: "imagenes", escenas: [{}, {}] }) === 0 && prioridadDe({ etapa: "imagenes", escenas: [{}, {}], prioridad: 5 }) === 5, "prioridad: armados y trabajos de una sola escena (correcciones) pasan primero; un lote no; si el trabajo trae «prioridad», manda");
  }

  // Kie de mentira con demora (cola → generando → listo), tres 429 al crear y cuenta de tareas simultáneas.
  const kp = { creadas: [], pedidos: 0, rechazos429: 0, enCurso: new Set(), pico: 0, nacio: new Map() };
  const kieLento = http.createServer((req, res) => {
    let c = "";
    req.on("data", (d) => (c += d));
    req.on("end", () => {
      const json = (o) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      if (req.url === "/imagen.png") return res.writeHead(200, { "content-type": "image/png" }), res.end(fs.readFileSync(path.join(fijos, "kie.png")));
      if (req.method === "POST" && req.url === "/api/v1/jobs/createTask") {
        kp.pedidos++;
        if ([3, 4, 9].includes(kp.pedidos)) {
          kp.rechazos429++;
          return json({ code: 429, msg: "Too many requests" }); // HTTP 200 con code 429, como avisa su documentación
        }
        const cuerpo = JSON.parse(c);
        kp.creadas.push(cuerpo.input.prompt.split("\n")[0]);
        const taskId = `lento_${kp.creadas.length}`;
        kp.nacio.set(taskId, Date.now());
        kp.enCurso.add(taskId);
        kp.pico = Math.max(kp.pico, kp.enCurso.size);
        return json({ code: 200, msg: "success", data: { taskId } });
      }
      if (req.method === "GET" && req.url.startsWith("/api/v1/jobs/recordInfo?taskId=")) {
        const taskId = req.url.split("=")[1];
        const edad = Date.now() - kp.nacio.get(taskId);
        if (edad < 150) return json({ code: 200, msg: "success", data: { taskId, state: "queuing" } });
        if (edad < 450) return json({ code: 200, msg: "success", data: { taskId, state: "generating" } });
        kp.enCurso.delete(taskId);
        return json({ code: 200, msg: "success", data: { taskId, state: "success", resultJson: JSON.stringify({ resultUrls: [`http://127.0.0.1:${kieLento.address().port}/imagen.png`] }), creditsConsumed: 3 } });
      }
      json({ code: 404, msg: "not found" });
    });
  });
  await new Promise((res) => kieLento.listen(0, "127.0.0.1", res));
  const cfgP = {
    ...base,
    kieKey: "clave-kie-de-mentira",
    kieBase: `http://127.0.0.1:${kieLento.address().port}`,
    config: {
      ...base.config,
      simulado: { demoraSegundos: 1 },
      kieImagen: { ...base.config.kieImagen, consultarCadaSegundos: 0.1 },
      paralelo: { ...base.config.paralelo, trabajos: 6, armados: 2, hilosFfmpeg: ajustesParalelo(base).hilosFfmpeg, espera429: { inicialSegundos: 0.2, factor: 2, topeSegundos: 1, maxMinutos: 1 } },
    },
  };
  const limitesP = crearLimites(cfgP);
  const video = { enCurso: 0, pico: 0 };
  const proveedorP = {
    ...simVideo,
    async generarEscena(c) {
      video.pico = Math.max(video.pico, ++video.enCurso);
      try {
        return await simVideo.generarEscena(c);
      } finally {
        video.enCurso--;
      }
    },
  };
  const depsP = { cfg: cfgP, crm, ff, proveedor: proveedorP, proveedorImagen: kieImagen, registro, limites: limitesP };

  const ctxP = () => ({ ...contexto(), fotos: ["https://tienda.test/producto.jpg"] });
  const lote = (letra, cuantas) => Array.from({ length: cuantas }, (_, i) => ({ n: i + 1, tipo: "generada", duracion: 4, voz: "", promptImagen: `${letra}-${i + 1} persona con el producto`, promptVideo: "v" }));
  crmFalso.crearProyecto("lote-A", "9:16", ctxP(), lote("LA", 8));
  crmFalso.crearProyecto("lote-B", "9:16", ctxP(), lote("LB", 8));
  crmFalso.crearProyecto("con-tope", "9:16", ctxP(), lote("TP", 5));
  crmFalso.crearProyecto("correccion", "9:16", ctxP(), lote("CX", 3));
  // Un proyecto con sus imágenes ya aprobadas, para la etapa de clips.
  const pc = crmFalso.crearProyecto("lote-clips", "9:16", ctxP(), lote("LC", 3));
  for (const e of pc.escenas) Object.assign(e.imagen, { estado: "aprobada", url: crmFalso.fijo("cuadrada.jpg"), intentos: 1 });
  // Tres variaciones del proyecto vertical: comparten TODAS las escenas aprobadas (mismas direcciones) y cambian la oferta.
  crmFalso.crearHijo(V, "variacion-1", (h) => (h.contexto.cierre.oferta = "Hoy 2x1 con envío gratis"));
  crmFalso.crearHijo(V, "variacion-2", (h) => (h.contexto.cierre.oferta = "Lleva 3 y paga 2, solo esta semana"));
  crmFalso.crearHijo(V, "variacion-3", (h) => (h.contexto.cierre.oferta = "Lleva 3 y paga 2, solo esta semana")); // idéntica a la 2, a propósito

  const tLA = crmFalso.encolar("lote-A", "imagenes");
  const tLB = crmFalso.encolar("lote-B", "imagenes");
  const tLC = crmFalso.encolar("lote-clips", "clips");
  const tTP = crmFalso.encolar("con-tope", "imagenes", null, {}, { gastoMaximoCreditos: 7 });
  const tH1 = crmFalso.encolar("variacion-1", "armado");
  let tCX, tH2, tH3;
  const entraEnMedio = new Promise((res) =>
    setTimeout(() => {
      tCX = crmFalso.encolar("correccion", "imagenes", [2]); // una corrección: una sola escena, llega con el lote ya corriendo
      tH2 = crmFalso.encolar("variacion-2", "armado");
      tH3 = crmFalso.encolar("variacion-3", "armado");
      res();
    }, 300),
  );
  const empezo = {};
  const termino = {};
  const salio = {};
  const fallosAntes = crmFalso.visto.fallos.length;
  const bajadasAntes = crmFalso.visto.descargas.length;
  const t0P = Date.now();
  const ronda = await atenderCola({
    tomar: (extra) => crm.tomar(extra).catch(() => null),
    procesar: async (t) => {
      empezo[t.id] = Date.now() - t0P;
      salio[t.id] = await procesar(t, depsP);
      termino[t.id] = Date.now() - t0P;
    },
    max: 6,
    unaVez: true,
    conTrabajoMs: 50,
    registro,
  });
  await entraEnMedio;
  const relojP = (Date.now() - t0P) / 1000;
  const todos = [tLA, tLB, tLC, tTP, tH1, tCX, tH2, tH3];
  ok(ronda.atendidos === 8 && ronda.picoSimultaneos === 6 && todos.every((t) => salio[t.id] && salio[t.id].ok) && crmFalso.visto.fallos.length === fallosAntes, `8 trabajos de etapas mezcladas, hasta 6 a la vez: todos cerraron bien en ${relojP.toFixed(1)} s de reloj`);

  // Ni escenas duplicadas ni reportes perdidos.
  const buenos = (t) => progresoDe(t.id).flatMap((p) => p.escenas || []).filter((e) => !e.error);
  const unaPorEscena = (t, cuantas) => {
    const ns = buenos(t).map((e) => e.n).sort((a, b) => a - b);
    return ns.length === cuantas && new Set(ns).size === cuantas;
  };
  const estados = (id, tipo) => crmFalso.proyectos.get(id).escenas.map((e) => e[tipo].estado);
  ok(unaPorEscena(tLA, 8) && unaPorEscena(tLB, 8) && unaPorEscena(tLC, 3) && unaPorEscena(tCX, 1) && estados("lote-A", "imagen").every((s) => s === "por-aprobar") && estados("lote-B", "imagen").every((s) => s === "por-aprobar") && estados("lote-clips", "clip").every((s) => s === "por-aprobar"), "sin reportes perdidos ni repetidos: cada escena de cada trabajo se reportó exactamente una vez y quedó por aprobar");
  ok(new Set(kp.creadas).size === kp.creadas.length && kp.creadas.length === 8 + 8 + 1 + 2, `sin tareas duplicadas en el proveedor: ${kp.creadas.length} tareas creadas para 19 escenas pedidas (ninguna dos veces)`);
  ok(kp.rechazos429 === 3 && kieVideo.freno.stats.frenadas >= 3, `429 simulado: Kie rechazó 3 creaciones; se esperó (${kieVideo.freno.stats.frenadas} frenadas, ${(kieVideo.freno.stats.esperadoMs / 1000).toFixed(1)} s en total) y se reintentó sin perder ni duplicar ninguna tarea`);
  ok(kp.pico <= 4 && kp.pico >= 3 && video.pico === 3 && limitesP.armado.stats.picoEnUso <= 2, `límites respetados: máximo ${kp.pico} imágenes a la vez (tope 4), ${video.pico} clips a la vez (tope 3), ${limitesP.armado.stats.picoEnUso} armado(s) a la vez (tope 2)`);

  // Tope de gasto.
  const pt = crmFalso.proyectos.get("con-tope");
  const porTope = pt.escenas.filter((e) => e.imagen.estado === "fallo" && /^tope de gasto/.test(e.imagen.nota)).length;
  ok(pt.costo.creditos === 6 && pt.escenas.filter((e) => e.imagen.estado === "por-aprobar").length === 2 && porTope === 3 && salio[tTP.id].ok, `tope de gasto (máximo 7 créditos, 3 por imagen): se hicieron 2 imágenes (6 créditos), las otras 3 se reportaron como «tope de gasto» sin pedirse y el trabajo cerró limpio`);

  // La corrección entró después y salió antes que los lotes.
  ok(empezo[tCX.id] > empezo[tLA.id] && termino[tCX.id] < termino[tLA.id] && termino[tCX.id] < termino[tLB.id], `corrección urgente: entró a los ${(empezo[tCX.id] / 1000).toFixed(1)} s con dos lotes en curso y salió a los ${(termino[tCX.id] / 1000).toFixed(1)} s, antes que los lotes (${(termino[tLA.id] / 1000).toFixed(1)} s y ${(termino[tLB.id] / 1000).toFixed(1)} s)`);
  const primeraLB = kp.creadas.findIndex((p) => p.startsWith("LB-"));
  const ultimaLA = kp.creadas.map((p) => p.startsWith("LA-")).lastIndexOf(true);
  ok(primeraLB >= 0 && primeraLB < 8 && primeraLB < ultimaLA, `se alterna entre proyectos: el lote B empezó (tarea n.º ${primeraLB + 1}) antes de que el lote A terminara las suyas (su última fue la n.º ${ultimaLA + 1})`);

  // Variaciones: comparten caché con el proyecto original.
  const sH = [tH1, tH2, tH3].map((t) => salio[t.id].armado.stats);
  const hechasVar = sH.reduce((a, s) => a + s.segmentosHechos, 0);
  ok(crmFalso.visto.descargas.length === bajadasAntes && sH.every((s) => s.descargas === 0) && sH[0].segmentosHechos === 1 && sH[0].segmentosReutilizados === 4 && hechasVar === 2, `tres variaciones que comparten escenas con el proyecto original: 0 descargas y ${hechasVar} escenas codificadas entre las tres (solo el cierre nuevo; dos variaciones idénticas a la vez lo codifican una sola vez)`);
  ok(["variacion-1", "variacion-2", "variacion-3"].every((id) => crmFalso.proyectos.get(id).final.estado === "por-aprobar"), "cada variación subió su propio video final");

  // Medición por trabajo.
  const filasT = fs.readFileSync(path.join(carpetas.registro, "tiempos.csv"), "utf8").trim().split(/\r?\n/);
  const tLAt = salio[tLA.id].tiempos;
  ok(filasT[0] === ENCABEZADO_TIEMPOS && filasT.some((l) => l.includes(tLA.id)) && tLAt.cola > 0 && tLAt.generacion > 0 && tLAt.turno > 0 && salio[tH1.id].tiempos.armado > 0, "tiempos.csv: por trabajo quedan la espera de turno, la cola del proveedor, la generación, la subida, el armado y el total");
  tiempos.push([`8 trabajos (2 lotes de 8 imágenes, 3 clips, tope, 1 corrección, 3 armados de variación), reloj total`, Number(relojP.toFixed(1))]);
  tiempos.push(["  lote A (8 imágenes): reloj", tLAt.total], ["    espera de turno (suma de escenas)", tLAt.turno], ["    cola del proveedor de mentira (suma)", tLAt.cola], ["    generación en el proveedor de mentira (suma)", tLAt.generacion]);
  tiempos.push(["  armado de una variación (1 escena nueva)", salio[tH1.id].armado.segundos], ["  corrección de una escena: de entrar a salir", Number(((termino[tCX.id] - empezo[tCX.id]) / 1000).toFixed(1))]);
  kieLento.close();

  // ---- costos.csv con columnas por etapa; registro sin claves ----
  const csv = fs.readFileSync(path.join(carpetas.registro, "costos.csv"), "utf8").trim().split(/\r?\n/);
  const col = ENCABEZADO.split(",");
  const filas = csv.slice(1).map((l) => l.split(","));
  const de = (etapa) => filas.filter((f) => f[col.indexOf("etapa")] === etapa);
  ok(csv[0] === ENCABEZADO && de("imagenes").length >= 3 && de("clips").length >= 3 && de("armado").length >= 6 && de("imagenes").some((f) => f[col.indexOf("imagenes")] === "1" && f[col.indexOf("creditos")] === "3") && de("clips").some((f) => f[col.indexOf("segundos_generados")] === "5"), "costos.csv: una fila por trabajo con su etapa, imágenes, segundos generados y créditos");
  fs.writeFileSync(path.join(carpetas.registro, "costos.csv"), "fecha,trabajo,guion,version,formato,proveedor,modelos,resultado,segundos_video,segundos_generados,costo_estimado_usd,creditos\nvieja\n");
  require("../lib/etapas").anotarCosto(base, { trabajo: { id: "x" }, etapa: "armado", proveedor: "armado", modelos: [], resultado: "listo" });
  ok(fs.readFileSync(path.join(carpetas.registro, "costos.csv"), "utf8").startsWith(ENCABEZADO) && fs.readdirSync(carpetas.registro).some((f) => /^costos-hasta-/.test(f)), "costos.csv de la versión anterior: se aparta con otro nombre y se empieza uno con las columnas nuevas (no se pierde)");
  const log = fs.readFileSync(registro.archivo, "utf8");
  ok(!log.includes(SECRETO) && !/clave-kie-de-mentira|clave-eleven-de-mentira/.test(log) && !/token=[0-9a-f]{6}/.test(log), "registro: ni el secreto del CRM, ni las claves, ni las firmas de los enlaces quedan escritos");
  ok(crmFalso.visto.noAutorizadas === 0, "todas las llamadas al CRM llevaron el secreto");

  return fin();

  function fin() {
    crmFalso.cerrar();
    if (tiempos.length) {
      console.log("     Tiempos de armado en esta máquina:");
      for (const [que, s] of tiempos) console.log(`       ${String(s).padStart(5)} s  ${que}`);
      console.log(`     Fotogramas y videos de muestra: ${capturas}`);
    }
    return { tiempos, capturas };
  }
}

module.exports = { correrPruebas };

if (require.main === module) {
  let fallas = 0;
  const ok = (c, m) => {
    console.log(`${c ? "OK   " : "FALLA"} ${m}`);
    if (!c) fallas++;
  };
  const hasta = (process.argv.find((a) => a.startsWith("--hasta=")) || "").split("=")[1] || "todo";
  correrPruebas({ ok, hasta })
    .then(() => {
      console.log(fallas ? `\n${fallas} FALLAS` : "\nTODO OK");
      process.exit(fallas ? 1 : 0);
    })
    .catch((e) => {
      console.error("ERROR", e);
      process.exit(1);
    });
}
