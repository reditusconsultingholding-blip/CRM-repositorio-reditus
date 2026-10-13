"use strict";
// Cliente de la API del CRM para el servidor (`/api/servidor/trabajos/**`).
// El contrato está documentado en el CRM: `src/lib/servidor-api.ts`.
const fs = require("fs");
const { pedirJson, ErrorHttp } = require("./red");

/** El CRM dijo que este trabajo ya no es nuestro: hay que dejarlo sin reportar nada más. */
class TrabajoSoltado extends Error {}

function crearCrm(cfg) {
  const cabeceras = { authorization: `Bearer ${cfg.secreto}`, "content-type": "application/json" };

  async function llamar(ruta, cuerpo) {
    try {
      return await pedirJson(`${cfg.crmUrl}/api/servidor/trabajos/${ruta}`, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) });
    } catch (e) {
      if (e instanceof ErrorHttp && e.estado === 409 && e.cuerpo && e.cuerpo.soltar) {
        throw new TrabajoSoltado(e.cuerpo.error || "El CRM retiró este trabajo.");
      }
      throw e;
    }
  }

  return {
    /** El siguiente trabajo pendiente (ya tomado a nuestro nombre) o null. */
    async tomar() {
      const r = await llamar("tomar", { trabajador: cfg.nombre });
      return r.trabajo || null;
    },
    progreso: (t, datos) => llamar(`${t.id}/progreso`, { toma: t.toma, ...datos }),
    fallo: (t, datos) => llamar(`${t.id}/fallo`, { toma: t.toma, ...datos }),

    /** Sube el MP4 con la URL firmada que entrega el CRM y reporta el resultado. */
    async entregar(t, archivo, datos) {
      const { subida } = await llamar(`${t.id}/resultado`, { toma: t.toma, pedirSubida: true });
      const cuerpo = fs.readFileSync(archivo);
      let ultimo;
      for (const espera of [0, 3000, 10000]) {
        if (espera) await new Promise((r) => setTimeout(r, espera));
        try {
          const res = await fetch(subida.url, { method: subida.metodo || "PUT", headers: subida.cabeceras || {}, body: cuerpo, signal: AbortSignal.timeout(15 * 60000) });
          if (!res.ok) throw new Error(`la subida respondió HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
          ultimo = null;
          break;
        } catch (e) {
          ultimo = e;
        }
      }
      if (ultimo) throw ultimo;
      return llamar(`${t.id}/resultado`, { toma: t.toma, ruta: subida.ruta, ...datos });
    },
  };
}

module.exports = { crearCrm, TrabajoSoltado };
