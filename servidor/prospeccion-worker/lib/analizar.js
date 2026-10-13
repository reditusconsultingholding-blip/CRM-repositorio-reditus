"use strict";
// Decide qué es un mensaje de la bandeja: una respuesta de una persona, una
// respuesta automática, un rebote (aviso de mailer-daemon / DSN) o algo que
// no interesa (boletines, correo propio). No clasifica el interés: eso lo
// hace el CRM.
const { simpleParser } = require("mailparser");

const CORREO = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}/gi;
const ASUNTO_AUTOMATICO = /(out of office|fuera de (la )?oficina|respuesta autom[aá]tica|automatic reply|auto[- ]?reply|autorespuesta|auto[- ]?response|ausente|vacaciones)/i;

function cabecera(m, nombre) {
  const v = m.headers.get(nombre);
  if (!v) return "";
  if (typeof v === "string") return v;
  if (v.text) return String(v.text);
  if (v.value && typeof v.value === "string") return v.value;
  return String(v);
}

function ids(v) {
  return (Array.isArray(v) ? v : v ? String(v).split(/\s+/) : []).map((x) => String(x).trim()).filter(Boolean);
}

/** @param {Buffer|string} fuente mensaje completo (RFC 822)  @param {string} propio dirección de la cuenta */
async function analizar(fuente, propio) {
  const crudo = Buffer.isBuffer(fuente) ? fuente.toString("utf8") : String(fuente);
  const m = await simpleParser(fuente, { skipHtmlToText: false, skipTextToHtml: true, skipImageLinks: true });
  const de = ((m.from && m.from.value && m.from.value[0] && m.from.value[0].address) || "").toLowerCase();
  const asunto = (m.subject || "").slice(0, 300);
  const messageId = m.messageId || "";
  const fecha = m.date instanceof Date && !isNaN(m.date) ? m.date.toISOString() : new Date().toISOString();
  const referencias = ids(m.references);
  const enRespuestaA = ids(m.inReplyTo)[0] || "";
  const texto = (m.text || "").replace(/\r\n/g, "\n").trim();

  // ---- rebote ----
  const tipoContenido = m.headers.get("content-type");
  const esReporte =
    tipoContenido && tipoContenido.value === "multipart/report" && /delivery-status/i.test((tipoContenido.params && tipoContenido.params["report-type"]) || "");
  const esDaemon = /^(mailer-daemon|postmaster)@/i.test(de);
  const fallidos = cabecera(m, "x-failed-recipients");
  if (esReporte || esDaemon || fallidos) {
    const accion = (/^Action:\s*([a-z]+)/im.exec(crudo) || [])[1] || "";
    if (/^(delivered|relayed|expanded)$/i.test(accion)) return { tipo: "ignorar", motivo: "aviso de entrega correcta" };
    const estado = (/^Status:\s*([245]\.\d{1,3}\.\d{1,3})/im.exec(crudo) || [])[1] || "";
    const final = (/^(?:Final|Original)-Recipient:\s*(?:rfc822;)?\s*<?([^\s<>]+@[^\s<>]+)>?/im.exec(crudo) || [])[1] || "";
    const candidatos = [fallidos, final, ...(texto.match(CORREO) || [])]
      .join(" ")
      .toLowerCase()
      .match(CORREO);
    const destinatario = (candidatos || []).find((c) => c !== propio.toLowerCase() && !/^(mailer-daemon|postmaster)@/.test(c)) || "";
    const diagnostico = ((/^Diagnostic-Code:\s*(.+(?:\r?\n[ \t].+)*)/im.exec(crudo) || [])[1] || asunto).replace(/\s+/g, " ").slice(0, 300);
    // El Message-ID del correo original viene en la copia adjunta: es el segundo «Message-ID:» del mensaje.
    const todos = [...crudo.matchAll(/^Message-ID:\s*(<[^>\r\n]+>)/gim)].map((x) => x[1]);
    const original = todos.find((id) => id !== messageId) || enRespuestaA || "";
    const permanente = estado ? estado[0] === "5" : accion ? /failed/i.test(accion) : !/(delay|retras|temporar|will be retried)/i.test(asunto + " " + texto.slice(0, 600));
    if (!destinatario && !original && !referencias.length) return { tipo: "ignorar", motivo: "rebote sin datos del original" };
    return { tipo: "rebote", cuerpo: { destinatario, messageIdOriginal: original, referencias, diagnostico, permanente, messageId, fecha } };
  }

  if (!de) return { tipo: "ignorar", motivo: "sin remitente" };
  if (de === propio.toLowerCase()) return { tipo: "ignorar", motivo: "correo propio" };
  // mailparser junta las cabeceras List-* en una sola entrada «list».
  if (m.headers.has("list") || /^(bulk|list|junk)$/i.test(cabecera(m, "precedence").trim())) {
    return { tipo: "ignorar", motivo: "boletín o lista" };
  }

  const auto = cabecera(m, "auto-submitted").trim().toLowerCase();
  const automatica =
    (!!auto && auto !== "no") ||
    !!cabecera(m, "x-autoreply") ||
    !!cabecera(m, "x-autorespond") ||
    /auto[_-]?reply/i.test(cabecera(m, "precedence")) ||
    ASUNTO_AUTOMATICO.test(asunto);

  return {
    tipo: "respuesta",
    cuerpo: { de, asunto, texto: texto.slice(0, 12000), messageId, enRespuestaA, referencias, fecha, automatica },
  };
}

module.exports = { analizar };
