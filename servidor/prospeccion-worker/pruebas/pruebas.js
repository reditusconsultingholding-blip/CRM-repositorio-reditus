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

  console.log("\nTodas las pruebas locales pasaron.");
})().catch((e) => {
  console.error("FALLÓ:", e.message);
  process.exit(1);
});
