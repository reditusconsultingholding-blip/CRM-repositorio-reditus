"use strict";
// Las dos puertas de Gmail: SMTP para enviar e IMAP para leer, con la
// contraseña de aplicación de cada cuenta. En MODO=simulacion no se abre
// ninguna conexión: lo «enviado» se escribe en disco y la bandeja son los
// archivos .eml que haya en datos/simulacion/bandeja/<línea>/.
//
// La bandeja se abre SIEMPRE en solo lectura (EXAMINE) y los mensajes se
// piden con BODY.PEEK: no se marca nada como leído ni se borra nada.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

/** El servidor rechazó el mensaje antes de aceptarlo: con seguridad NO salió. */
function noSalio(e) {
  return !!(e && (e.responseCode || ["EAUTH", "ECONNECTION", "EDNS", "EENVELOPE", "ESOCKET", "ETLS"].includes(e.code)) && e.command !== "DATA");
}

function crearCorreoReal(cfg, log) {
  const nodemailer = require("nodemailer");
  const { ImapFlow } = require("imapflow");
  const transportes = {};

  function transporte(linea) {
    if (!transportes[linea]) {
      const c = cfg.cuentas[linea];
      transportes[linea] = nodemailer.createTransport({
        ...cfg.config.smtp,
        auth: { user: c.usuario, pass: c.clave },
        connectionTimeout: 30_000,
        greetingTimeout: 30_000,
        socketTimeout: 90_000,
      });
    }
    return transportes[linea];
  }

  function imap(linea) {
    const c = cfg.cuentas[linea];
    return new ImapFlow({ ...cfg.config.imap, auth: { user: c.usuario, pass: c.clave }, logger: false, socketTimeout: 120_000 });
  }

  return {
    /** Inicia sesión en SMTP sin enviar nada. Lanza si Gmail no acepta la cuenta. */
    async verificarEnvio(linea) {
      await transporte(linea).verify();
    },
    async verificarLectura(linea) {
      const cliente = imap(linea);
      await cliente.connect();
      await cliente.logout();
    },
    async enviar(linea, envio) {
      const c = cfg.cuentas[linea];
      const info = await transporte(linea).sendMail({
        from: { name: cfg.remitente, address: c.usuario },
        to: envio.para,
        subject: envio.asunto,
        text: envio.cuerpo,
        inReplyTo: envio.enRespuestaA ? `<${envio.enRespuestaA}>` : undefined,
        references: envio.referencias && envio.referencias.length ? envio.referencias.map((r) => `<${r}>`) : undefined,
        headers: { "List-Unsubscribe": `<mailto:${c.usuario}?subject=no>` },
      });
      if (info.rejected && info.rejected.length) {
        const e = new Error(`Gmail rechazó al destinatario: ${info.response || "sin detalle"}`);
        e.responseCode = 550;
        throw e;
      }
      return { messageId: String(info.messageId || "").replace(/^<|>$/g, "") };
    },
    /**
     * Mensajes de la bandeja de entrada posteriores a la marca.
     * marca = { uidValidity, ultimoUid } · devuelve { mensajes: [{ clave, fuente }], marca }.
     */
    async leerNuevos(linea, marca) {
      const cliente = imap(linea);
      cliente.on("error", (e) => log.aviso(`[${linea}] IMAP: ${e.message}`));
      await cliente.connect();
      const mensajes = [];
      let nueva = marca;
      try {
        const candado = await cliente.getMailboxLock("INBOX", { readOnly: true });
        try {
          const buzon = cliente.mailbox;
          const validez = String(buzon.uidValidity);
          let uids;
          if (!marca || marca.uidValidity !== validez) {
            // Primera lectura (o Gmail renumeró el buzón): solo lo de los últimos días.
            const desde = new Date(Date.now() - cfg.config.primeraLecturaDias * 86_400_000);
            uids = (await cliente.search({ since: desde }, { uid: true })) || [];
            nueva = { uidValidity: validez, ultimoUid: Math.max(0, Number(buzon.uidNext) - 1) };
          } else {
            uids = ((await cliente.search({ uid: `${marca.ultimoUid + 1}:*` }, { uid: true })) || []).filter((u) => u > marca.ultimoUid);
            nueva = { ...marca };
          }
          uids = uids.sort((a, b) => a - b).slice(0, cfg.config.maxMensajesPorLectura);
          for (const uid of uids) {
            const msg = await cliente.fetchOne(String(uid), { uid: true, source: { start: 0, maxLength: cfg.config.maxBytesMensaje } }, { uid: true });
            if (msg && msg.source) mensajes.push({ clave: `uid ${uid}`, fuente: msg.source });
            nueva.ultimoUid = Math.max(nueva.ultimoUid, uid);
          }
        } finally {
          candado.release();
        }
      } finally {
        await cliente.logout().catch(() => {});
      }
      return { mensajes, marca: nueva };
    },
  };
}

function crearCorreoSimulado(cfg) {
  const base = cfg.carpetas.simulacion;
  const enviados = path.join(base, "enviados");
  fs.mkdirSync(enviados, { recursive: true });
  for (const l of cfg.lineas) fs.mkdirSync(path.join(base, "bandeja", l), { recursive: true });

  return {
    async verificarEnvio() {},
    async verificarLectura() {},
    async enviar(linea, envio) {
      const messageId = `sim.${Date.now()}.${crypto.randomBytes(4).toString("hex")}@simulacion.local`;
      const nombre = `${new Date().toISOString().replace(/[:.]/g, "-")}-${linea}-${envio.paso}-${envio.para.replace(/[^a-z0-9@.-]/gi, "_")}.txt`;
      const contenido = [
        `[SIMULACIÓN: este correo NO se envió]`,
        `Cuenta: ${cfg.cuentas[linea].usuario} (${linea})`,
        `Id del CRM: ${envio.id}`,
        `Message-ID: <${messageId}>`,
        envio.enRespuestaA ? `In-Reply-To: <${envio.enRespuestaA}>` : "",
        `Para: ${envio.para}`,
        `Asunto: ${envio.asunto}`,
        "",
        envio.cuerpo,
        "",
      ]
        .filter((l, i) => l !== "" || i >= 6)
        .join("\n");
      fs.writeFileSync(path.join(enviados, nombre), contenido);
      return { messageId };
    },
    /** marca = { vistos: [nombres] }. Lee los .eml que aún no se han visto. */
    async leerNuevos(linea, marca) {
      const carpeta = path.join(base, "bandeja", linea);
      const vistos = new Set((marca && marca.vistos) || []);
      const nuevos = fs.readdirSync(carpeta).filter((n) => n.toLowerCase().endsWith(".eml") && !vistos.has(n)).sort();
      const mensajes = nuevos.map((n) => ({ clave: n, fuente: fs.readFileSync(path.join(carpeta, n)) }));
      return { mensajes, marca: { vistos: [...vistos, ...nuevos].slice(-5000) } };
    },
  };
}

function crearCorreo(cfg, log) {
  return cfg.modo === "real" ? crearCorreoReal(cfg, log) : crearCorreoSimulado(cfg);
}

module.exports = { crearCorreo, noSalio };
