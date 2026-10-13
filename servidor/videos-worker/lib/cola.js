"use strict";
// El ciclo del trabajador: lleva VARIOS trabajos a la vez (config.json → paralelo.trabajos).
//
// Tomar un trabajo es barato: lo caro (tareas contra el proveedor, armados) lo reparten los
// semáforos de lib/limites.js, que dan el turno primero a correcciones y armados y alternan
// entre proyectos. Por eso una corrección que entra cuando hay un lote grande en curso solo
// necesita un puesto libre aquí para adelantarse.
//
// `cupoUrgentes` (apagado por defecto): puestos extra reservados para trabajos urgentes. Solo
// sirve si el CRM entiende `soloUrgentes` en «tomar» (propuesto en el contrato, sección Cambios).
const { esperar } = require("./limites");

/**
 *   tomar(extra)        → el siguiente trabajo o null (no debe lanzar)
 *   procesar(trabajo)   → atiende un trabajo (no debe lanzar)
 *   max                 trabajos simultáneos
 *   iniciales           trabajos que quedaron a medias en disco: van primero
 *   unaVez              termina cuando la cola queda vacía y no hay nada en curso
 *   intervaloMs         cada cuánto se consulta la cola estando ocioso
 *   conTrabajoMs        cada cuánto se consulta mientras hay trabajos en curso y puestos libres
 *   cadaVuelta()        opcional, se llama en cada vuelta ociosa (limpieza)
 */
async function atenderCola({ tomar, procesar, max = 3, cupoUrgentes = 0, iniciales = [], unaVez = false, intervaloMs = 60000, conTrabajoMs = 10000, cadaVuelta = null, registro = null }) {
  const activos = new Map(); // id → promesa
  const stats = { atendidos: 0, picoSimultaneos: 0 };
  const lanzar = (t) => {
    const p = Promise.resolve()
      .then(() => procesar(t))
      .catch((e) => registro && registro.error(`Error inesperado en el trabajo ${t.id}:`, e instanceof Error ? e : String(e)))
      .finally(() => activos.delete(t.id));
    activos.set(t.id, p);
    stats.atendidos++;
    stats.picoSimultaneos = Math.max(stats.picoSimultaneos, activos.size);
  };

  const pendientes = [...iniciales];
  for (;;) {
    let tomo = false;
    while (activos.size < max) {
      const t = pendientes.length ? pendientes.shift() : await tomar();
      if (!t || activos.has(t.id)) break;
      lanzar(t);
      tomo = true;
    }
    if (cupoUrgentes > 0 && activos.size >= max && activos.size < max + cupoUrgentes) {
      const t = await tomar({ soloUrgentes: true });
      if (t && !activos.has(t.id)) {
        lanzar(t);
        tomo = true;
      }
    }
    if (activos.size === 0 && !tomo) {
      if (unaVez) break;
      if (cadaVuelta) cadaVuelta();
    }
    // Se vuelve a mirar la cola cuando termina un trabajo o cuando pasa el intervalo.
    await Promise.race([...activos.values(), esperar(activos.size ? conTrabajoMs : tomo ? 0 : intervaloMs)]);
  }
  return stats;
}

module.exports = { atenderCola };
