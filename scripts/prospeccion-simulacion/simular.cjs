"use strict";
/* eslint-disable @typescript-eslint/no-require-imports -- guion de Node, igual que los del servidor */
// Simulación de punta a punta de la prospección automática. No toca nada real:
//
//   · Supabase  → uno de mentira, en memoria (`supabase-falso.cjs`).
//   · CRM       → el código real, con `next dev` apuntando a ese Supabase.
//   · Trabajador→ el código real (`servidor/prospeccion-worker`), con correo y
//                 búsqueda en simulación: nada sale, nada se le paga a nadie.
//   · Gmail     → la bandeja son archivos .eml que esta prueba escribe.
//   · La hoja   → un doble guardado en el Storage de mentira (HOJA_DOBLE=1).
//   · La IA     → apagada (sin clave): todo sale con plantillas.
//
// Recorre cinco días hábiles con el reloj acelerado: búsqueda, envíos con
// calentamiento, un «sí», una pregunta, un rebote, una baja por enlace, una
// respuesta automática, video aprobado → entrega en el mismo hilo,
// seguimiento de la entrega y recordatorios en frío.
//
//   node scripts/prospeccion-simulacion/simular.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { crear } = require("./supabase-falso.cjs");

const RAIZ = path.resolve(__dirname, "..", "..");
const TRABAJADOR = path.join(RAIZ, "servidor", "prospeccion-worker");
// El CRM de la prueba corre desde una COPIA del código (`.sim/`, dentro del repo para que encuentre node_modules):
// así no choca con un `next dev` que alguien tenga abierto en el repo, ni lee el .env.local real.
const COPIA = path.join(RAIZ, ".sim");

function prepararCopia() {
  fs.rmSync(COPIA, { recursive: true, force: true });
  fs.mkdirSync(COPIA, { recursive: true });
  for (const n of ["package.json", "next.config.ts", "tsconfig.json", "postcss.config.mjs", "components.json", "sentry.server.config.ts", "sentry.edge.config.ts"]) {
    if (fs.existsSync(path.join(RAIZ, n))) fs.copyFileSync(path.join(RAIZ, n), path.join(COPIA, n));
  }
  for (const d of ["src", "public"]) fs.cpSync(path.join(RAIZ, d), path.join(COPIA, d), { recursive: true });
  // Que git no la vea aunque la prueba se interrumpa (exclusión local, no toca .gitignore).
  try {
    const excluir = path.join(RAIZ, ".git", "info", "exclude");
    if (!fs.readFileSync(excluir, "utf8").includes(".sim/")) fs.appendFileSync(excluir, `${os.EOL}.sim/${os.EOL}`);
  } catch {
    /* sin carpeta .git no hay nada que excluir */
  }
}
const PUERTO_SB = 54991;
const PUERTO_CRM = 3211;
const CRM = `http://127.0.0.1:${PUERTO_CRM}`;
const URL_PUBLICA = "https://crm.example.test";
const SECRETO = `prueba-${crypto.randomBytes(12).toString("hex")}`;
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), "prospeccion-sim-"));
const AGENDA = "https://agenda.example.test/videos";
const VIDEO = "https://videos.example.test/muestra-tienda-uno.mp4";

const sb = crear({ registro: process.env.SIM_DEPURAR ? path.join(DATOS, "supabase.log") : "" });
const resultados = [];
function ok(nombre, condicion, detalle = "") {
  resultados.push({ nombre, bien: !!condicion });
  console.log(`${condicion ? "  ok  " : "FALLÓ "} ${nombre}${detalle ? ` — ${detalle}` : ""}`);
}
const titulo = (t) => console.log(`\n== ${t} ==`);

async function crm(ruta, cuerpo = {}, ahora) {
  const res = await fetch(`${CRM}/api/servidor/prospeccion/${ruta}`, { method: "POST", headers: { authorization: `Bearer ${SECRETO}`, "content-type": "application/json" }, body: JSON.stringify(ahora ? { ...cuerpo, ahora } : cuerpo) });
  const dato = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${ruta} → ${res.status} ${dato.error || ""}`);
  return dato;
}

function arrancarCrm() {
  const registro = fs.openSync(path.join(DATOS, "crm.log"), "w");
  const hijo = spawn(process.execPath, [path.join(RAIZ, "node_modules", "next", "dist", "bin", "next"), "dev", "-p", String(PUERTO_CRM)], {
    cwd: COPIA,
    stdio: ["ignore", registro, registro],
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${PUERTO_SB}`,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "clave-de-prueba",
      SUPABASE_SERVICE_ROLE_KEY: "clave-de-prueba",
      SERVIDOR_SECRET: SECRETO,
      HOJA_DOBLE: "1",
      NEXT_PUBLIC_URL_CRM: URL_PUBLICA,
      URL_AGENDA_VIDEOS: AGENDA,
      ANTHROPIC_API_KEY: "",
      SENTRY_DSN: "",
      NEXT_PUBLIC_SENTRY_DSN: "",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  });
  return hijo;
}

async function esperarCrm() {
  const hasta = Date.now() + 240_000;
  while (Date.now() < hasta) {
    try {
      await crm("prueba", { accion: "cola" });
      return;
    } catch (e) {
      if (/→ 40[01]/.test(e.message)) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`El CRM no arrancó. Mira ${path.join(DATOS, "crm.log")}`);
}

/** Corre el trabajador real unas vueltas, con el reloj puesto en `ahora` y acelerado. */
function trabajador(ahora, acelerar, ciclos) {
  return new Promise((resolver, rechazar) => {
    const hijo = spawn(process.execPath, ["trabajador.js", "--ciclos", String(ciclos)], {
      cwd: TRABAJADOR,
      stdio: ["ignore", "ignore", "inherit"],
      env: { ...process.env, MODO: "simulacion", MODO_BUSQUEDA: "simulacion", CRM_URL: CRM, SERVIDOR_SECRET: SECRETO, CARPETA_DATOS: DATOS, PRUEBA_AHORA: ahora, PRUEBA_ACELERAR: String(acelerar), GMAIL_VIDEO_USER: "agencia@example.org", NOMBRE_SERVIDOR: "servidor-de-prueba", APIFY_TOKEN: "", META_AD_LIBRARY_TOKEN: "" },
    });
    hijo.on("exit", (codigo) => (codigo === 0 ? resolver() : rechazar(new Error(`el trabajador salió con código ${codigo}`))));
  });
}

/** Lo que el trabajador «envió» (archivos de la simulación), en orden. */
function enviados() {
  const carpeta = path.join(DATOS, "simulacion", "enviados");
  if (!fs.existsSync(carpeta)) return [];
  return fs
    .readdirSync(carpeta)
    .sort()
    .map((n) => {
      const texto = fs.readFileSync(path.join(carpeta, n), "utf8");
      const cab = (k) => (new RegExp(`^${k}: (.*)$`, "m").exec(texto) || [])[1] || "";
      return { archivo: n, para: cab("Para"), asunto: cab("Asunto"), id: cab("Id del CRM"), messageId: cab("Message-ID").replace(/[<>]/g, ""), enRespuestaA: cab("In-Reply-To").replace(/[<>]/g, ""), baja: cab("List-Unsubscribe"), bajaPost: cab("List-Unsubscribe-Post"), cuerpo: texto.slice(texto.indexOf("\n\n") + 2), linea: /-landing-/.test(n) ? "landing" : "video" };
    });
}
const para = (correo) => enviados().filter((e) => e.para === correo);
/** Lo enviado en cada día simulado, para comprobar que nadie recibe dos correos el mismo día. */
const porDia = [];
let yaContados = 0;
function cerrarDia() {
  const todos = enviados();
  porDia.push(todos.slice(yaContados));
  yaContados = todos.length;
}

let nEml = 0;
function llega(nombre, lineas) {
  const carpeta = path.join(DATOS, "simulacion", "bandeja", "video");
  fs.mkdirSync(carpeta, { recursive: true });
  fs.writeFileSync(path.join(carpeta, `${String(++nEml).padStart(3, "0")}-${nombre}.eml`), lineas.join("\r\n") + "\r\n");
}
function respuesta(nombre, de, original, fecha, texto, extra = []) {
  llega(nombre, [`From: ${de}`, "To: agencia@example.org", `Subject: Re: ${original.asunto}`, `Message-ID: <${nombre}-${crypto.randomBytes(4).toString("hex")}@${de.split("@")[1]}>`, `In-Reply-To: <${original.messageId}>`, `References: <${original.messageId}>`, `Date: ${new Date(fecha).toUTCString()}`, ...extra, "Content-Type: text/plain; charset=utf-8", "", texto, "", `El lun, 19 oct 2026, Sebastian Vargas (<agencia@example.org>) escribió:`, "> Hola, equipo."]);
}

const campanas = () => sb.claves("trabajos/prospeccion/campanas/").map((k) => sb.leer(k));
function leads(estado) {
  return sb.claves("trabajos/prospeccion/leads/").filter((k) => k.includes(`/${estado}/`)).map((k) => sb.leer(k));
}
const dia = (n) => `2026-10-${18 + n}`; // día 1 = lunes 19 de octubre de 2026

async function main() {
  await sb.escuchar(PUERTO_SB);
  sb.tablas.users.push({ id: "00000000-0000-4000-8000-000000000001", name: "CEO de prueba", role: "ceo", active: true });
  // La hoja de prospectos de mentira: tres filas trabajadas a mano y una sin correo.
  sb.poner("trabajos/prospeccion/auto/hoja-doble.json", {
    España: [
      ["#ID", "Tienda", "Link tienda", "Plataforma", "producto", "precio", "correo(s)", "Estado", "Fecha", "Notas", "Puntaje", "Nivel", "¿Escribir?", "Falencia", "Evidencia"],
      ["ES-0001", "Vieja Enviada", "https://vieja-uno.example.com", "Shopify", "Cojín lumbar", "25", "hola@vieja-uno.example.com", "Enviado", "14/09/2026", "", "80", "A", "Sí", "Solo imágenes", ""],
      ["ES-0002", "Vieja Rebotada", "https://vieja-dos.example.com", "Shopify", "Taza térmica", "18", "<nadie@vieja-dos.example.com>", "Rebotado", "14/09/2026", "", "70", "B", "Sí", "", ""],
      ["ES-0003", "Vieja Pendiente", "https://vieja-tres.example.com", "Shopify", "Manta polar", "30", "ventas@vieja-tres.example.com", "Pendiente", "", "", "75", "B", "Sí", "Pocos creativos", ""],
      ["ES-0004", "Vieja Sin Correo", "https://vieja-cuatro.example.com", "Shopify", "Lámpara", "40", "", "Pendiente", "", "", "60", "C", "Sí", "", ""],
    ],
  });

  console.log(`Datos de la prueba: ${DATOS}`);
  prepararCopia();
  const servidor = arrancarCrm();
  const cerrar = async () => {
    try {
      servidor.kill();
      // En Windows `next dev` deja un proceso hijo: se cierra el árbol completo.
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      /* ya estaba cerrado */
    }
    // Para depurar: el estado final del Supabase de mentira queda en un archivo.
    fs.writeFileSync(path.join(DATOS, "supabase-final.json"), JSON.stringify({ tablas: sb.tablas, objetos: Object.fromEntries(sb.claves("").map((k) => [k, sb.leer(k)])) }, null, 1));
    await sb.cerrar().catch(() => {});
    // La copia es de usar y botar (se espera un momento a que Windows suelte los archivos).
    await new Promise((r) => setTimeout(r, 2500));
    if (!process.env.SIM_DEPURAR) fs.rmSync(COPIA, { recursive: true, force: true, maxRetries: 5, retryDelay: 800 });
  };
  try {
    console.log("Arrancando el CRM contra el Supabase de mentira (la primera compilación tarda)…");
    await esperarCrm();

    titulo("Preparación: el dueño enciende todo en el panel");
    const quien = { por: "CEO de prueba", porId: "00000000-0000-4000-8000-000000000001", fecha: new Date().toISOString() };
    const c0 = await crm("prueba", { accion: "config", auto: { busqueda: { activa: true, paises: ["ES"], cadaHoras: 6, anunciosPorCorrida: 40, usdPorCorrida: 0.25, usdPorDia: 0.6, usdPorMilAnuncios: 5, puntajeMinimo: 55, soloShopify: true }, envio: { activo: true, nuevosPorDia: 25, seguimientosFrio: 1, autorizadoPor: quien }, entrega: { automatica: true, autorizadoPor: quien }, respuestas: { borradorIA: true }, remitente: { nombre: "Sebastian Vargas", empresa: "Reditus Consulting", direccion: "Calle 1 # 2-3, Bogotá, Colombia", web: "reditusconsulting.org" }, hoja: { id: "hoja-de-prueba-0000000000000000", activa: true } } });
    ok("la configuración se guarda", c0.config.auto.envio.activo && c0.config.auto.busqueda.activa && c0.config.auto.hoja.activa);

    // ------------------------------------------------------------------ día 1
    titulo("Día 1 (lunes) · 09:05 de Madrid: hoja, búsqueda y primeros envíos");
    await trabajador(`${dia(1)}T07:05:00Z`, 90, 280);
    const latido = sb.leer("trabajos/prospeccion/auto/latido.json");
    ok("el trabajador dio latido al CRM", latido && latido.trabajador === "servidor-de-prueba" && latido.modo === "simulacion", latido && `versión ${latido.version}`);
    const b1 = sb.leer(`trabajos/prospeccion/auto/busquedas/${dia(1)}.json`);
    const corrida1 = b1 && b1.corridas[0];
    ok("hubo una búsqueda y quedó cerrada con su costo", corrida1 && corrida1.fin && corrida1.anuncios === 29 && Math.abs(corrida1.usd - 0.145) < 1e-6, corrida1 && `${corrida1.anuncios} anuncios, ${corrida1.usd} USD, ${corrida1.agregados} a la cola, ${corrida1.descartados} descartadas`);
    ok("entraron las 6 tiendas que califican", corrida1 && corrida1.agregados === 6);
    const vistos = sb.claves("trabajos/prospeccion/dominios/").map((k) => sb.leer(k));
    const motivo = (d) => (vistos.find((v) => v.dominio === d) || {}).motivo || "";
    ok("descartó la que no es Shopify, la que no vende en España, la que no tiene correo y la de puntaje bajo", /no es Shopify/.test(motivo("woo-siete.example.com")) && /no vende en España/.test(motivo("tienda-usa.example.com")) && /sin correo/.test(motivo("tienda-seis.example.com")) && /puntaje/.test(motivo("tienda-grande.example.com")), [motivo("woo-siete.example.com"), motivo("tienda-usa.example.com"), motivo("tienda-seis.example.com"), motivo("tienda-grande.example.com")].join(" | "));
    const uno = [...leads("enviados"), ...leads("pendientes")].find((l) => l.correo === "hola@tienda-uno.example.com");
    ok("cada lead trae puntaje, falencia observada y producto estrella", uno && uno.extra && uno.extra.puntaje >= 80 && /ninguno es video/.test(uno.falencia) && uno.producto === "Faja reductora postparto", uno ? JSON.stringify({ extra: uno.extra, falencia: uno.falencia, producto: uno.producto }) : "no se encontró el lead");
    const h1 = sb.leer("trabajos/prospeccion/auto/hoja.json");
    ok("la hoja se sincronizó sin error", h1 && !h1.error && h1.leidas >= 4 && h1.sinCorreo === 1, h1 && `${h1.leidas} filas, ${h1.importadas} al CRM, error: «${h1.error}»`);
    ok("lo trabajado a mano entró como historia (enviado y rebotado), no como pendiente", leads("enviados").some((l) => l.correo === "hola@vieja-uno.example.com" && !l.messageId) && leads("rebotados").some((l) => l.correo === "nadie@vieja-dos.example.com"));
    let e = enviados();
    const d1 = e.map((x) => x.para).sort();
    ok("salieron 7 correos nuevos (6 de la búsqueda + 1 pendiente de la hoja)", e.length === 7 && e.every((x) => x.id.split(".").length === 3), d1.join(", "));
    ok("no se le escribió a lo ya trabajado a mano ni a lo descartado", !d1.some((c) => /vieja-uno|vieja-dos|vieja-cuatro|seis|woo|usa|grande/.test(c)));
    ok("todos llevan el pie legal: remitente, dirección, motivo y baja en un clic", e.every((x) => x.cuerpo.includes("Sebastian Vargas · Reditus Consulting · Calle 1 # 2-3, Bogotá, Colombia · reditusconsulting.org") && x.cuerpo.includes(`baja en un clic: ${URL_PUBLICA}/baja/`) && /Este correo llega porque/.test(x.cuerpo)));
    ok("todos llevan las cabeceras de baja de un clic", e.every((x) => x.baja.startsWith(`<${URL_PUBLICA}/api/baja/`) && x.bajaPost === "List-Unsubscribe=One-Click"));
    ok("cada correo ofrece el video de muestra del producto de esa tienda", /Faja reductora postparto/.test(para("hola@tienda-uno.example.com")[0].cuerpo + para("hola@tienda-uno.example.com")[0].asunto));
    const diario1 = sb.leer(`trabajos/prospeccion/diario/video/${dia(1)}.json`);
    ok("el tope del día cuenta los nuevos (7 de 15 en la semana 1)", diario1 && diario1.n === 7 && diario1.nuevos === 7, JSON.stringify(diario1));

    if (process.env.SIM_DEPURAR === "dia1") return;

    // -------------------------------------------------------- día 1, por la tarde
    titulo("Día 1 · 14:00 de Madrid: llegan respuestas");
    const tarde = `${dia(1)}T12:00:00Z`;
    respuesta("si", "hola@tienda-uno.example.com", para("hola@tienda-uno.example.com")[0], tarde, "Sí, me interesa. Envíenlo por favor.");
    respuesta("pregunta", "contacto@tienda-dos.example.com", para("contacto@tienda-dos.example.com")[0], tarde, "Hola, ¿cuánto cuesta después y de dónde sacaron mi correo?");
    respuesta("ausente", "luis@tienda-cinco.example.com", para("luis@tienda-cinco.example.com")[0], tarde, "Estoy fuera de la oficina hasta el lunes.", ["Auto-Submitted: auto-replied"]);
    // Dos respuestas que ninguna regla entiende (y sin IA): quedan «por revisar» para una persona.
    respuesta("socio", "equipo@tienda-diez.example.com", para("equipo@tienda-diez.example.com")[0], tarde, "Gracias, lo comento con mi socio y os digo.");
    respuesta("temporada", "ventas@vieja-tres.example.com", para("ventas@vieja-tres.example.com")[0], tarde, "Ahora mismo estamos cerrando temporada, quizá más adelante.");
    const rebotado = para("nadie@tienda-tres.example.com")[0];
    llega("rebote", ["From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "To: agencia@example.org", "Subject: Delivery Status Notification (Failure)", "Message-ID: <dsn-prueba@mx.google.com>", `In-Reply-To: <${rebotado.messageId}>`, `References: <${rebotado.messageId}>`, "X-Failed-Recipients: nadie@tienda-tres.example.com", `Date: ${new Date(tarde).toUTCString()}`, 'Content-Type: multipart/report; boundary="b1"; report-type=delivery-status', "", "--b1", "Content-Type: text/plain; charset=utf-8", "", "Address not found: nadie@tienda-tres.example.com", "", "--b1", "Content-Type: message/delivery-status", "", "Final-Recipient: rfc822; nadie@tienda-tres.example.com", "Action: failed", "Status: 5.1.1", "Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.", "", "--b1--"]);
    // La baja por enlace: lo que haría el botón «Cancelar suscripción» del correo de quien recibe.
    const enlaceBaja = para("info@tienda-cuatro.example.com")[0].baja.split(">")[0].slice(1).replace(URL_PUBLICA, CRM);
    // La página que abre quien pulsa el enlace del pie (pública, sin sesión): debe mostrar el botón, sin dar de baja por solo abrirla.
    const pagina = await fetch(enlaceBaja.replace("/api/baja/", "/baja/"));
    const html = await pagina.text();
    ok("la página de baja abre sin sesión y muestra el botón", pagina.ok && html.includes("Darme de baja") && html.includes("in…@tienda-cuatro.example.com"), `HTTP ${pagina.status}`);
    ok("abrir la página no da de baja a nadie (solo el botón)", !leads("bajas").some((l) => l.correo === "info@tienda-cuatro.example.com"));
    const rb = await fetch(enlaceBaja, { method: "POST" });
    ok("la baja de un clic responde bien", rb.ok);
    const malo = await fetch(`${CRM}/api/baja/${Buffer.from("otra@persona.example.com").toString("base64url")}.firma-inventada-000000`, { method: "POST" });
    ok("un enlace de baja con la firma inventada no da de baja a nadie", malo.status === 404);
    await trabajador(tarde, 60, 14);

    const prospecto = sb.tablas.prospectos.find((p) => p.nombre === "Tienda Uno");
    ok("el «sí» creó el prospecto (candidato a video) con el texto exacto", prospecto && prospecto.respuestas_calificacion.prospeccion.etapa === "falta_enviar_video" && /Sí, me interesa/.test(prospecto.respuestas_calificacion.prospeccion.respuesta) && prospecto.email === "hola@tienda-uno.example.com");
    let cola = (await crm("prueba", { accion: "cola" })).cola;
    const pregunta = cola.find((c) => c.de === "contacto@tienda-dos.example.com");
    ok("la pregunta quedó en la cola con un borrador y NO se respondió sola", pregunta && pregunta.motivo === "pregunta" && /\[COMPLETAR/.test(pregunta.borrador) && para("contacto@tienda-dos.example.com").length === 1, pregunta && `borrador con ${pregunta.borradorCon}`);
    ok("el rebote suprimió la dirección", leads("rebotados").some((l) => l.correo === "nadie@tienda-tres.example.com"));
    ok("la baja movió el lead y bloqueó la dirección", leads("bajas").some((l) => l.correo === "info@tienda-cuatro.example.com"));
    ok("la respuesta automática no cambió el estado del lead", leads("enviados").some((l) => l.correo === "luis@tienda-cinco.example.com" && /automática/.test(l.nota)));

    const porRevisar = cola.filter((c) => c.motivo === "por_revisar");
    ok("lo que no se entiende queda «por revisar», sin borrador y sin respuesta", porRevisar.length === 2 && porRevisar.every((c) => !c.borrador));
    const esSi = await crm("prueba", { accion: "resolver", id: porRevisar.find((c) => c.de === "equipo@tienda-diez.example.com").id, decision: { tipo: "es_si" } }, tarde);
    ok("una persona decide «es un sí»: pasa a candidato a video", !esSi.error && sb.tablas.prospectos.some((p) => p.nombre === "Deporte Diez"), esSi.error || esSi.aviso);
    const esNo = await crm("prueba", { accion: "resolver", id: porRevisar.find((c) => c.de === "ventas@vieja-tres.example.com").id, decision: { tipo: "no_interesado" } }, tarde);
    ok("una persona decide «no le interesa»: no se le escribe más", !esNo.error && leads("bajas").some((l) => l.correo === "ventas@vieja-tres.example.com"), esNo.error);

    const sinLlenar = await crm("prueba", { accion: "resolver", id: pregunta.id, decision: { tipo: "aprobar", texto: pregunta.borrador } }, tarde);
    ok("un borrador con «[COMPLETAR…]» sin llenar no se deja aprobar", /COMPLETAR/.test(sinLlenar.error || ""));
    const textoAprobado = "Hola.\n\nGracias por responder. El video de muestra es gratis y sin compromiso; tu correo lo tomamos de la página pública de la tienda. Si después quieres más videos, lo vemos en una llamada corta.\n\n¿Lo preparo?\n\nSebastian Vargas · Reditus Consulting";
    const aprobado = await crm("prueba", { accion: "resolver", id: pregunta.id, decision: { tipo: "aprobar", texto: textoAprobado } }, tarde);
    ok("una persona edita y aprueba la respuesta", !aprobado.error);

    cerrarDia();

    // ------------------------------------------------------------------ día 2
    titulo("Día 2 (martes): respuesta aprobada, video aprobado → entrega, segunda búsqueda");
    // Una persona aprobó el video del prospecto en Creativos (aquí se siembra ese resultado).
    const guionId = crypto.randomUUID();
    const aprobacion = { porId: "00000000-0000-4000-8000-000000000002", por: "Directora de prueba", fecha: `${dia(2)}T06:00:00Z` };
    sb.poner(`trabajos/videos-prospectos/${prospecto.id}.json`, { prospectoId: prospecto.id, etapa: "lanzado", guionId, producto: "Faja reductora postparto", datos: { analisisProducto: "Madres recientes que buscan soporte lumbar." }, decididoPor: "CEO de prueba", decididoPorId: quien.porId, decididoAt: `${dia(1)}T20:00:00Z` });
    sb.poner(`chat-files/videos/${guionId}.json`, { id: guionId, prospectoId: prospecto.id, producto: "Faja reductora postparto", formatoNombre: "UGC", guion: "Guion de prueba", origen: "ia", versiones: [{ n: 1, guion: "Guion de prueba", origen: "ia", videoUrl: VIDEO, videoAprobado: aprobacion, fecha: aprobacion.fecha }], creadoAt: aprobacion.fecha, actualizadoAt: aprobacion.fecha });
    const antes2 = enviados().length;
    await trabajador(`${dia(2)}T07:10:00Z`, 90, 220);
    e = enviados().slice(antes2);
    const resp = e.find((x) => x.id.startsWith("r."));
    ok("la respuesta aprobada salió en el mismo hilo, con el pie legal", resp && resp.para === "contacto@tienda-dos.example.com" && /^Re: /.test(resp.asunto) && resp.enRespuestaA.startsWith("pregunta-") && resp.cuerpo.includes("lo tomamos de la página pública") && resp.cuerpo.includes("baja en un clic"));
    const entrega = e.find((x) => x.id === `p.${prospecto.id}.entrega`);
    ok("el video aprobado se entregó en el mismo hilo", entrega && entrega.para === "hola@tienda-uno.example.com" && /^Re: /.test(entrega.asunto) && entrega.enRespuestaA.startsWith("si-"), entrega && entrega.asunto);
    ok("la entrega lleva el enlace del video, el análisis resumido y el enlace de agenda configurado", entrega && entrega.cuerpo.includes(VIDEO) && entrega.cuerpo.includes(AGENDA) && /Elegimos Faja reductora postparto porque es el producto que más están moviendo en sus anuncios/.test(entrega.cuerpo) && /formato «UGC»/.test(entrega.cuerpo));
    const p2 = sb.tablas.prospectos.find((p) => p.id === prospecto.id).respuestas_calificacion;
    ok("el prospecto pasó a «Video enviado» y quedó anotado quién aprobó", p2.prospeccion.etapa === "video_enviado" && /Directora de prueba/.test(p2.correos.aprobado.por) && p2.correos.seguimientos.estado === "activos");
    const b2 = sb.leer(`trabajos/prospeccion/auto/busquedas/${dia(2)}.json`);
    ok("la segunda búsqueda no repitió la tienda ya conocida (entraron 2 nuevas)", b2 && b2.corridas.length === 1 && b2.corridas[0].agregados === 2, b2 && JSON.stringify({ anuncios: b2.corridas[0].anuncios, agregados: b2.corridas[0].agregados }));
    ok("salieron los 2 correos nuevos del día (4 correos en total)", e.length === 4 && e.filter((x) => x.id.startsWith("c.")).length === 2, e.map((x) => `${x.id.slice(0, 1)}→${x.para}`).join(", "));
    const diario2 = sb.leer(`trabajos/prospeccion/diario/video/${dia(2)}.json`);
    ok("la entrega y la respuesta cuentan en el tope de la cuenta, no en el de «nuevos»", diario2 && diario2.n === 4 && diario2.nuevos === 2, JSON.stringify(diario2));

    cerrarDia();

    // ------------------------------------------------------------------ día 3
    titulo("Día 3 (miércoles): topes de costo y pausa total");
    const antes3 = enviados().length;
    await trabajador(`${dia(3)}T07:10:00Z`, 90, 50);
    ok("sin tiendas nuevas no sale nada, y nada va a quien rebotó o se dio de baja", enviados().length === antes3);
    await crm("prueba", { accion: "config", auto: { busqueda: { ...c0.config.auto.busqueda, usdPorDia: 0.01 } } });
    const sinPlata = await crm("busqueda/permiso", {}, `${dia(3)}T14:30:00Z`);
    ok("con el tope diario de costo agotado no se permite otra búsqueda", sinPlata.permitido === false && /tope de costo/.test(sinPlata.motivo), sinPlata.motivo);
    await crm("prueba", { accion: "config", auto: { busqueda: c0.config.auto.busqueda } });
    const muyPronto = await crm("busqueda/permiso", {}, `${dia(3)}T09:00:00Z`);
    ok("antes de las 6 horas tampoco se permite", muyPronto.permitido === false && /menos de 6 h/.test(muyPronto.motivo), muyPronto.motivo);
    await crm("prueba", { accion: "config", auto: {}, pausaGeneral: true });
    const enPausa = await crm("campanas/siguientes", { linea: "video" }, `${dia(3)}T10:00:00Z`);
    const busquedaEnPausa = await crm("busqueda/permiso", {}, `${dia(3)}T15:00:00Z`);
    ok("la pausa total frena envíos y búsquedas", enPausa.motivo === "pausa total" && !enPausa.envios.length && busquedaEnPausa.motivo === "pausa total");
    await crm("prueba", { accion: "config", auto: {}, pausaGeneral: false });

    cerrarDia();

    // ------------------------------------------------------------------ día 4
    titulo("Día 4 (jueves): seguimiento de la entrega (día 2 después de entregar)");
    const antes4 = enviados().length;
    await trabajador(`${dia(4)}T07:10:00Z`, 90, 60);
    e = enviados().slice(antes4);
    ok("salió el seguimiento 1 al que recibió el video, con el enlace otra vez", e.length === 1 && e[0].id === `p.${prospecto.id}.seguimiento_1` && e[0].cuerpo.includes(VIDEO) && e[0].cuerpo.includes("baja en un clic"), e.map((x) => x.id).join(", "));

    cerrarDia();

    // ------------------------------------------------------------------ día 5
    titulo("Día 5 (viernes): recordatorios a quien no respondió el primer correo (día 4)");
    const antes5 = enviados().length;
    await trabajador(`${dia(5)}T07:10:00Z`, 90, 120);
    e = enviados().slice(antes5);
    const recordados = e.filter((x) => /\.s1$/.test(x.id)).map((x) => x.para).sort();
    ok("recordatorio solo a quien no respondió (ni al sí, ni a las preguntas, ni al rebote, ni a las bajas)", recordados.join(",") === "luis@tienda-cinco.example.com", recordados.join(", "));
    ok("los recordatorios van en el mismo hilo y con pie legal", e.filter((x) => /\.s1$/.test(x.id)).every((x) => /^Re: /.test(x.asunto) && x.enRespuestaA && x.cuerpo.includes("baja en un clic")));
    const todos = enviados();
    cerrarDia();
    ok("en toda la simulación nadie recibió dos correos el mismo día", porDia.every((d) => new Set(d.map((x) => x.para)).size === d.length), porDia.map((d, i) => `día ${i + 1}: ${d.length}`).join(" · "));
    ok("a la dirección que rebotó y a la que se dio de baja solo les llegó el primer correo", para("nadie@tienda-tres.example.com").length === 1 && para("info@tienda-cuatro.example.com").length === 1);
    ok("la cuenta de landing (sin campañas) no envió nada", todos.every((x) => x.linea === "video"));

    // ------------------------------------------------------------- hoja y panel
    titulo("Cierre: la hoja y el panel");
    const h = await crm("prueba", { accion: "hoja" }, `${dia(5)}T16:00:00Z`);
    const hoja = sb.leer("trabajos/prospeccion/auto/hoja-doble.json").España;
    const fila = (texto) => hoja.find((f) => f.some((c) => String(c).includes(texto))) || [];
    const estado = (texto) => fila(texto)[7];
    ok("la hoja quedó sin error", !h.error, h.error);
    ok("el CRM escribió el estado en la fila que estaba pendiente", estado("vieja-tres.example.com") === "No interesado" && fila("vieja-tres.example.com")[8] !== "", `${estado("vieja-tres.example.com")} · ${fila("vieja-tres.example.com")[8]}`);
    ok("las tiendas halladas se agregaron a la hoja con #ID consecutivo", hoja.length === 5 + 8 && fila("tienda-uno.example.com")[0] === "ES-0005" && new Set(hoja.slice(1).map((f) => f[0])).size === hoja.length - 1, hoja.slice(5).map((f) => `${f[0]} ${f[1]}: ${f[7]}`).join(" · "));
    ok("los estados de la hoja son los del CRM", estado("tienda-uno.example.com") === "Video entregado" && estado("tienda-dos.example.com") === "Pregunta" && estado("tienda-tres.example.com") === "Rebotado" && estado("tienda-cuatro.example.com") === "No interesado" && estado("tienda-cinco.example.com") === "Enviado" && estado("tienda-diez.example.com") === "Respondió SÍ");
    ok("no tocó las filas que ya decían lo mismo", estado("vieja-uno.example.com") === "Enviado" && fila("vieja-uno.example.com")[8] === "14/09/2026" && estado("vieja-dos.example.com") === "Rebotado");
    const { panel } = await crm("prueba", { accion: "panel" }, `${dia(2)}T20:00:00Z`);
    ok("el embudo del día 2 cuadra", panel.embudo.hoy.encontrados === 2 && panel.embudo.hoy.enviados === 2 && panel.embudo.hoy.entregados === 1 && panel.embudo.ayer.encontrados === 6 && panel.embudo.ayer.enviados === 7 && panel.embudo.ayer.respuestas === 4 && panel.embudo.ayer.aceptados === 2 && panel.embudo.ayer.preguntas === 1 && panel.embudo.ayer.rebotes === 1, `hoy ${JSON.stringify(panel.embudo.hoy)} · ayer ${JSON.stringify(panel.embudo.ayer)}`);
    const embudoReal = sb.claves("trabajos/prospeccion/embudo/").map((k) => sb.leer(k)).reduce((n, x) => n + (x.bajas || 0), 0);
    ok("las dos bajas (la del enlace y la que marcó una persona) quedaron contadas una vez cada una", embudoReal === 2, `bajas contadas: ${embudoReal}`);
    // El compilador de Next (Turbopack) a veces da por cierta una condición y la borra: se revisa que no lo haya hecho en la prospección.
    const plegadas = [];
    const chunks = path.join(COPIA, ".next", "dev", "server", "chunks");
    for (const n of fs.existsSync(chunks) ? fs.readdirSync(chunks) : []) {
      if (!n.endsWith(".js") || n.startsWith("node_modules")) continue;
      const lineas = fs.readFileSync(path.join(chunks, n), "utf8").split("\n");
      lineas.forEach((l, k) => {
        // Las que dependen de variables de entorno son correctas; el fallo es cuando lo que se «da por cierto» viene de un `await`.
        if (/TURBOPACK compile-time (truthy|falsy)/.test(l) && /\bawait\b/.test(lineas[k - 1] || "")) plegadas.push(`${(lineas[k - 1] || "").trim().slice(0, 90)} ⇒ ${l.trim().slice(0, 70)}`);
      });
    }
    ok("el compilador no borró ninguna condición sobre un dato leído (fallo de Turbopack ya visto en buscarLead)", plegadas.length === 0, plegadas.slice(0, 4).join(" || "));
    ok("el panel avisa lo que falta (simulación, IA apagada)", panel.avisos.some((a) => /SIMULACIÓN|sin señal|no da señal/i.test(a)) && panel.avisos.some((a) => /IA no está activa/.test(a)), `${panel.avisos.length} avisos`);
    ok("las campañas automáticas quedaron activas y autorizadas por quien encendió el envío", campanas().length === 1 && campanas()[0].auto.pais === "ES" && campanas()[0].estado === "activa" && campanas()[0].activada.por === "CEO de prueba");
  } finally {
    await cerrar();
  }

  const mal = resultados.filter((r) => !r.bien);
  console.log(`\n${resultados.length - mal.length} de ${resultados.length} comprobaciones pasaron.${mal.length ? ` FALLARON: ${mal.map((r) => r.nombre).join(" · ")}` : ""}`);
  console.log(`Correos «enviados» en la simulación (ninguno salió): ${path.join(DATOS, "simulacion", "enviados")}`);
  process.exit(mal.length ? 1 : 0);
}

main().catch((e) => {
  console.error(`\nLa simulación se cayó: ${e.stack || e.message}\nRegistro del CRM: ${path.join(DATOS, "crm.log")}`);
  process.exit(1);
});
