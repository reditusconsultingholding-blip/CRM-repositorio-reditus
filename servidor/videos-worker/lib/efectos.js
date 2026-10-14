"use strict";
// Dinamismo del armado: transiciones cortas entre escenas, micro-zoom para que ningún clip quede
// quieto, golpes de sonido en los cortes y cortes al ritmo de la música. Todo lo hace ffmpeg; no hay
// material de terceros: los sonidos (barrido e impacto) se FABRICAN aquí con ruido y tonos.
//
// Las transiciones se dibujan en la CABEZA del segmento que entra (sus primeras décimas de
// segundo), así cada escena sigue siendo un archivo independiente que se guarda y se reutiliza:
//
//   corte      corte seco, sin efecto
//   zoom       «zoom-punch»: entra acercado y desenfocado, se asienta en 0,2 s con una sacudida corta
//   barrido    «whip»: entra de lado con desenfoque horizontal fuerte y estela; la anterior sale desenfocada
//   flash      destello del COLOR DE LA MARCA que se apaga en 0,15 s, con sacudida corta
//   glitch     separación de colores muy breve
//   deslizar   la escena nueva entra deslizando sobre el último cuadro de la anterior
//   fundido    la escena nueva aparece suavemente sobre el último cuadro de la anterior (0,3 s)
//
// Ritmo (`opciones.ritmo`), de más a menos movido:
//   muy-rapido   todas enérgicas y más intensas, acelerón al entrar y salir de cada toma
//   rapido       enérgicas (zoom, barrido, flash, glitch, deslizar), acelerón al entrar
//   medio        alterna con cortes secos, intensidad moderada
//   calmado      solo cortes secos y fundidos, sin golpes de sonido (marcas sobrias)
// Sin ritmo: los cortes de los primeros 3 s van en «rapido» y el resto en «medio».
// Una escena puede traer la suya en `transicion`. Hacia el cierre siempre va corte seco (la tarjeta
// trae su propia entrada) y sobre la tarjeta nunca hay efectos.
//
// Para no marear: entre un efecto y el siguiente pasa un mínimo de tiempo (según el ritmo); si dos
// cortes quedan más juntos que eso, el segundo va en corte seco.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const TRANSICIONES = ["corte", "zoom", "barrido", "flash", "glitch", "deslizar", "fundido"];
const RITMOS = ["muy-rapido", "rapido", "medio", "calmado"];
const CICLO = {
  "muy-rapido": ["zoom", "barrido", "flash", "glitch", "barrido", "zoom"], // solo las enérgicas
  rapido: ["zoom", "barrido", "flash", "glitch", "zoom", "deslizar"],
  medio: ["corte", "deslizar", "zoom", "corte", "barrido", "corte", "flash"],
  // marcas sobrias: solo cortes secos y fundidos suaves
  calmado: ["corte", "fundido", "corte", "corte", "fundido"],
};
const DURA = { corte: 0, zoom: 0.2, barrido: 0.18, flash: 0.15, glitch: 0.18, deslizar: 0.24, fundido: 0.3 };
// Qué sonido acompaña a cada transición.
const SONIDO = { zoom: "impacto", flash: "impacto", glitch: "impacto", barrido: "barrido", deslizar: "barrido" };
// Cuánta fuerza llevan los efectos y cada cuánto se permite uno, según el ritmo.
const INTENSIDAD = { "muy-rapido": 1.3, rapido: 1, medio: 0.7, calmado: 0.4 };
const PAUSA_MINIMA = { "muy-rapido": 0.45, rapido: 0.7, medio: 1.2, calmado: 2 };

/** «Muy rápido», «muy_rapido», «rapido»… → el nombre canónico, o "" si no es un ritmo. */
function normalizarRitmo(r) {
  const t = String(r || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
  if (!t) return ""; // sin ritmo: automático (rápido en los primeros 3 s, medio después)
  return { muyrapido: "muy-rapido", rapido: "rapido", medio: "medio", calmado: "calmado" }[t] || "rapido"; // un valor que no se conoce se trata como «rapido»
}

/** El ritmo que aplica a un corte que cae en el segundo `inicio` del video. */
function ritmoEn(ritmo, inicio) {
  return RITMOS.includes(ritmo) ? ritmo : inicio < 3 ? "rapido" : "medio";
}

/**
 * La transición con la que ENTRA la escena número `indice` (0 = la primera del video).
 *   inicio          segundo del video donde empieza esa escena
 *   ritmo           uno de RITMOS, o "" (automático)
 *   desdeUltimo     segundos desde el último efecto (para no marear); Infinity si no hubo
 */
function elegirTransicion({ indice, inicio, ritmo = "", pedida = "", tipo = "", semilla = "", activas = true, desdeUltimo = Infinity }) {
  if (indice === 0 || !activas) return "corte"; // el video entra en seco
  // Sobre la tarjeta de cierre nunca hay efectos: entra en corte o, si el CRM lo pide, con un fundido suave.
  if (tipo === "cierre") return pedida === "fundido" ? "fundido" : "corte";
  if (TRANSICIONES.includes(pedida)) return pedida;
  const r = ritmoEn(ritmo, inicio);
  if (desdeUltimo < PAUSA_MINIMA[r]) return "corte"; // tope de efectos por segundo
  const salto = parseInt(crypto.createHash("sha1").update(String(semilla)).digest("hex").slice(0, 4), 16);
  const ciclo = CICLO[r];
  return ciclo[(indice - 1 + salto) % ciclo.length];
}

/**
 * Filtros de video de la entrada de una escena.
 *   zoomExtra   expresión (en función de `t`) que se SUMA al zoom de la escena, o ""
 *   dx, dy      expresiones (px) que corren el encuadre (sacudida, entrada de lado), o ""
 *   cadena      filtros que van después del reencuadre («,filtro,filtro»), o ""
 * `i` = intensidad (1 = ritmo rápido). `marca` = color de la marca en RRGGBB (para el flash).
 */
function entrada(tipo, { W, i = 1, marca = "" }) {
  const n = (v, d = 3) => Number(v).toFixed(d);
  const cae = (d) => `max(0,1-t/${d})`; // 1 al empezar → 0 al terminar el efecto
  // Sacudida corta: el encuadre vibra unos píxeles y se detiene. El zoom deja el margen justo para que no se vea el borde.
  const A = Math.round(W * 0.012 * i);
  const sacude = (d) => ({ dx: `${A}*sin(2*PI*t*26)*${cae(d)}`, dy: `${Math.round(A * 0.7)}*cos(2*PI*t*31)*${cae(d)}`, margen: `${n((2.2 * A) / W, 4)}*${cae(d)}` });
  switch (tipo) {
    case "zoom": {
      const s = sacude(0.16);
      // Zoom-punch con desenfoque de movimiento: entra acercado y borroso, y se asienta.
      return { zoomExtra: `${n(0.22 * i)}*pow(${cae(DURA.zoom)},2)+${s.margen}`, dx: s.dx, dy: s.dy, cadena: `,gblur=sigma=${n(9 * i, 1)}:enable='lt(t,0.05)',gblur=sigma=${n(3.5 * i, 1)}:enable='between(t,0.05,0.11)'` };
    }
    case "flash": {
      const s = sacude(0.12);
      const c = /^[0-9a-f]{6}$/i.test(marca) ? marca : "FFFFFF";
      const tinte = (a, desde, hasta) => `,drawbox=x=0:y=0:w=iw:h=ih:color=0x${c}@${a}:t=fill:enable='between(t,${desde},${hasta})'`;
      // Destello del color de la marca (tres pasos que se apagan) sobre un golpe de brillo.
      return { zoomExtra: `${n(0.06 * i)}*${cae(DURA.flash)}+${s.margen}`, dx: s.dx, dy: s.dy, cadena: `,eq=brightness='${n(0.28 * i)}*${cae(DURA.flash)}':eval=frame${tinte(n(Math.min(0.75, 0.6 * i), 2), 0, 0.045)}${tinte(n(Math.min(0.5, 0.34 * i), 2), 0.045, 0.095)}${tinte(n(Math.min(0.25, 0.14 * i), 2), 0.095, DURA.flash)}` };
    }
    case "glitch": {
      const d = Math.max(4, Math.round(W * 0.016 * i));
      return { zoomExtra: `${n(0.03 * i)}*${cae(DURA.glitch)}`, dx: "", dy: "", cadena: `,rgbashift=rh=${d}:bh=${-d}:enable='lt(t,0.07)',rgbashift=rh=${-Math.round(d / 2)}:gh=${Math.round(d / 2)}:enable='between(t,0.07,0.13)',rgbashift=rh=${Math.round(d / 3)}:bh=${-Math.round(d / 3)}:enable='between(t,0.13,${DURA.glitch})'` };
    }
    case "barrido": {
      const s = Math.round(W * 0.06 * i);
      const corre = Math.round(W * 0.07 * i);
      // Whip: entra desde un lado frenando, con desenfoque horizontal fuerte y estela de los cuadros anteriores.
      return {
        zoomExtra: `${n((2.2 * corre) / W, 4)}*pow(${cae(DURA.barrido)},2)`,
        dx: `${-corre}*pow(${cae(DURA.barrido)},2)`,
        dy: "",
        cadena: `,gblur=sigma=${s}:sigmaV=0.6:enable='lt(t,0.06)',gblur=sigma=${Math.round(s / 2.5)}:sigmaV=0.6:enable='between(t,0.06,0.12)',gblur=sigma=${Math.round(s / 6)}:sigmaV=0.6:enable='between(t,0.12,${DURA.barrido})',tmix=frames=3:weights='1 2 3':enable='lt(t,${DURA.barrido})'`,
      };
    }
    default:
      return { zoomExtra: "", dx: "", dy: "", cadena: "" };
  }
}

/** Filtro de la SALIDA de una escena cuando la siguiente entra con barrido: se desenfoca al final. */
function salida(tipoSiguiente, { W, dura, i = 1 }) {
  if (tipoSiguiente !== "barrido") return "";
  const s = Math.round(W * 0.05 * i);
  return `,gblur=sigma=${Math.round(s / 3)}:sigmaV=0.6:enable='between(t,${(dura - 0.12).toFixed(3)},${(dura - 0.06).toFixed(3)})',gblur=sigma=${s}:sigmaV=0.6:enable='gte(t,${(dura - 0.06).toFixed(3)})'`;
}

/**
 * Acelerón («speed-ramp»): la toma entra a más velocidad y enseguida vuelve a la normal; en
 * «muy-rapido» también acelera al salir. Devuelve el filtro setpts (o "" si no aplica) y cuántos
 * segundos de clip de más consume.
 */
function aceleron(ritmo, dura) {
  if (!(ritmo === "rapido" || ritmo === "muy-rapido") || dura < 1.6) return { filtro: "", deMas: 0 };
  const s1 = ritmo === "muy-rapido" ? 2 : 1.7; // velocidad al entrar
  const o1 = 0.28; // segundos del video que dura la entrada acelerada
  const a = o1 * s1; // segundos de clip que consume
  if (ritmo !== "muy-rapido") return { filtro: `setpts='if(lt(T,${a.toFixed(3)}),T/${s1},${o1}+(T-${a.toFixed(3)}))/TB',`, deMas: a - o1 };
  const s2 = 1.6; // y al salir
  const o2 = 0.2;
  const t2 = a + (dura - o1 - o2); // segundo del clip donde empieza a acelerar para salir
  return { filtro: `setpts='if(lt(T,${a.toFixed(3)}),T/${s1},if(lt(T,${t2.toFixed(3)}),${o1}+(T-${a.toFixed(3)}),${(dura - o2).toFixed(3)}+(T-${t2.toFixed(3)})/${s2}))/TB',`, deMas: a - o1 + o2 * (s2 - 1) };
}

/**
 * Golpes visuales dentro de una toma (`escena.golpesVisuales`): en cada marca, un acercamiento brusco
 * (100 → ~115 % en 2 cuadros) que se MANTIENE hasta la marca siguiente, donde vuelve a 100 %. Cada
 * acercamiento ancla en un punto distinto (centro, tercio superior, tercio inferior). Sin fundidos.
 * Devuelve { marcas, zoom, dy }: expresiones en función de `t` para sumar al zoom y al encuadre.
 */
function golpesVisuales(pedidos, { dura, H, fps = 30, fuerza = 0.15, cadaSiFaltan = 0 }) {
  let marcas = (Array.isArray(pedidos) ? pedidos : []).map(Number).filter((g) => Number.isFinite(g));
  // «muy-rapido»: si la escena no trae marcas, una cada ~1,5 s.
  if (!marcas.length && cadaSiFaltan > 0) for (let g = cadaSiFaltan; g < dura - 0.8; g += cadaSiFaltan) marcas.push(Math.round(g * 100) / 100);
  marcas = marcas.filter((g) => g >= 0.4 && g <= dura - 0.4).sort((a, b) => a - b).filter((g, i, l) => i === 0 || g - l[i - 1] >= 0.5);
  if (!marcas.length) return { marcas, zoom: "", dy: "" };
  const sube = (2 / fps).toFixed(3); // 2 cuadros
  const escalon = (g) => `clip((t-${g})/${sube},0,1)`;
  // Marcas impares: entra el acercamiento; pares: vuelve a 100 %.
  const zoom = marcas.map((g, i) => `${i % 2 === 0 ? "+" : "-"}${fuerza}*${escalon(g)}`).join("").replace(/^\+/, "");
  // Ancla de cada acercamiento: centro (0), tercio superior (-1), tercio inferior (+1).
  const anclas = [0, -1, 1];
  const partes = [];
  for (let i = 0, k = 0; i < marcas.length; i += 2, k++) {
    const a = anclas[k % anclas.length];
    if (!a) continue;
    const activo = `(${escalon(marcas[i])}${marcas[i + 1] !== undefined ? `-${escalon(marcas[i + 1])}` : ""})`;
    partes.push(`${Math.round(a * H * fuerza * 0.3)}*${activo}`);
  }
  return { marcas, zoom, dy: partes.join("+") };
}

/**
 * Los golpes (pulsos graves) de una pista de música: segundos donde el bajo sube de golpe.
 * Sirve para llevar los cortes al golpe más cercano. Devuelve { golpes: [s…], dura }.
 */
async function golpesDeMusica(ff, archivo, cwd) {
  const texto = await ff.informe(["-t", "240", "-i", archivo, "-vn", "-af", "aresample=11025,lowpass=f=180,asetnsamples=n=256:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level"], cwd);
  const niveles = [];
  let t = null;
  for (const linea of texto.split(/\r?\n/)) {
    const a = /pts_time:([\d.]+)/.exec(linea);
    if (a) t = Number(a[1]);
    const b = /RMS_level=(-?[\d.]+|-inf)/.exec(linea);
    if (b && t !== null) {
      niveles.push([t, b[1] === "-inf" ? -120 : Number(b[1])]);
      t = null;
    }
  }
  if (niveles.length < 20) return { golpes: [], dura: 0 };
  const maximo = Math.max(...niveles.map((x) => x[1]));
  const golpes = [];
  for (let i = 8; i < niveles.length; i++) {
    const previo = niveles.slice(i - 8, i - 1).reduce((s, x) => s + x[1], 0) / 7; // el nivel de las ~0,16 s anteriores
    const [seg, nivel] = niveles[i];
    // Un golpe: el bajo sube de repente (≥ 7 dB sobre lo que venía), con fuerza, y no pegado al anterior.
    if (nivel - previo >= 7 && nivel >= maximo - 18 && (!golpes.length || seg - golpes[golpes.length - 1] >= 0.22)) golpes.push(Math.round(seg * 1000) / 1000);
  }
  return { golpes, dura: niveles[niveles.length - 1][0] };
}

/** El golpe más cercano a `t` dentro de ±`margen` s (la pista se repite cada `dura` s), o null. */
function golpeCercano(ritmoMusica, t, margen = 0.15) {
  if (!ritmoMusica || !ritmoMusica.golpes.length || !(ritmoMusica.dura > 0)) return null;
  const vuelta = Math.floor(t / ritmoMusica.dura);
  let mejor = null;
  for (const v of [vuelta - 1, vuelta, vuelta + 1]) {
    for (const g of ritmoMusica.golpes) {
      const en = g + v * ritmoMusica.dura;
      if (en > 0 && Math.abs(en - t) <= margen && (mejor === null || Math.abs(en - t) < Math.abs(mejor - t))) mejor = en;
    }
  }
  return mejor;
}

/**
 * Fabrica (una sola vez, en la caché) los dos golpes de sonido. Devuelve { barrido, impacto }
 * con los nombres de archivo. Son ruido filtrado y tonos graves con su envolvente: nada grabado.
 */
async function sonidos(ff, carpeta, conCerrojo, existe) {
  const archivos = { barrido: "fx-barrido-v1.wav", impacto: "fx-impacto-v1.wav" };
  await conCerrojo(archivos.barrido, async () => {
    if (existe(archivos.barrido)) return;
    // Barrido («whoosh»): ruido rosa que sube y baja de volumen mientras se abre el filtro.
    await ff.ffmpeg(["-f", "lavfi", "-i", "anoisesrc=color=pink:duration=0.42:seed=7:amplitude=0.9", "-af", "highpass=f=500,lowpass=f=6000,afade=t=in:st=0:d=0.2:curve=qsin,afade=t=out:st=0.2:d=0.22:curve=qsin,aresample=44100", "-ac", "2", "-c:a", "pcm_s16le", `tmp-${archivos.barrido}`], carpeta);
    fs.renameSync(path.join(carpeta, `tmp-${archivos.barrido}`), path.join(carpeta, archivos.barrido));
  });
  await conCerrojo(archivos.impacto, async () => {
    if (existe(archivos.impacto)) return;
    // Impacto: un golpe grave (tono de 70 → se apaga rápido) con un chasquido corto de ruido encima.
    await ff.ffmpeg(
      ["-f", "lavfi", "-i", "sine=frequency=70:duration=0.38", "-f", "lavfi", "-i", "anoisesrc=color=white:duration=0.05:seed=3:amplitude=0.6", "-filter_complex", "[0:a]volume=6,afade=t=out:st=0.02:d=0.34:curve=exp[g];[1:a]highpass=f=1500,afade=t=out:st=0:d=0.05,apad=whole_dur=0.38[c];[g][c]amix=inputs=2:normalize=0,alimiter=limit=0.9:level=disabled,aresample=44100", "-ac", "2", "-c:a", "pcm_s16le", `tmp-${archivos.impacto}`],
      carpeta,
    );
    fs.renameSync(path.join(carpeta, `tmp-${archivos.impacto}`), path.join(carpeta, archivos.impacto));
  });
  return archivos;
}

module.exports = { TRANSICIONES, RITMOS, DURA, SONIDO, INTENSIDAD, PAUSA_MINIMA, normalizarRitmo, ritmoEn, elegirTransicion, entrada, salida, aceleron, golpesVisuales, golpesDeMusica, golpeCercano, sonidos };
