"use strict";
// Cliente de la API del CRM para la prospección (`/api/servidor/prospeccion/**`).
// El contrato está en el CRM:
//   correos    → `src/app/api/servidor/prospeccion/pendientes-envio/route.ts`
//   automático → `src/app/api/servidor/prospeccion/latido/route.ts`

class ErrorCrm extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
  /** El CRM entendió y dijo que no: repetir la misma llamada no sirve. */
  get definitivo() {
    return this.estado === 400 || this.estado === 404 || this.estado === 409;
  }
}

function crearCrm(cfg, reloj) {
  async function llamar(ruta, cuerpo, esperaMs = 90_000) {
    // Solo en simulación con reloj de prueba se le dicta la hora al CRM (y el CRM solo la acepta en `next dev`).
    const completo = reloj.dePrueba ? { ...cuerpo, ahora: reloj.ahora().toISOString() } : cuerpo;
    let res;
    try {
      res = await fetch(`${cfg.crmUrl}/api/servidor/prospeccion/${ruta}`, {
        method: "POST",
        headers: { authorization: `Bearer ${cfg.secreto}`, "content-type": "application/json" },
        body: JSON.stringify(completo),
        signal: AbortSignal.timeout(esperaMs),
      });
    } catch (e) {
      throw new ErrorCrm(`sin conexión con el CRM (${e && e.name === "TimeoutError" ? "tardó demasiado" : (e && e.message) || "error de red"})`, 0);
    }
    const texto = await res.text();
    let dato = null;
    try {
      dato = JSON.parse(texto);
    } catch {
      /* respuesta que no es JSON (página de error, redirección al login) */
    }
    if (!res.ok || !dato) throw new ErrorCrm((dato && dato.error) || `el CRM respondió HTTP ${res.status}`, res.status);
    return dato;
  }

  return {
    llamar,
    /** Lo próximo que toca enviar por una cuenta: primero respuestas aprobadas, entregas y seguimientos; luego recordatorios y correos nuevos. */
    async siguiente(linea) {
      const a = await llamar("pendientes-envio", { linea, max: 1 });
      if (a.envios && a.envios.length) return { envio: a.envios[0], cuenta: (a.cuentas || [])[0], motivo: a.motivo };
      if (a.motivo) return { envio: null, cuenta: (a.cuentas || [])[0], motivo: a.motivo };
      const b = await llamar("campanas/siguientes", { linea, max: 1 });
      return { envio: (b.envios || [])[0] || null, cuenta: (b.cuentas || [])[0], motivo: b.motivo };
    },
    /** Señal de vida. Devuelve las órdenes del panel: pausa, búsqueda, envío, hoja. */
    latido: (cuerpo) => llamar("latido", cuerpo, cuerpo.tareas ? 280_000 : 60_000),
    permisoBusqueda: () => llamar("busqueda/permiso", {}),
    dominiosNuevos: async (dominios) => (await llamar("busqueda/dominios", { dominios })).nuevos || [],
    resultadoBusqueda: (cuerpo) => llamar("busqueda/resultado", cuerpo, 280_000),
    sincronizarHoja: () => llamar("hoja", {}, 280_000),
    /** Comprueba dirección y secreto sin tocar nada: una baja sin correo responde 400. */
    async comprobar() {
      try {
        await llamar("baja", {});
        return { ok: false, detalle: "respuesta inesperada" };
      } catch (e) {
        if (e.estado === 400) return { ok: true };
        if (e.estado === 401) return { ok: false, detalle: "el SERVIDOR_SECRET no coincide con el del CRM" };
        if (e.estado === 503) return { ok: false, detalle: "el CRM no tiene SERVIDOR_SECRET configurado" };
        return { ok: false, detalle: e.message };
      }
    },
  };
}

module.exports = { crearCrm, ErrorCrm };
