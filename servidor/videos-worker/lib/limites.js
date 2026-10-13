"use strict";
// Paralelismo controlado. Todo vive en este proceso (hay un solo trabajador por carpeta).
//
//   semáforo   cuántas tareas a la vez contra el proveedor de imagen, el de video y cuántos
//              armados. El turno NO es por orden de llegada: primero la mayor prioridad
//              (correcciones y armados), y a igual prioridad el proyecto que lleva más
//              tiempo sin turno. Así un lote grande no bloquea una corrección ni agota la
//              fila él solo.
//   cerrojo    por nombre de archivo: dos armados que necesitan el mismo archivo no lo
//              descargan ni lo codifican dos veces; el segundo espera y lo reutiliza.
//   freno      cuando el proveedor responde 429 («vas muy rápido»), TODAS las llamadas a
//              ese proveedor esperan; la espera crece con cada 429 seguido, hasta un tope.
//   presupuesto  tope de gasto de un trabajo (`gastoMaximoCreditos`).
const os = require("os");

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function crearSemaforo(maximo) {
  const tope = Math.max(1, Math.floor(maximo) || 1);
  let enUso = 0;
  let orden = 0;
  let reloj = 0;
  const fila = [];
  const ultimoTurno = new Map(); // grupo → cuándo tuvo turno por última vez
  const stats = { maximo: tope, picoEnUso: 0, atendidos: 0 };

  function despachar() {
    while (enUso < tope && fila.length) {
      let mejor = 0;
      for (let i = 1; i < fila.length; i++) {
        const a = fila[i];
        const b = fila[mejor];
        const ta = ultimoTurno.get(a.grupo) || 0;
        const tb = ultimoTurno.get(b.grupo) || 0;
        if (a.prioridad > b.prioridad || (a.prioridad === b.prioridad && (ta < tb || (ta === tb && a.orden < b.orden)))) mejor = i;
      }
      const [turno] = fila.splice(mejor, 1);
      enUso++;
      stats.picoEnUso = Math.max(stats.picoEnUso, enUso);
      stats.atendidos++;
      ultimoTurno.set(turno.grupo, ++reloj);
      if (ultimoTurno.size > 500) ultimoTurno.delete(ultimoTurno.keys().next().value);
      turno.pasar();
    }
  }

  /**
   * Corre `fn` cuando haya cupo. `fn(esperaMs)` recibe cuánto esperó su turno.
   * `prioridad`: número, mayor pasa primero. `grupo`: el proyecto (para alternar).
   */
  async function usar({ prioridad = 0, grupo = "" } = {}, fn) {
    const t0 = Date.now();
    await new Promise((pasar) => {
      fila.push({ prioridad, grupo, pasar, orden: ++orden });
      despachar();
    });
    try {
      return await fn(Date.now() - t0);
    } finally {
      enUso--;
      despachar();
    }
  }

  return { usar, stats, enFila: () => fila.length, enUso: () => enUso };
}

/** Exclusión por clave: `await conCerrojo("archivo.mp4", async () => { … })`. */
function crearCerrojos() {
  const colas = new Map();
  return async function conCerrojo(clave, fn) {
    const anterior = colas.get(clave) || Promise.resolve();
    let soltar;
    const mio = new Promise((r) => (soltar = r));
    const cadena = anterior.then(() => mio);
    colas.set(clave, cadena);
    await anterior;
    try {
      return await fn();
    } finally {
      soltar();
      if (colas.get(clave) === cadena) colas.delete(clave);
    }
  };
}

/** Freno compartido ante 429. `ajustes`: { inicialSegundos, factor, topeSegundos }. */
function crearFreno() {
  let hasta = 0;
  let seguidos = 0;
  const stats = { frenadas: 0, esperadoMs: 0 };
  return {
    stats,
    /** Espera si el proveedor pidió bajar el ritmo. Devuelve los ms esperados. */
    async pasar() {
      let total = 0;
      for (;;) {
        const falta = hasta - Date.now();
        if (falta <= 0) break;
        await esperar(falta);
        total += falta;
      }
      stats.esperadoMs += total;
      return total;
    },
    /** El proveedor respondió 429: todos esperan. Devuelve los ms de esta frenada. */
    frenar(ajustes = {}) {
      const inicial = (ajustes.inicialSegundos ?? 5) * 1000;
      const tope = (ajustes.topeSegundos ?? 120) * 1000;
      const ms = Math.min(tope, inicial * (ajustes.factor ?? 2) ** seguidos);
      seguidos++;
      stats.frenadas++;
      hasta = Math.max(hasta, Date.now() + ms);
      return ms;
    },
    /** Una llamada salió bien: la próxima frenada vuelve a empezar desde la espera inicial. */
    bien() {
      seguidos = 0;
    },
  };
}

/** Números efectivos de `config.json` → "paralelo" (0 o ausente = automático según los núcleos). */
function ajustesParalelo(cfg) {
  const p = (cfg.config && cfg.config.paralelo) || {};
  const nucleos = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
  const entero = (v, def) => (Number.isFinite(Number(v)) && Number(v) >= 1 ? Math.floor(Number(v)) : def);
  const armados = entero(p.armados, nucleos >= 8 ? 2 : 1);
  // Entre todos los armados se usa, como mucho, la mitad de los núcleos: la otra mitad queda para el resto del servidor.
  const hilosFfmpeg = entero(p.hilosFfmpeg, Math.max(1, Math.floor(nucleos / 2 / armados)));
  return {
    nucleos,
    trabajos: entero(p.trabajos, 3),
    imagenes: entero(p.imagenes, 4),
    clips: entero(p.clips, 3),
    armados,
    hilosFfmpeg,
    prioridadBaja: p.prioridadBaja !== false,
    cupoUrgentes: Number(p.cupoUrgentes) > 0 ? Math.floor(Number(p.cupoUrgentes)) : 0,
    consultarConTrabajoSegundos: Number(p.consultarConTrabajoSegundos) > 0 ? Number(p.consultarConTrabajoSegundos) : 10,
    espera429: { inicialSegundos: 5, factor: 2, topeSegundos: 120, maxMinutos: 20, ...(p.espera429 || {}) },
  };
}

/** Los límites compartidos por todos los trabajos del proceso. */
function crearLimites(cfg) {
  const a = ajustesParalelo(cfg);
  return { ajustes: a, imagen: crearSemaforo(a.imagenes), video: crearSemaforo(a.clips), armado: crearSemaforo(a.armados), conCerrojo: crearCerrojos() };
}

/** ¿Este trabajo debe adelantarse? Armados, correcciones (una sola escena) o lo que diga `prioridad`. */
function prioridadDe(trabajo) {
  if (Number.isFinite(Number(trabajo.prioridad)) && trabajo.prioridad !== null && trabajo.prioridad !== "") return Number(trabajo.prioridad);
  if (trabajo.etapa === "armado" || trabajo.etapa === "analisis") return 1; // el análisis lo espera una persona en pantalla
  if (trabajo.etapa && Array.isArray(trabajo.escenas) && trabajo.escenas.length === 1) return 1;
  return 0;
}

/**
 * Tope de gasto de un trabajo. Antes de crear cada tarea paga se pide permiso:
 *   · mientras no se conozca cuánto cuesta una tarea, van de a una (se aprende con la primera);
 *   · después se admite una más solo si lo gastado + lo que está en curso + ella caben en el tope.
 * Sin tope, siempre se admite.
 */
function crearPresupuesto(tope, consumidoInicial = 0) {
  const limite = Number(tope) > 0 ? Number(tope) : null;
  let consumido = consumidoInicial || 0;
  let enVuelo = 0;
  let estimado = null;
  let avisar = [];
  const despertar = () => {
    const a = avisar;
    avisar = [];
    for (const f of a) f();
  };
  return {
    limite,
    consumido: () => consumido,
    async admitir() {
      if (limite === null) return true;
      for (;;) {
        if (consumido >= limite) return false;
        if (estimado === null) {
          if (enVuelo === 0) break; // la primera: se admite y con ella se aprende el costo
        } else if (consumido + (enVuelo + 1) * estimado <= limite) break;
        else if (enVuelo === 0) return false; // ni una más cabe
        await new Promise((r) => avisar.push(r));
      }
      enVuelo++;
      return true;
    },
    /** La tarea terminó (bien o mal). `creditos`: lo que cobró, o null si no se supo. */
    terminar(creditos) {
      enVuelo = Math.max(0, enVuelo - 1);
      if (typeof creditos === "number" && creditos > 0) {
        consumido += creditos;
        estimado = Math.max(estimado || 0, creditos);
      }
      despertar();
    },
  };
}

module.exports = { crearSemaforo, crearCerrojos, crearFreno, crearLimites, ajustesParalelo, prioridadDe, crearPresupuesto, esperar };
