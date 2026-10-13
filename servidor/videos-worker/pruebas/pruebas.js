"use strict";
// Pruebas locales del trabajador. No necesitan el CRM, ni claves, ni internet:
//   1) piezas sueltas (subtítulos, tamaños, elección de modelo de fal, tachado de claves)
//   2) un trabajo completo con el proveedor simulado y un CRM de mentira:
//      genera los clips, monta con subtítulos y deja el MP4 en datos\prueba-local\
//   3) el proyecto por escenas completo (pruebas/etapas.js): imagenes → clips → armado →
//      corrección de una escena → rearmado, con un CRM de mentira que habla el contrato
//
//   node pruebas/pruebas.js                 todo
//   node pruebas/pruebas.js --sin-etapas    solo 1 y 2
//   node pruebas/etapas.js [--hasta=imagenes|clips]   solo 3
const fs = require("fs");
const path = require("path");
const os = require("os");
const { cargar } = require("../lib/entorno");
const { crearRegistro } = require("../lib/registro");
const { crear: crearFf, tamano } = require("../lib/ffmpeg");
const { armarAss, palabrasConTiempo, frases } = require("../lib/subtitulos");
const { cargarProveedor } = require("../proveedores");
const fal = require("../proveedores/fal");
const veo = require("../proveedores/veo");
const kie = require("../proveedores/kie");
const http = require("http");
const { unClip } = require("../lib/trabajo");
const { procesar } = require("../lib/trabajo");

let fallas = 0;
const ok = (c, m) => {
  console.log(`${c ? "OK   " : "FALLA"} ${m}`);
  if (!c) fallas++;
};

(async () => {
  const cfg = cargar();

  // ---- tamaños ----
  ok(JSON.stringify(tamano("9:16")) === '{"ancho":1080,"alto":1920}', "9:16 → 1080x1920");
  ok(JSON.stringify(tamano("16:9")) === '{"ancho":1920,"alto":1080}', "16:9 → 1920x1080");
  ok(JSON.stringify(tamano("1:1")) === '{"ancho":1080,"alto":1080}', "1:1 → 1080x1080");

  // ---- subtítulos ----
  const p = palabrasConTiempo("Hola, ¿a ti también te pasa? Mira esto.", 2, 4);
  ok(p.length === 8 && Math.abs(p[0].inicio - 2) < 1e-9 && Math.abs(p[7].fin - 6) < 1e-6, "las palabras cubren exactamente el tramo");
  ok(frases(p, 3).every((g) => g.length <= 3), "frases de máximo 3 palabras");
  const { ass, eventos } = armarAss([{ texto: "Pídelo hoy {con} envío gratis", desde: 0, dura: 3 }], { ancho: 1080, alto: 1920 });
  ok(eventos === 5 && /PÍDELO/.test(ass) && !/\{con\}/.test(ass) && /\\c&H00E6FF&/.test(ass), "ASS en mayúsculas, con la palabra resaltada y sin llaves del texto");

  // ---- tachado de claves en el registro ----
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reditus-reg-"));
  const reg = crearRegistro(tmp, ["clave-super-secreta-123"]);
  reg.info("Authorization: Bearer abcdefghijklmnop y clave-super-secreta-123 en https://x.test/a?token=zzzzzzzz&b=1");
  const escrito = fs.readFileSync(reg.archivo, "utf8");
  ok(!/clave-super-secreta-123|abcdefghijklmnop|zzzzzzzz/.test(escrito), "el registro no escribe claves, ni «Bearer …», ni tokens de URL");
  fs.rmSync(tmp, { recursive: true, force: true });

  // ---- fal: elección de modelo y entradas (sin llamar a fal) ----
  const trabajoFal = { formato: "ugc", opciones: { modelo: null }, imagenesProducto: ["https://tienda.test/foto.jpg"] };
  const conFoto = { n: 4, prompt: "producto en mano", duracion: 7.2, usaImagenProducto: true };
  const sinFoto = { n: 1, prompt: "persona hablando", duracion: 3, usaImagenProducto: false };
  const mi = fal.elegirModelo(cfg, trabajoFal, conFoto);
  const mt = fal.elegirModelo(cfg, trabajoFal, sinFoto);
  ok(mi.tipo === "imagenAVideo" && mt.tipo === "textoAVideo", `escena con foto → ${mi.alias}; sin foto → ${mt.alias}`);
  const ei = fal.armarEntrada(mi, { escena: conFoto, trabajo: trabajoFal, cfg, relacion: "9:16" }, fal.segundosPara(mi, conFoto));
  ok(ei[mi.campoImagen] === "https://tienda.test/foto.jpg" && ei.prompt === "producto en mano" && ei.aspect_ratio === "9:16" && ei.duration === "8", "entrada imagen-a-video: foto, prompt, 9:16 y duración redondeada hacia arriba");
  const et = fal.armarEntrada(mt, { escena: sinFoto, trabajo: trabajoFal, cfg, relacion: "9:16" }, fal.segundosPara(mt, sinFoto));
  ok(!("image_url" in et) && et.duration === String(mt.duracionMin), "entrada texto-a-video: sin foto y con la duración mínima del modelo");
  ok(fal.elegirModelo(cfg, { ...trabajoFal, imagenesProducto: [] }, conFoto).tipo === "textoAVideo", "sin fotos del producto se usa texto-a-video aunque la escena lo muestre");
  ok(fal.urlDelVideo({ video: { url: "https://v3.fal.media/files/x.mp4" } }) === "https://v3.fal.media/files/x.mp4", "URL del video leída de { video: { url } }");
  let lanzo = false;
  try {
    fal.urlDelVideo({ otra: 1 });
  } catch {
    lanzo = true;
  }
  ok(lanzo, "respuesta sin video → error claro");
  ok(typeof cargarProveedor("fal").comprobar({ ...cfg, falKey: "" }) === "string", "fal sin FAL_KEY → avisa qué falta");

  // ---- veo: elección de variante, duración, prompt y lectura del resultado (sin llamar a Google) ----
  const tv = { formato: "ugc", opciones: { modelo: null }, imagenesProducto: [] };
  ok(veo.elegirModelo(cfg, tv).id === cfg.config.veo.modelos[cfg.config.veo.porDefecto].id, `veo por defecto → ${veo.elegirModelo(cfg, tv).id}`);
  ok(veo.elegirModelo(cfg, { ...tv, opciones: { modelo: "estandar" } }).alias === "estandar" && veo.elegirModelo(cfg, { ...tv, opciones: { modelo: "veo-3.1-lite-generate-preview" } }).alias === "lite", "veo: el trabajo puede pedir la variante por alias o por identificador");
  ok(veo.segundosPara(cfg, { duracion: 3 }, "720p") === 4 && veo.segundosPara(cfg, { duracion: 5 }, "720p") === 6 && veo.segundosPara(cfg, { duracion: 12 }, "720p") === 8 && veo.segundosPara(cfg, { duracion: 3 }, "1080p") === 8, "veo: duración 4/6/8 según la escena; 1080p obliga a 8");
  const pv = veo.armarPrompt(cfg, { escena: { prompt: "Mujer en su carro", voz: "Hola, mira esto." }, audio: "veo" });
  const pe = veo.armarPrompt(cfg, { escena: { prompt: "Mujer en su carro", voz: "Hola, mira esto." }, audio: "elevenlabs" });
  ok(/"Hola, mira esto\."/.test(pv) && !/Hola/.test(pe) && /Sin diálogo/.test(pe), "veo: con audio de Veo la frase va en el prompt; con ElevenLabs se pide sin diálogo");
  ok(veo.uriDelVideo({ response: { generateVideoResponse: { generatedSamples: [{ video: { uri: "https://generativelanguage.googleapis.com/v1beta/files/x:download?alt=media" } }] } } }).includes("/files/x"), "veo: URI leída de response.generateVideoResponse.generatedSamples[0].video.uri");
  let sinVideo = false;
  try {
    veo.uriDelVideo({ done: true, response: { generateVideoResponse: {} } });
  } catch (e) {
    sinVideo = !!e.sinVideo;
  }
  ok(sinVideo, "veo: operación terminada sin video → error claro (bloqueo por filtros)");
  ok(typeof cargarProveedor("veo").comprobar({ ...cfg, geminiKey: "" }) === "string", "veo sin GEMINI_API_KEY → avisa qué falta");

  // ---- un trabajo completo, simulado, con un CRM de mentira ----
  const ff = crearFf(cfg);
  console.log("     " + (await ff.comprobar()));
  const datos = path.join(cfg.raiz, "datos", "prueba-local");
  fs.rmSync(datos, { recursive: true, force: true });
  const cfgPrueba = { ...cfg, elevenKey: "", elevenVoz: "", config: { ...cfg.config, simulado: { demoraSegundos: 0 } }, carpetas: { datos, trabajos: path.join(datos, "trabajos"), entregados: path.join(datos, "entregados"), registro: path.join(datos, "registro") } };
  const registro = crearRegistro(cfgPrueba.carpetas.registro, []);
  const llamadas = [];
  const crm = {
    progreso: async (t, d) => llamadas.push(["progreso", d.estado, d.progreso && d.progreso.detalle]),
    fallo: async (t, d) => (llamadas.push(["fallo", d.motivo]), { estado: "fallo", intentos: 1 }),
    entregar: async (t, archivo, d) => (llamadas.push(["entregar", d]), { estado: "listo" }),
  };
  const trabajo = {
    id: "20260101-000000-000000000000", toma: "local", guionId: "prueba", version: 1, formato: "ugc", producto: "Producto de prueba", relacionAspecto: "9:16", intentos: 1, maxIntentos: 3,
    imagenesProducto: [], opciones: { subtitulos: true, voz: true, modelo: null },
    escenas: [
      { n: 1, nombre: "Escena 1 · Impacto", prompt: "p1", duracion: 3, usaImagenProducto: false, voz: "¿A ti también te pasa que no duermes bien?" },
      { n: 2, nombre: "Escena 2 · Subida", prompt: "p2", duracion: 4, usaImagenProducto: true, voz: "Hasta que probé esto. Pídelo hoy con envío gratis." },
    ],
  };
  const r = await procesar(trabajo, { cfg: cfgPrueba, crm, ff, proveedor: cargarProveedor("simulado"), registro });
  const final = path.join(cfgPrueba.carpetas.entregados, `${trabajo.id}.mp4`);
  const dura = fs.existsSync(final) ? await ff.duracion(final) : 0;
  const entrega = (llamadas.find((l) => l[0] === "entregar") || [])[1] || {};
  ok(r.ok && Math.abs(dura - 7) < 0.3, `trabajo simulado completo: MP4 de ${dura.toFixed(2)} s (se esperaban 7)`);
  ok(entrega.sinVoz === true && entrega.segundosGenerados === 7 && entrega.costoEstimadoUsd === 0 && /ElevenLabs/.test((entrega.avisos || []).join(" ")), "reporta sin voz, 7 s generados y costo 0");
  ok(llamadas.some((l) => l[1] === "generando") && llamadas.some((l) => l[1] === "montando"), "reportó «generando» y «montando»");
  ok(!fs.existsSync(path.join(cfgPrueba.carpetas.trabajos, trabajo.id)), "limpió la carpeta temporal del trabajo");
  console.log(`     Video de prueba: ${final}`);

  // ---- kie: un servidor de mentira que imita su contrato (createTask → recordInfo → archivo) ----
  await ff.ffmpeg(["-f", "lavfi", "-i", "color=c=0x334455:s=720x1280:r=24:d=4", "-f", "lavfi", "-i", "sine=frequency=330:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "clip-kie.mp4"], datos);
  const kieVisto = { creadas: [], consultas: 0, auth: new Set() };
  const servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      kieVisto.auth.add(req.headers.authorization || "");
      const json = (o) => (res.writeHead(200, { "content-type": "application/json" }), res.end(JSON.stringify(o)));
      if (req.url === "/archivo.mp4") return fs.createReadStream(path.join(datos, "clip-kie.mp4")).pipe((res.writeHead(200, { "content-type": "video/mp4" }), res));
      if (req.headers.authorization !== "Bearer clave-kie-de-mentira") return json({ code: 401, msg: "You do not have access permissions" });
      if (req.url === "/api/v1/chat/credit") return json({ code: 200, msg: "success", data: 100.5 });
      if (req.method === "POST" && req.url === "/api/v1/jobs/createTask") {
        const c = JSON.parse(cuerpo);
        if (c.input.prompt.includes("SIN-CREDITOS")) return json({ code: 402, msg: "Insufficient credits" }); // HTTP 200 con code de error, como avisa su documentación
        kieVisto.creadas.push(c);
        return json({ code: 200, msg: "success", data: { taskId: `veo_task_${kieVisto.creadas.length}` } });
      }
      if (req.method === "GET" && req.url.startsWith("/api/v1/jobs/recordInfo?taskId=")) {
        kieVisto.consultas++;
        const taskId = req.url.split("=")[1];
        const lista = kieVisto.consultas % 2 === 0; // la primera consulta de cada tarea aún no está lista
        return json({ code: 200, msg: "success", data: lista ? { taskId, state: "success", resultJson: JSON.stringify({ resultUrls: [`http://127.0.0.1:${servidor.address().port}/archivo.mp4`] }), creditsConsumed: 12.5 } : { taskId, state: "generating" } });
      }
      json({ code: 404, msg: "not found" });
    });
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const cfgKie = { ...cfgPrueba, kieKey: "clave-kie-de-mentira", kieBase: `http://127.0.0.1:${servidor.address().port}`, config: { ...cfgPrueba.config, audio: { porDefecto: "veo", porFormato: {} }, kie: { ...cfg.config.kie, consultarCadaSegundos: 0.2, usdPorCredito: 0.005 } } };
  const urlOriginal = kie.urlDelVideo;
  ok(urlOriginal({ resultJson: JSON.stringify({ resultUrls: ["https://tempfile.aiquickdraw.com/v/x.mp4"] }) }).endsWith("x.mp4") && urlOriginal({ response: { data: { result_urls: ["https://a.test/y.mp4"] } } }).endsWith("y.mp4"), "kie: URL del video leída de resultJson.resultUrls y de data.result_urls (1080p/4k)");
  ok((await kie.creditos(cfgKie)) === 100.5, "kie: créditos de la cuenta (GET /api/v1/chat/credit)");
  const eT = kie.armarEntrada(cfgKie, { escena: { prompt: "p", duracion: 5, usaImagenProducto: false, voz: "Hola." }, trabajo: { imagenesProducto: [], opciones: {} }, relacion: "9:16", audio: "veo" }, kie.modeloPara(cfgKie, { formato: "ugc", opciones: {} }, false));
  ok(eT.input.model === "veo3_fast" && eT.input.generation_type === "TEXT_2_VIDEO" && eT.input.aspect_ratio === "9:16" && eT.input.duration === 6 && eT.input.resolution === "720p" && !("image_urls" in eT.input) && /"Hola\."/.test(eT.input.prompt), "kie texto a video: veo3_fast, TEXT_2_VIDEO, 9:16, 6 s (número), 720p, con la frase en el prompt");
  const tImg = { formato: "ugc", imagenesProducto: ["https://tienda.test/a.jpg", "https://tienda.test/b.jpg"], opciones: {} };
  const eI = kie.armarEntrada(cfgKie, { escena: { prompt: "p", duracion: 3, usaImagenProducto: true, voz: "" }, trabajo: tImg, relacion: "9:16", audio: "elevenlabs" }, kie.modeloPara(cfgKie, tImg, true));
  ok(eI.input.generation_type === "FIRST_AND_LAST_FRAMES_2_VIDEO" && eI.input.image_urls.length === 1 && eI.input.image_urls[0] === "https://tienda.test/a.jpg" && eI.input.duration === 4 && /Sin diálogo/.test(eI.input.prompt), "kie imagen a video: la primera foto por URL como primer fotograma, 4 s");
  const cfgRef = { ...cfgKie, config: { ...cfgKie.config, kie: { ...cfgKie.config.kie, modoImagen: "referencia" } } };
  const eR = kie.armarEntrada(cfgRef, { escena: { prompt: "p", duracion: 3, usaImagenProducto: true, voz: "" }, trabajo: tImg, relacion: "9:16", audio: "ninguno" }, kie.modeloPara(cfgRef, tImg, true));
  ok(eR.input.generation_type === "REFERENCE_2_VIDEO" && eR.input.image_urls.length === 2 && eR.input.duration === 8, "kie modo referencia: hasta 3 fotos y siempre 8 s");
  ok(kie.modeloPara(cfgKie, { formato: "ugc", opciones: { modelo: "calidad" } }, false).variante === "veo3" && kie.modeloPara(cfgKie, { formato: "ugc", opciones: { modelo: "veo3_lite" } }, false).alias === "lite", "kie: el trabajo puede pedir la variante por alias o por su nombre en Kie");

  const llamadasK = [];
  const crmK = { progreso: async () => {}, fallo: async (t, d) => (llamadasK.push(["fallo", d.motivo]), { estado: "pendiente", intentos: 1, reintentaDesde: null }), entregar: async (t, a, d) => (llamadasK.push(["entregar", d]), { estado: "listo" }) };
  const tK = { ...trabajo, id: "20260101-000002-000000000002", escenas: trabajo.escenas.map((e) => ({ ...e, duracion: 3, usaImagenProducto: false })) };
  const rK = await procesar(tK, { cfg: cfgKie, crm: crmK, ff, proveedor: kie, registro });
  const eK = (llamadasK.find((l) => l[0] === "entregar") || [])[1] || {};
  if (process.env.DEPURAR) console.log("     [", JSON.stringify(eK));
  ok(rK.ok && kieVisto.creadas.length === 2 && kieVisto.creadas[0].model === "veo-3-1" && kieVisto.creadas[0].input.model === "veo3_fast", "kie de mentira: trabajo completo, 2 tareas creadas con model veo-3-1 / input.model veo3_fast");
  ok(eK.segundosGenerados === 8 && eK.modelos[0] === "kie:veo3_fast" && Math.abs(eK.costoEstimadoUsd - 0.125) < 0.002 && /Créditos gastados en el proveedor: 25/.test((eK.avisos || []).join(" ")) && eK.sinVoz === false, "kie: reporta 8 s, la variante, 25 créditos (creditsConsumed) y su costo en dólares");
  ok([...kieVisto.auth].every((a) => a === "" || a === "Bearer clave-kie-de-mentira"), "kie: la clave solo viaja a la API (la descarga del archivo va sin ella)");

  // retomar: una tarea ya creada no se vuelve a crear
  const antes = kieVisto.creadas.length;
  const dirR = path.join(cfgKie.carpetas.trabajos, "20260101-000003-000000000003");
  fs.mkdirSync(dirR, { recursive: true });
  fs.writeFileSync(path.join(dirR, "estado.json"), JSON.stringify({ enCurso: true, escenas: { 1: { memoria: { taskId: "veo_task_previa", variante: "veo3_fast", segundos: 4 } } }, segundosGenerados: 0, costoUsd: null, modelos: [] }));
  const tR = { ...tK, id: "20260101-000003-000000000003", escenas: [tK.escenas[0]] };
  const rR = await procesar(tR, { cfg: cfgKie, crm: crmK, ff, proveedor: kie, registro });
  ok(rR.ok && kieVisto.creadas.length === antes, "kie: tras un reinicio retoma la tarea guardada (no crea ni paga otra)");

  // error con HTTP 200 y code 402
  const tE = { ...tK, id: "20260101-000004-000000000004", escenas: [{ ...tK.escenas[0], prompt: "SIN-CREDITOS" }] };
  await procesar(tE, { cfg: cfgKie, crm: crmK, ff, proveedor: kie, registro });
  ok(llamadasK.some((l) => l[0] === "fallo" && /402/.test(l[1]) && /Insufficient credits/.test(l[1])), "kie: un error con HTTP 200 y code 402 se detecta y se reporta como fallo con su motivo");

  // prueba de un clip
  const u = await unClip({ cfg: cfgKie, ff, proveedor: kie, registro }, "Taza de café");
  const ultima = kieVisto.creadas[kieVisto.creadas.length - 1].input;
  ok(fs.existsSync(u.archivo) && ultima.duration === 4 && ultima.generation_type === "TEXT_2_VIDEO" && ultima.resolution === "720p" && u.creditos === 12.5, "prueba de un clip: UNA tarea de 4 s, solo texto, 720p; guarda el clip y dice los créditos");
  servidor.close();

  // ---- audio "veo": un proveedor de mentira cuyos clips traen audio; no se le pone otra voz encima ----
  const conAudio = {
    nombre: "veo-de-mentira",
    daAudio: true,
    comprobar: () => null,
    async generarEscena(ctx) {
      await ctx.ff.ffmpeg(["-f", "lavfi", "-i", "color=c=0x224466:s=720x1280:r=24:d=4", "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", ctx.salida], ctx.carpeta);
      return { segundos: 4, modelo: "veo-de-mentira-rapido", costoUsd: null };
    },
  };
  const llamadas2 = [];
  const crm2 = { progreso: async () => {}, fallo: async (t, d) => (llamadas2.push(["fallo", d.motivo]), { estado: "fallo", intentos: 1 }), entregar: async (t, a, d) => (llamadas2.push(["entregar", d]), { estado: "listo" }) };
  const t2 = { ...trabajo, id: "20260101-000001-000000000001", escenas: trabajo.escenas.map((e) => ({ ...e, duracion: 3 })) };
  const cfgVeo = { ...cfgPrueba, elevenKey: "no-debe-usarse", elevenVoz: "no-debe-usarse", config: { ...cfgPrueba.config, audio: { porDefecto: "veo", porFormato: {} } } };
  const r2 = await procesar(t2, { cfg: cfgVeo, crm: crm2, ff, proveedor: conAudio, registro });
  const final2 = path.join(cfgPrueba.carpetas.entregados, `${t2.id}.mp4`);
  const e2 = (llamadas2.find((l) => l[0] === "entregar") || [])[1] || {};
  const volumen = await new Promise((res) => {
    const h = require("child_process").spawn(cfg.ffmpeg, ["-hide_banner", "-i", final2, "-af", "volumedetect", "-vn", "-f", "null", "-"]);
    let s = "";
    h.stderr.on("data", (d) => (s += d));
    h.on("close", () => res(Number((/mean_volume: (-?[\d.]+) dB/.exec(s) || [])[1])));
  });
  ok(r2.ok && Math.abs((await ff.duracion(final2)) - 8) < 0.3, "audio de Veo: cada escena conserva los 4 s de su clip (no se corta la frase) → 8 s");
  ok(volumen > -40, `audio de Veo: el audio del clip llega al video final (volumen medio ${volumen} dB) y no se llamó a ElevenLabs`);
  ok(e2.sinVoz === false && e2.costoEstimadoUsd === undefined && e2.segundosGenerados === 8 && e2.modelos[0] === "veo-de-mentira-rapido" && /generado por Veo/.test(e2.avisos.join(" ")), "reporta 8 s generados, la variante usada y costo desconocido (sin tarifa no se inventa)");

  // ---- proyecto por escenas: imagenes → clips → armado → correcciones (pruebas/etapas.js) ----
  if (!process.argv.includes("--sin-etapas")) {
    console.log("\n     Proyecto por escenas (CRM de mentira que habla el contrato):");
    await require("./etapas").correrPruebas({ ok });
  }

  console.log(fallas ? `\n${fallas} FALLAS` : "\nTODO OK");
  process.exit(fallas ? 1 : 0);
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
