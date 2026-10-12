// Pruebas rápidas del cálculo de fechas de entrega.
// Uso: node scripts/probar-capacidad.mjs   (Node 22.18+ lee el .ts directo)
import assert from "node:assert/strict";
import {
  CAPACIDAD,
  calcularEntrega,
  sumarDiasHabiles,
  siguienteDiaHabil,
  diasHabilesEntre,
  esDiaHabil,
  fechaLarga,
} from "../src/lib/capacidad.ts";

const LUNES = "2026-10-05";
const VIERNES = "2026-10-09";
const DOMINGO = "2026-10-11";
let n = 0;
function prueba(nombre, fn) {
  fn();
  n++;
  console.log(`ok  ${nombre}`);
}
const entrega = (tipo, cantidad, extra = {}) =>
  calcularEntrega({ hoy: LUNES, tipo, cantidad, cola: [], equipo: { editor_video: 1, disenador_landing: 1 }, ...extra });
// Los videos están apagados; sus reglas se prueban encendiéndolos un momento.
function conVideosActivos(fn) {
  const antes = CAPACIDAD.tipos.video.activo;
  CAPACIDAD.tipos.video.activo = true;
  try { fn(); } finally { CAPACIDAD.tipos.video.activo = antes; }
}

prueba("días hábiles: sábado y domingo no cuentan", () => {
  assert.equal(esDiaHabil("2026-10-10"), false);
  assert.equal(esDiaHabil(DOMINGO), false);
  assert.equal(siguienteDiaHabil(VIERNES), "2026-10-12");
  assert.equal(sumarDiasHabiles(VIERNES, 3), "2026-10-14");
  assert.equal(diasHabilesEntre(VIERNES, "2026-10-14"), 3);
  assert.equal(fechaLarga("2026-10-15"), "jueves 15 de octubre");
});

prueba("1 landing sin cola = 3 días hábiles", () => {
  const r = entrega("landing", 1);
  assert.equal(r.diasHabiles, 3);
  assert.equal(r.fecha, "2026-10-08");
});

prueba("3 landings en cola + 1 nueva = 6 días hábiles", () => {
  const cola = [1, 2, 3].map(() => ({ cola: "landing", unidades: 1, estado: "En progreso", fechaPrometida: null }));
  const r = entrega("landing", 1, { cola });
  assert.equal(r.unidadesEnCola, 3);
  assert.equal(r.diasHabiles, 6);
  assert.equal(r.fechaSinCola, "2026-10-08");
});

prueba("landings: capacidad fija de 1 al día, haya los programadores que haya", () => {
  const cola = [1, 2, 3].map(() => ({ cola: "landing", unidades: 1, estado: "En progreso", fechaPrometida: null }));
  for (const equipo of [{}, { programador: 1 }, { programador: 3, disenador_landing: 2 }]) {
    const r = entrega("landing", 1, { cola, equipo });
    assert.equal(r.personas, 1);
    assert.equal(r.capacidadDia, 1);
    assert.equal(r.diasHabiles, 6);
    assert.ok(r.motivos.some((m) => m.includes("programador")));
    assert.ok(!r.motivos.some((m) => /diseñador|editor|calculé con 1/.test(m)));
  }
});

prueba("videos apagados: no calcula fecha ni cola y lo dice", () => {
  assert.equal(CAPACIDAD.tipos.video.activo, false);
  const cola = [{ cola: "video", unidades: 40, estado: "En progreso", fechaPrometida: null }];
  const r = entrega("video", 6, { cola });
  assert.equal(r.fecha, null);
  assert.equal(r.unidadesEnCola, 0);
  assert.deepEqual(r.motivos, ["Los videos van por producción automática; no se calcula fecha aquí."]);
});

prueba("festivo de Colombia: avisa pero NO mueve la fecha", () => {
  const r = calcularEntrega({ hoy: DOMINGO, tipo: "landing", cantidad: 1, cola: [], equipo: {} });
  assert.equal(r.inicio, "2026-10-12");
  assert.equal(r.fecha, "2026-10-14");
  assert.ok(r.motivos.some((m) => m.includes("lunes 12 de octubre es festivo en Colombia")));
  assert.ok(!entrega("landing", 1).motivos.some((m) => m.includes("festivo")));
});

prueba("videos: hasta 7 = 2 días; cada bloque de 6 suma 1", () => conVideosActivos(() => {
  assert.equal(entrega("video", 1).diasHabiles, 2);
  assert.equal(entrega("video", 6).diasHabiles, 2);
  assert.equal(entrega("video", 7).diasHabiles, 2);
  assert.equal(entrega("video", 8).diasHabiles, 3);
  assert.equal(entrega("video", 13).diasHabiles, 3);
  assert.equal(entrega("video", 14).diasHabiles, 4);
  assert.equal(entrega("video", 19).diasHabiles, 4);
}));

prueba("videos: 3 editores triplican la capacidad", () => conVideosActivos(() => {
  const r = entrega("video", 21, { equipo: { editor_video: 3 } });
  assert.equal(r.diasHabiles, 2);
  assert.equal(entrega("video", 22, { equipo: { editor_video: 3 } }).diasHabiles, 3);
}));

prueba("la cola de videos no afecta a las landings, y al revés", () => conVideosActivos(() => {
  const cola = [{ cola: "video", unidades: 40, estado: "En progreso", fechaPrometida: null }];
  assert.equal(entrega("landing", 1, { cola }).diasHabiles, 3);
  assert.equal(entrega("video", 7, { cola }).diasHabiles, 2 + Math.ceil(40 / 6));
}));

prueba("lo que espera información del cliente no ocupa la cola", () => conVideosActivos(() => {
  const cola = [{ cola: "video", unidades: 10, estado: "ESPERA INFO", fechaPrometida: null }];
  const r = entrega("video", 7, { cola });
  assert.equal(r.diasHabiles, 2);
  assert.equal(r.unidadesEnEspera, 10);
}));

prueba("si el día de entrega ya está lleno, se corre al siguiente hábil", () => {
  const cola = [{ cola: "landing", unidades: 1, estado: "Por revisión", fechaPrometida: "2026-10-08" }];
  const r = entrega("landing", 1, { cola });
  assert.equal(r.fecha, "2026-10-09");
});

prueba("pedido en fin de semana: empieza el lunes", () => {
  const r = calcularEntrega({ hoy: DOMINGO, tipo: "landing", cantidad: 1, cola: [], equipo: { disenador_landing: 1 } });
  assert.equal(r.inicio, "2026-10-12");
  assert.equal(r.fecha, "2026-10-14");
});

prueba("pedido un viernes: la entrega salta el fin de semana", () => conVideosActivos(() => {
  const r = calcularEntrega({ hoy: VIERNES, tipo: "video", cantidad: 5, cola: [], equipo: { editor_video: 1 } });
  assert.equal(r.fecha, "2026-10-13");
}));

prueba("sin gente activa calcula con 1 y avisa", () => {
  const r = entrega("imagenes", 5, { equipo: {} });
  assert.equal(r.personas, 1);
  assert.ok(r.motivos.some((m) => m.includes("calculé con 1")));
});

prueba("servicio sin regla: no inventa fecha", () => {
  const r = entrega("otro", 1);
  assert.equal(r.fecha, null);
});

prueba("página de marca cuenta como 5 landings y se marca como estimado", () => {
  const r = entrega("pagina_marca", 1);
  assert.equal(r.diasHabiles, 7);
  assert.equal(r.estimado, true);
});

console.log(`\n${n} pruebas pasaron.`);
