"use strict";
// ¿Qué escribió Captions? Su API NO acepta vocabulario, nombres propios ni el guion, y NO devuelve la
// transcripción (documentación de captions.ai/help → API Reference, revisada el 20-oct-2026: el pedido
// solo lleva `caption_template_id` y `video`/`video_id`, y el objeto Video no trae texto ni costo).
//
// Por eso se LEE el video que devuelve: fotogramas → OCR que trae Windows (herramientas\ocr.ps1, sin
// internet ni costo) → texto en pantalla con su tiempo. Con eso:
//   · `transcripcionCaptions`: [{ desde, hasta, texto }] para que el CRM también lo audite. Es una
//     LECTURA de pantalla (también recoge texto que ya estuviera en el clip), no una transcripción.
//   · Se comprueba que las palabras de la marca y el producto que se DICEN en el guion estén bien
//     escritas. Si Captions escribió otra parecida («SERION» en vez de «CERYON») más veces de las que
//     la escribió bien, el armado usa los subtítulos propios.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "herramientas", "ocr.ps1");
const plano = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
// El OCR confunde 0/O, 1/I, 5/S y 8/B dentro de una palabra con letras: se igualan antes de comparar.
const ocr = (f) => (/[A-Z]/.test(f) && /\d/.test(f) ? f.replace(/0/g, "O").replace(/1/g, "I").replace(/5/g, "S").replace(/8/g, "B") : f);
const fichas = (t) => plano(t).replace(/@/g, "O").split(/[^A-Z0-9Ñ]+/).filter(Boolean).map(ocr);
const redondo = (x) => Math.round(x * 100) / 100;

/** Texto de cada imagen (rutas absolutas), en el mismo orden. Lanza { sinOcr: true } si este equipo no tiene OCR. */
function leerTextos(imagenes, { limiteMs = 5 * 60000 } = {}) {
  return new Promise((resolver, rechazar) => {
    if (process.platform !== "win32") return rechazar(Object.assign(new Error("el OCR de Windows solo existe en Windows"), { sinOcr: true }));
    const lista = path.join(path.dirname(imagenes[0] || "."), `ocr-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(lista, imagenes.join("\r\n"), "utf8");
    const hijo = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, "-Lista", lista], { windowsHide: true });
    let salida = "";
    let errores = "";
    const reloj = setTimeout(() => hijo.kill(), limiteMs);
    hijo.stdout.on("data", (d) => (salida += d.toString("utf8")));
    hijo.stderr.on("data", (d) => (errores = (errores + d).slice(-2000)));
    hijo.on("error", (e) => (clearTimeout(reloj), fs.rmSync(lista, { force: true }), rechazar(Object.assign(new Error(`no se pudo abrir PowerShell: ${e.message}`), { sinOcr: true }))));
    hijo.on("close", (codigo) => {
      clearTimeout(reloj);
      fs.rmSync(lista, { force: true });
      if (codigo !== 0) return rechazar(Object.assign(new Error(errores.trim().split(/\r?\n/).pop() || `OCR terminó con código ${codigo}`), { sinOcr: codigo === 3 }));
      const textos = imagenes.map(() => "");
      for (const linea of salida.split(/\r?\n/)) {
        try {
          const j = JSON.parse(linea);
          if (Number.isInteger(j.i) && j.i < textos.length) textos[j.i] = String(j.texto || "");
        } catch {
          /* línea que no es JSON */
        }
      }
      resolver(textos);
    });
  });
}

/**
 * Lee el texto en pantalla de un video en los segundos pedidos.
 * Devuelve { lecturas: [{ t, texto }], transcripcion: [{ desde, hasta, texto }] }.
 */
async function leerVideo({ ff, carpeta, video, momentos, base = "lectura" }) {
  const jpgs = [];
  for (const [i, t] of momentos.entries()) {
    const jpg = `${base}-${String(i).padStart(3, "0")}.jpg`;
    await ff.ffmpeg(["-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=720:-2", "-q:v", "3", "-update", "1", jpg], carpeta);
    jpgs.push(path.join(carpeta, jpg));
  }
  try {
    const textos = await leerTextos(jpgs);
    const lecturas = momentos.map((t, i) => ({ t: redondo(t), texto: textos[i].replace(/(?<=[A-Za-z])@(?=[A-Za-z])/g, "O").replace(/\s+/g, " ").trim() })); // «SERI@N» → «SERION»
    // Lecturas seguidas con el mismo texto se juntan en un tramo.
    const transcripcion = [];
    for (const l of lecturas) {
      const ultimo = transcripcion[transcripcion.length - 1];
      if (!l.texto) continue;
      if (ultimo && ultimo.texto === l.texto && l.t - ultimo.hasta <= 1.05) ultimo.hasta = l.t;
      else transcripcion.push({ desde: l.t, hasta: l.t, texto: l.texto });
    }
    return { lecturas, transcripcion };
  } finally {
    for (const j of jpgs) fs.rmSync(j, { force: true });
  }
}

function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Las palabras de marca y producto (≥ 4 letras) que se dicen en el guion. */
function palabrasDeMarca(nombres, guion) {
  const dichas = new Set(fichas(guion));
  const vistas = new Set();
  for (const n of nombres) for (const f of fichas(n)) if (f.length >= 4 && !/^\d+$/.test(f) && dichas.has(f)) vistas.add(f);
  return [...vistas];
}

/**
 * Compara lo leído con las palabras de la marca. `guion`: todo lo que se dice (para no confundir una
 * palabra normal del guion con un error). Devuelve [{ palabra, bien, mal: { "SERION": 2 } , malEscrita }].
 * Mal escrita: la variante parecida aparece en 2 fotogramas o más y más veces que la buena.
 */
function revisarMarcas(lecturas, palabras, guion) {
  const delGuion = new Set(fichas(guion));
  return palabras.map((p) => {
    let bien = 0;
    const mal = {};
    for (const l of lecturas) {
      const f = fichas(l.texto);
      if (f.includes(p)) bien++;
      for (const x of new Set(f)) {
        if (x === p || delGuion.has(x) || Math.abs(x.length - p.length) > 2 || x.length < 3) continue;
        if (distancia(x, p) <= (p.length <= 5 ? 1 : 2)) mal[x] = (mal[x] || 0) + 1;
      }
    }
    const nMal = Object.values(mal).reduce((a, x) => a + x, 0);
    // Un error de lectura del OCR sale en UN fotograma suelto; una palabra mal escrita se ve en varios.
    return { palabra: p, bien, mal, malEscrita: nMal >= 2 && nMal > bien };
  });
}

module.exports = { leerTextos, leerVideo, palabrasDeMarca, revisarMarcas, distancia };
