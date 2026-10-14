"use strict";
// Muestras para MIRAR (no son pruebas que pasen o fallen): arma videos cortos con clips de verdad
// para ver la tarjeta de cierre, las cinco plantillas de subtítulos y las transiciones.
// No llama a ningún servicio ni gasta: todo es ffmpeg en este equipo.
//
//   node pruebas/muestras.js <carpeta>
//
// <carpeta> debe traer clips .mp4 (los primeros 7 que encuentre, por nombre) y una foto del producto
// (foto.png o foto.jpg). Deja los videos y fotogramas en  <repo>\qa-capturas\trabajador-etapas\ .
const fs = require("fs");
const path = require("path");
const http = require("http");
const { cargar } = require("../lib/entorno");
const { crearRegistro } = require("../lib/registro");
const { crear: crearFf } = require("../lib/ffmpeg");
const { armar } = require("../lib/armado");
const { ESTILOS } = require("../lib/subtitulos");

(async () => {
  const origen = path.resolve(process.argv[2] || "");
  if (!process.argv[2] || !fs.existsSync(origen)) {
    console.error("Uso: node pruebas/muestras.js <carpeta con clips .mp4 y foto.png>");
    process.exit(1);
  }
  const clips = fs.readdirSync(origen).filter((f) => /\.mp4$/i.test(f)).sort().slice(0, 7);
  const foto = fs.readdirSync(origen).find((f) => /^foto\.(png|jpe?g|webp)$/i.test(f));
  if (!clips.length || !foto) {
    console.error("La carpeta debe traer al menos un clip .mp4 y un archivo foto.png (o foto.jpg).");
    process.exit(1);
  }
  const cfg0 = cargar();
  const datos = path.join(cfg0.raiz, "datos", "muestras");
  fs.rmSync(datos, { recursive: true, force: true });
  const carpetas = { datos, cache: path.join(datos, "cache"), registro: path.join(datos, "registro"), musica: path.join(datos, "musica") };
  for (const c of Object.values(carpetas)) fs.mkdirSync(c, { recursive: true });
  const cfg = { ...cfg0, elevenKey: "", elevenVoz: "", permitirHttpLocal: true, carpetas };
  const ff = crearFf(cfg);
  const registro = crearRegistro(carpetas.registro, []);
  const salida = path.resolve(cfg.raiz, "..", "..", "qa-capturas", "trabajador-etapas");
  fs.mkdirSync(salida, { recursive: true });

  // Los archivos se sirven por http local, igual que llegarían del CRM.
  const servidor = http.createServer((req, res) => {
    const f = path.join(origen, path.basename(decodeURIComponent(req.url.split("?")[0])));
    if (!fs.existsSync(f)) return res.writeHead(404), res.end();
    res.writeHead(200);
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => servidor.listen(0, "127.0.0.1", r));
  const url = (f) => `http://127.0.0.1:${servidor.address().port}/${encodeURIComponent(f)}`;
  const cierre = { oferta: "2x1: dos gafas Ceryon Eclipse por 79 €", llamadoALaAccion: "Pídelas en el enlace de abajo", titular: "2x1", detalle: "Dos gafas Ceryon Eclipse por 79 €", color: "#0553C9" };
  const trabajo = (id, escenas, opciones = {}, extra = {}) => ({
    id, guionId: id, version: 1, etapa: "armado", relacionAspecto: "9:16", formato: "ugc",
    contexto: { producto: "Muestra", pais: "ES", fotos: [url(foto)], cierre: { ...cierre, ...(extra.cierre || {}) }, voz: { motor: "clip" } },
    todas: escenas, escenas: [], opciones: { subtitulos: true, voz: true, musica: false, ...opciones }, ...(extra.apertura ? { apertura: extra.apertura } : {}),
  });
  const clip = (n, f, mas = {}) => ({ n, tipo: "generada", duracion: 8, voz: "", clip: { estado: "aprobada", url: url(f) }, ...mas });
  const cuadro = (video, segundo, nombre) => ff.ffmpeg(["-ss", String(Math.max(0, segundo)), "-i", video, "-frames:v", "1", "-update", "1", path.join(salida, nombre)]);
  const hacer = async (t) => armar({ cfg, ff, registro, trabajo: t, carpeta: carpetas.cache });

  // 1. El video entero con la tarjeta de cierre nueva.
  let t0 = Date.now();
  let r = await hacer(trabajo("muestra-completa", [...clips.map((f, i) => clip(i + 1, f)), { n: clips.length + 1, tipo: "cierre", duracion: 5, voz: "", fotoUrl: url(foto) }]));
  fs.copyFileSync(r.archivo, path.join(salida, "real-video-completo.mp4"));
  const c = r.cierres[0];
  for (const s of [0.2, 0.6, 2]) await cuadro(r.archivo, c.inicio + s, `real-cierre-${String(s).replace(".", "_")}s.png`);
  console.log(`Video completo: ${r.duracion.toFixed(1)} s, armado en ${((Date.now() - t0) / 1000).toFixed(1)} s · fondo del cierre: ${c.fondo} · transiciones: ${r.transiciones.join(", ")}`);

  // 2. El cierre con urgencia.
  r = await hacer(trabajo("muestra-urgencia", [clip(1, clips[clips.length - 1], { duracion: 2 }), { n: 2, tipo: "cierre", duracion: 5, voz: "", fotoUrl: url(foto) }], {}, { cierre: { urgencia: "Solo esta semana" } }));
  await cuadro(r.archivo, r.cierres[0].inicio + 2, "real-cierre-con-urgencia.png");

  // 3. Las cinco plantillas de subtítulos sobre un clip real.
  const frase = "¿Te arden los ojos de noche? Estas gafas bloquean el 99,14 % de la luz azul.";
  for (const estilo of ESTILOS) {
    r = await hacer(trabajo(`muestra-${estilo}`, [clip(1, clips[0], { voz: frase, enfasis: ["ojos", "azul"], duracion: 7 })], { estiloSubtitulos: estilo }));
    fs.copyFileSync(r.archivo, path.join(salida, `real-plantilla-${estilo}.mp4`));
    await cuadro(r.archivo, r.segmentos[0].subtitulo.desde + r.segmentos[0].subtitulo.dura * 0.55, `real-plantilla-${estilo}.png`);
  }
  console.log(`Plantillas: ${ESTILOS.join(", ")}`);

  // 4. Las transiciones, una tras otra, y una apertura de cortes rápidos.
  const orden = ["zoom", "barrido", "deslizar", "flash", "glitch"];
  const usar = clips.slice(0, Math.min(clips.length, orden.length + 1));
  r = await hacer(trabajo("muestra-transiciones", usar.map((f, i) => clip(i + 1, f, { duracion: 1.6, ...(i ? { transicion: orden[i - 1] } : {}) }))));
  fs.copyFileSync(r.archivo, path.join(salida, "real-transiciones.mp4"));
  for (const s of r.segmentos.slice(1, 4)) await cuadro(r.archivo, s.inicio + 0.07, `real-transicion-${s.transicion}.png`);
  console.log(`Transiciones en la muestra: ${r.transiciones.join(", ")}`);
  if (clips.length >= 3) {
    r = await hacer(trabajo("muestra-apertura", [clip(1, clips[0], { duracion: 3 })], {}, { apertura: [{ n: 1, desde: 1, hasta: 1.6 }, { n: 1, desde: 4, hasta: 4.6 }, { n: 1, desde: 6.5, hasta: 7.1 }] }));
    fs.copyFileSync(r.archivo, path.join(salida, "real-apertura-rapida.mp4"));
  }

  // 5. Un trabajo de armado CON LOS MISMOS CAMPOS que manda el CRM (src/lib/trabajos-video.ts → escenaFuera
  //    y opciones): apertura en cortes, locución por escena, cierre con urgencia, estilo «palabra», ritmo.
  //    Las frases son de ejemplo (no es el guion real). Se arma dos veces: con la voz del clip y con
  //    narración, usando un ElevenLabs DE MENTIRA local (un tono en vez de voz) para ver los tiempos.
  const frases = ["¿Te arden los ojos de noche?", "Es la luz azul de las pantallas.", "Estas gafas la bloquean.", "Bloquean el 99,14 % de la luz azul.", "Duermes mejor desde la primera noche.", "Y hoy van 2x1 por 79 €.", "Pídelas en el enlace de abajo."];
  const comoCrm = (motor, id) => {
    const cierreCrm = { ...cierre, urgencia: "2x1 solo esta semana" };
    const voz = { motor, idioma: "es-ES", acento: "español de España (castellano peninsular)", descripcion: "voz adulta joven, cálida y cercana, ritmo natural de conversación, sin tono de locutor" };
    const todas = clips.map((f, i) => ({
      n: i + 1, paso: Math.min(5, i + 1), tipo: "generada", titulo: `Escena ${i + 1}`, nombre: `Escena ${i + 1}`,
      duracion: i === 0 ? 3 : 6, voz: frases[i] || "", locucion: "narrador", promptImagen: "…", promptVideo: "…\nAUDIO: sin diálogo; solo sonido ambiente.", fotoUrl: null, movimiento: null,
      ...(i === 0 ? { cortes: [{ desde: 0, hasta: 1 }, { desde: 2.2, hasta: 2.9 }, { desde: 4.2, hasta: 4.9 }, { desde: 6.2, hasta: 6.8 }], duracionClip: 8 } : { transicion: ["zoom", "barrido", "deslizar", "flash", "glitch"][(i - 1) % 5], golpesVisuales: [2, 4] }),
      imagen: { estado: "aprobada", url: url(foto), intentos: 1, nota: "" },
      clip: { estado: "aprobada", url: url(f), intentos: 1, nota: "", sinRevisar: true },
    }));
    todas.push({ n: clips.length + 1, paso: 5, tipo: "cierre", titulo: "Cierre", nombre: "Cierre", duracion: 5, voz: frases[6], locucion: "narrador", fotoUrl: url(foto), movimiento: "quieto", transicion: "fundido", imagen: { estado: "pendiente", url: null, intentos: 0, nota: "" }, clip: { estado: "pendiente", url: null, intentos: 0, nota: "" } });
    return {
      id, toma: "simulada", guionId: id, version: 1, etapa: "armado", relacionAspecto: "9:16", formato: "ugc", producto: "Ceryon Eclipse", pais: "ES", intentos: 1, maxIntentos: 3,
      imagenesProducto: [url(foto)], cierre: cierreCrm,
      contexto: { producto: "Ceryon Eclipse", pais: "ES", fotos: [url(foto)], analisisProducto: "Gafas de montura negra con lentes rojas.", cierre: cierreCrm, voz },
      escenas: [], todas,
      opciones: { subtitulos: true, voz: true, musica: null, modelo: null, tonoMusica: "suspenso", estiloSubtitulos: "palabra", ritmo: "rapido" },
    };
  };
  r = await hacer(comoCrm("clip", "como-crm-voz-del-clip"));
  fs.copyFileSync(r.archivo, path.join(salida, "real-como-crm-voz-del-clip.mp4"));
  for (const s of [0.4, 1.4, 2.4]) await cuadro(r.archivo, s, `real-como-crm-apertura-${String(s).replace(".", "_")}s.png`);
  await cuadro(r.archivo, r.cierres[0].inicio + 2, "real-como-crm-cierre.png");
  console.log(`Como lo manda el CRM (voz del clip): ${r.duracion.toFixed(1)} s · apertura ${r.segmentos[0].dura.toFixed(2)} s en ${r.segmentos[0].cortes} tramos · subtítulos «${r.estiloSubtitulos}» · transiciones: ${r.transiciones.join(", ")}`);
  for (const a of r.avisos) console.log(`   aviso: ${a}`);
  // Narración sin clave: debe negarse con un motivo claro.
  try {
    await hacer(comoCrm("narracion", "como-crm-narracion-sin-clave"));
    console.log("OJO: con narración y sin clave debía fallar y no falló.");
  } catch (e) {
    console.log(`Con narración y sin clave de ElevenLabs: ${e.message.slice(0, 110)}…`);
  }
  // Narración con un ElevenLabs de mentira (tono de 2,4 s por frase): solo para ver duraciones y sincronía.
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=300:duration=2.4,volume=3", "-c:a", "libmp3lame", "-b:a", "128k", "voz-de-mentira.mp3"], datos);
  const eleven = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (d) => (cuerpo += d));
    req.on("end", () => {
      const letras = [...JSON.parse(cuerpo).text];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ audio_base64: fs.readFileSync(path.join(datos, "voz-de-mentira.mp3")).toString("base64"), alignment: { characters: letras, character_start_times_seconds: letras.map((_, i) => 0.1 + (i * 2.2) / letras.length), character_end_times_seconds: letras.map((_, i) => 0.1 + ((i + 1) * 2.2) / letras.length) } }));
    });
  });
  await new Promise((ok) => eleven.listen(0, "127.0.0.1", ok));
  const cfgNarr = { ...cfg, elevenKey: "clave-de-mentira", elevenVoz: "vozDeMentira00000001", elevenBase: `http://127.0.0.1:${eleven.address().port}` };
  r = await armar({ cfg: cfgNarr, ff, registro, trabajo: comoCrm("narracion", "como-crm-narracion-simulada"), carpeta: carpetas.cache });
  fs.copyFileSync(r.archivo, path.join(salida, "real-como-crm-narracion-simulada.mp4"));
  console.log(`Como lo manda el CRM (narración simulada, la «voz» es un tono): ${r.duracion.toFixed(1)} s · escenas de ${r.segmentos.map((x) => x.dura.toFixed(1)).join(" / ")} s · ${r.caracteresNarrados} caracteres`);
  eleven.close();

  // 6. Versión 2: transiciones más dinámicas, golpes visuales, ritmo «muy-rapido» y cortes al golpe de una
  //    pista con pulso (fabricada con ffmpeg: no es música de nadie).
  fs.mkdirSync(path.join(carpetas.musica, "suspenso"), { recursive: true });
  await ff.ffmpeg(["-f", "lavfi", "-i", "sine=frequency=55:duration=0.11,volume=6,apad=whole_dur=0.5,aloop=loop=31:size=22050", "-f", "lavfi", "-i", "sine=frequency=110:duration=16,volume=0.6,tremolo=f=4:d=0.7", "-filter_complex", "[0:a][1:a]amix=inputs=2:normalize=0", "-t", "16", "-c:a", "libmp3lame", "-b:a", "128k", "pulso-de-prueba.mp3"], path.join(carpetas.musica, "suspenso"));
  const v2 = usar.map((f, i) => clip(i + 1, f, { duracion: 1.6, ...(i ? { transicion: orden[i - 1] } : {}) }));
  r = await hacer(trabajo("muestra-transiciones-v2", v2, { ritmo: "muy-rapido" }));
  fs.copyFileSync(r.archivo, path.join(salida, "real-transiciones-v2.mp4"));
  for (const x of r.segmentos.slice(1, 4)) await cuadro(r.archivo, x.inicio + 0.05, `real-transicion-v2-${x.transicion}.png`);
  const completo = comoCrm("clip", "como-crm-completo-v2");
  completo.opciones = { ...completo.opciones, ritmo: "muy-rapido", estiloSubtitulos: "impacto", musica: null, tonoMusica: "suspenso" };
  t0 = Date.now();
  r = await hacer(completo);
  fs.copyFileSync(r.archivo, path.join(salida, "real-video-completo-v2.mp4"));
  await cuadro(r.archivo, r.segmentos[2].inicio + 2.3, "real-v2-golpe-visual.png");
  await cuadro(r.archivo, r.cierres[0].inicio + 0.15, "real-v2-cierre-con-fundido.png");
  console.log(`Video completo v2: ${r.duracion.toFixed(1)} s, armado en ${((Date.now() - t0) / 1000).toFixed(1)} s · transiciones: ${r.transiciones.join(", ")} · golpes visuales por escena: ${r.segmentos.map((x) => x.golpesVisuales.length).join("/")} · cortes llevados al golpe de la música: ${r.cortesAlGolpe} (de ${r.golpesDeLaMusica} golpes detectados) · música: ${r.conMusica ? r.tonoMusica : "no"}`);

  servidor.close();
  console.log(`Muestras en: ${salida}`);
  process.exit(0);
})().catch((e) => {
  console.error("ERROR", e);
  process.exit(1);
});
