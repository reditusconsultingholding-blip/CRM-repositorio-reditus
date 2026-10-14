"use strict";
// Pruebas locales del trabajador de prospección. No tocan el CRM ni Gmail:
// comprueban que cada tipo de mensaje de la bandeja se reconoce bien y que
// el envío simulado escribe en disco sin abrir conexiones.
//
//   node pruebas/pruebas.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");
const { analizar } = require("../lib/analizar");
const { noSalio } = require("../lib/correo");
const { tapar } = require("../lib/registro");

const PROPIA = "cuenta@example.org";

const RESPUESTA = `From: Ana Perez <ana@tienda-uno.example.com>
To: ${PROPIA}
Subject: Re: Un video de muestra para Faja
Message-ID: <resp-1@tienda-uno.example.com>
In-Reply-To: <orig-1@example.org>
References: <orig-1@example.org>
Date: Mon, 12 Oct 2026 15:04:00 +0000
Content-Type: text/plain; charset=utf-8

Sí, me interesa. Envíenlo por favor.

El lun, 12 oct 2026 a las 9:30, Sebastian Vargas (<${PROPIA}>) escribió:
> Hola, equipo de Tienda Uno.
`;

const REBOTE = `From: Mail Delivery Subsystem <mailer-daemon@googlemail.com>
To: ${PROPIA}
Subject: Delivery Status Notification (Failure)
Message-ID: <dsn-1@mx.google.com>
In-Reply-To: <orig-2@example.org>
References: <orig-2@example.org>
X-Failed-Recipients: nadie@tienda-dos.example.com
Date: Mon, 12 Oct 2026 15:05:00 +0000
Content-Type: multipart/report; boundary="b1"; report-type=delivery-status

--b1
Content-Type: text/plain; charset=utf-8

Address not found. Your message wasn't delivered to nadie@tienda-dos.example.com because the address couldn't be found.

--b1
Content-Type: message/delivery-status

Reporting-MTA: dns; googlemail.com

Final-Recipient: rfc822; nadie@tienda-dos.example.com
Action: failed
Status: 5.1.1
Diagnostic-Code: smtp; 550-5.1.1 The email account that you tried to reach does not exist.

--b1
Content-Type: message/rfc822

From: ${PROPIA}
To: nadie@tienda-dos.example.com
Subject: Un video de muestra
Message-ID: <orig-2@example.org>

Hola.
--b1--
`;

const RETRASO = REBOTE.replace("Action: failed", "Action: delayed").replace("Status: 5.1.1", "Status: 4.4.1").replace("(Failure)", "(Delay)").replace("dsn-1", "dsn-2");

const AUSENTE = `From: Luis <luis@tienda-tres.example.com>
To: ${PROPIA}
Subject: Respuesta automática: Un video de muestra
Message-ID: <auto-1@tienda-tres.example.com>
Auto-Submitted: auto-replied
Date: Mon, 12 Oct 2026 15:06:00 +0000
Content-Type: text/plain; charset=utf-8

Estoy fuera de la oficina hasta el lunes.
`;

const BOLETIN = `From: Ofertas <news@boletin.example.com>
To: ${PROPIA}
Subject: 50% de descuento
Message-ID: <n-1@boletin.example.com>
List-Unsubscribe: <mailto:baja@boletin.example.com>
Content-Type: text/plain; charset=utf-8

Compra ya.
`;

const crlf = (s) => s.replace(/\r?\n/g, "\r\n");

(async () => {
  let a = await analizar(Buffer.from(crlf(RESPUESTA)), PROPIA);
  assert.strictEqual(a.tipo, "respuesta");
  assert.strictEqual(a.cuerpo.de, "ana@tienda-uno.example.com");
  assert.strictEqual(a.cuerpo.automatica, false);
  assert.ok(a.cuerpo.texto.startsWith("Sí, me interesa"));
  assert.ok(String(a.cuerpo.enRespuestaA).includes("orig-1@example.org"));
  console.log("ok  respuesta de una persona");

  a = await analizar(Buffer.from(crlf(REBOTE)), PROPIA);
  assert.strictEqual(a.tipo, "rebote");
  assert.strictEqual(a.cuerpo.destinatario, "nadie@tienda-dos.example.com");
  assert.strictEqual(a.cuerpo.permanente, true);
  assert.ok(a.cuerpo.messageIdOriginal.includes("orig-2@example.org"));
  assert.ok(/5\.1\.1/.test(a.cuerpo.diagnostico));
  console.log("ok  rebote permanente (DSN de Gmail)");

  a = await analizar(Buffer.from(crlf(RETRASO)), PROPIA);
  assert.strictEqual(a.tipo, "rebote");
  assert.strictEqual(a.cuerpo.permanente, false);
  console.log("ok  aviso de retraso: no se trata como rebote permanente");

  a = await analizar(Buffer.from(crlf(AUSENTE)), PROPIA);
  assert.strictEqual(a.tipo, "respuesta");
  assert.strictEqual(a.cuerpo.automatica, true);
  console.log("ok  respuesta automática");

  a = await analizar(Buffer.from(crlf(BOLETIN)), PROPIA);
  assert.strictEqual(a.tipo, "ignorar");
  console.log("ok  boletín ignorado");

  a = await analizar(Buffer.from(crlf(RESPUESTA.replace("Ana Perez <ana@tienda-uno.example.com>", PROPIA))), PROPIA);
  assert.strictEqual(a.tipo, "ignorar");
  console.log("ok  correo propio ignorado");

  assert.strictEqual(noSalio({ code: "EAUTH" }), true);
  assert.strictEqual(noSalio({ responseCode: 550, command: "RCPT TO" }), true);
  assert.strictEqual(noSalio({ code: "ETIMEDOUT", command: "DATA" }), false);
  assert.strictEqual(noSalio(new Error("corte")), false);
  console.log("ok  un corte a mitad del envío se trata como incierto, no como fallo");

  assert.strictEqual(tapar("ana.perez@tienda.com"), "a***@tienda.com");
  console.log("ok  las direcciones salen tapadas en el registro");

  // Envío simulado: escribe en disco y no abre conexiones.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "prospeccion-prueba-"));
  process.env.CARPETA_DATOS = tmp;
  process.env.MODO = "simulacion";
  const { cargar } = require("../lib/entorno");
  const cfg = cargar();
  const correo = require("../lib/correo").crearCorreo(cfg, console);
  const r = await correo.enviar("video", { id: "c.x.y", paso: "inicial", para: "ana@tienda-uno.example.com", asunto: "Prueba", cuerpo: "Hola", enRespuestaA: null, referencias: [] });
  assert.ok(r.messageId.endsWith("@simulacion.local"));
  const escritos = fs.readdirSync(path.join(tmp, "simulacion", "enviados"));
  assert.strictEqual(escritos.length, 1);
  assert.ok(fs.readFileSync(path.join(tmp, "simulacion", "enviados", escritos[0]), "utf8").includes("NO se envió"));
  fs.writeFileSync(path.join(tmp, "simulacion", "bandeja", "video", "1.eml"), crlf(RESPUESTA));
  const leido = await correo.leerNuevos("video", null);
  assert.strictEqual(leido.mensajes.length, 1);
  assert.strictEqual((await correo.leerNuevos("video", leido.marca)).mensajes.length, 0);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("ok  envío y bandeja simulados (nada sale, nada se repite)");

  // ---- baja de un clic ----
  const { cabecerasDeBaja } = require("../lib/correo");
  const conEnlace = cabecerasDeBaja({ bajaUrl: "https://crm.example.org/api/baja/abc.def" }, PROPIA);
  assert.strictEqual(conEnlace["List-Unsubscribe"], `<https://crm.example.org/api/baja/abc.def>, <mailto:${PROPIA}?subject=no>`);
  assert.strictEqual(conEnlace["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  assert.deepStrictEqual(Object.keys(cabecerasDeBaja({ bajaUrl: null }, PROPIA)), ["List-Unsubscribe"]);
  assert.deepStrictEqual(Object.keys(cabecerasDeBaja({ bajaUrl: "http://sin-candado.example.org/x" }, PROPIA)), ["List-Unsubscribe"]);
  console.log("ok  cabeceras de baja de un clic (y sin enlace seguro, solo la de correo)");

  // ---- búsqueda: anuncios → tiendas ----
  const { dominioDe, traducirApify, agrupar, buscar, fuenteDe } = require("../lib/buscar");
  assert.deepStrictEqual(dominioDe("https://www.Tienda-Uno.example.com/products/faja-reductora?utm=1"), { dominio: "tienda-uno.example.com", handle: "faja-reductora" });
  assert.strictEqual(dominioDe("https://l.facebook.com/l.php?u=https%3A%2F%2Ftienda-dos.example.com%2F").dominio, "tienda-dos.example.com");
  for (const no of ["https://www.instagram.com/tienda", "https://wa.me/34600000000", "https://tienda.myshopify.com/", "https://www.amazon.es/dp/1", "no es un enlace"]) assert.strictEqual(dominioDe(no), null);
  console.log("ok  del enlace del anuncio sale la tienda (y se descartan redes, WhatsApp y mercados)");

  const anuncio = traducirApify({ pageName: "Tienda Uno", pageID: "123456", collationCount: 4, startDate: Math.floor(Date.now() / 1000) - 20 * 86400, snapshot: { link_url: "https://tienda-uno.example.com/products/faja", videos: [], cards: [{ video_hd_url: "https://v.example.com/a.mp4" }] } });
  assert.strictEqual(anuncio.dominio, "tienda-uno.example.com");
  assert.strictEqual(anuncio.video, true);
  assert.strictEqual(anuncio.copias, 4);
  assert.ok(anuncio.dias === 20 || anuncio.dias === 19);
  assert.strictEqual(traducirApify({ pageName: "Sin enlace", snapshot: {} }), null);
  const grupos = agrupar([anuncio, { ...anuncio, video: false, dias: 3, copias: 1, handle: "otra" }, { ...anuncio, dominio: "b.example.com", video: false, paginaId: "" }], "ES");
  assert.strictEqual(grupos.length, 2);
  assert.deepStrictEqual([grupos[0].anuncios, grupos[0].anunciosVideo, grupos[0].diasAnuncioMasNuevo, grupos[0].duplicadosMax, grupos[0].handle], [2, 1, 3, 4, "faja"]);
  assert.ok(grupos[0].adsLibrary.includes("view_all_page_id=123456") && grupos[0].adsLibrary.includes("country=ES"));
  assert.strictEqual(grupos[1].adsLibrary, "");
  console.log("ok  los anuncios se agrupan por tienda: cuántos, cuántos en video, antigüedad y producto que más empujan");

  // ---- lectura de la tienda ----
  const { correosDe, esDelPais, crearLector } = require("../lib/tienda");
  assert.deepStrictEqual(correosDe('<a href="mailto:Hola@Tienda.es">x</a> correo@tutienda.com logo@2x.png noreply@tienda.es ventas@gmail.com soporte@shopify.com', "tienda.es"), ["hola@tienda.es", "ventas@gmail.com"]);
  assert.strictEqual(esDelPais("ES", { dominio: "tienda.com", moneda: "EUR", idioma: "es", texto: "" }), true);
  assert.strictEqual(esDelPais("ES", { dominio: "tienda.com", moneda: "USD", idioma: "es", texto: "Envíos a España" }), false);
  assert.strictEqual(esDelPais("ES", { dominio: "tienda.com", moneda: "EUR", idioma: "fr", texto: "Livraison en France" }), false);
  assert.strictEqual(esDelPais("MX", { dominio: "tienda.com", moneda: "MXN", idioma: "es", texto: "" }), true);
  console.log("ok  correos: se quedan los reales (primero el del dominio) y el país se decide por la moneda");

  process.env.MODO_BUSQUEDA = "simulacion";
  process.env.CRM_URL = "http://127.0.0.1:1";
  process.env.SERVIDOR_SECRET = "prueba-local";
  const cfgB = cargar();
  assert.strictEqual(fuenteDe(cfgB, "ES").nombre, "simulacion");
  assert.ok(/falta APIFY_TOKEN/.test(fuenteDe({ ...cfgB, busqueda: "real", apify: { token: "" }, meta: { token: "" } }, "ES").motivo));
  assert.ok(/solo sirve para España/.test(fuenteDe({ ...cfgB, busqueda: "real", apify: { token: "" }, meta: { token: "x".repeat(20) } }, "MX").motivo));
  assert.strictEqual(fuenteDe({ ...cfgB, busqueda: "real", apify: { token: "y".repeat(20) }, meta: { token: "x".repeat(20) } }, "ES").nombre, "meta");
  const callado = { info() {}, aviso() {}, error() {} };
  const crmDeMentira = { dominiosNuevos: async (d) => d.filter((x) => x !== "tienda-dos.example.com") };
  const corrida = { id: "x", pais: "ES", palabras: ["pago contra reembolso", "contrareembolso", "envío gratis", "envío 24/48h"], anunciosMax: 40, porPalabra: 10, soloShopify: true };
  const hallado = await buscar(corrida, cfgB, crmDeMentira, callado);
  assert.strictEqual(hallado.fuente, "simulacion");
  assert.ok(hallado.anuncios <= corrida.anunciosMax, "nunca se leen más anuncios que el tope de la corrida");
  const dominios = hallado.hallazgos.map((h) => h.dominio).sort();
  assert.deepStrictEqual(dominios, ["tienda-cinco.example.com", "tienda-cuatro.example.com", "tienda-diez.example.com", "tienda-grande.example.com", "tienda-tres.example.com", "tienda-uno.example.com"]);
  const uno = hallado.hallazgos.find((h) => h.dominio === "tienda-uno.example.com");
  assert.deepStrictEqual([uno.tienda, uno.plataforma, uno.correo, uno.producto, uno.precio, uno.anuncios, uno.anunciosVideo, uno.instagram], ["Tienda Uno", "shopify", "hola@tienda-uno.example.com", "Faja reductora postparto", "29.90 €", 3, 0, "@tiendauno"]);
  assert.strictEqual(hallado.hallazgos.find((h) => h.dominio === "tienda-diez.example.com").correo, "equipo@tienda-diez.example.com", "el correo que solo está en la página de contacto también se encuentra");
  const motivos = Object.fromEntries(hallado.vistos.map((v) => [v.dominio, v.motivo]));
  assert.ok(/no es Shopify/.test(motivos["woo-siete.example.com"]) && /no vende en España/.test(motivos["tienda-usa.example.com"]) && /sin correo/.test(motivos["tienda-seis.example.com"]));
  assert.ok(!dominios.includes("tienda-dos.example.com") && !motivos["tienda-dos.example.com"], "lo que el CRM ya conoce ni se analiza");
  const corta = await buscar({ ...corrida, anunciosMax: 12, porPalabra: 10 }, cfgB, crmDeMentira, callado);
  assert.ok(corta.anuncios <= 12);
  console.log("ok  búsqueda simulada completa: respeta el tope de anuncios, no repite lo conocido y explica cada descarte");

  // Shopify devuelve 429: se espera y se reintenta una vez; una tienda caída no tumba la corrida.
  let intentos = 0;
  const lector = crearLector({
    pausaMs: 0,
    permitirEjemplo: true,
    fetch: async (url) => {
      const u = new URL(url);
      if (u.hostname === "caida.example.com") throw new Error("sin conexión");
      if (u.pathname === "/products.json" && intentos++ === 0) return { ok: false, status: 429, headers: { get: () => "0" }, text: async () => "" };
      const cuerpo = u.pathname === "/products.json" ? JSON.stringify({ products: [{ handle: "a", title: "Producto A", created_at: new Date().toISOString(), variants: [{ price: "10.00" }] }] }) : u.pathname === "/" ? '<html lang="es"><script>Shopify.currency = {"active":"EUR"}</script><a href="mailto:hola@lenta.example.com">c</a><a href="tel:+34600111222">t</a> ?v=1700000000 9999999999</html>' : null;
      return { ok: !!cuerpo, status: cuerpo ? 200 : 404, headers: { get: () => null }, text: async () => cuerpo || "" };
    },
  });
  const lenta = await lector.analizarTienda("lenta.example.com", "ES", {}, { soloShopify: true });
  assert.ok(lenta.ok && lenta.datos.producto === "Producto A" && lenta.datos.precio === "10 €" && lenta.datos.telefono === "+34600111222" && lenta.datos.tiendaDias === 0, JSON.stringify(lenta));
  assert.deepStrictEqual(await lector.analizarTienda("caida.example.com", "ES", {}, { soloShopify: true }), { ok: false, motivo: "la tienda no respondió" });
  console.log("ok  una tienda que frena (429) se reintenta; el teléfono solo sale de un enlace tel:, no de números sueltos");

  console.log("\nTodas las pruebas locales pasaron.");
})().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
