// Reglas de capacidad del equipo y cálculo de la fecha de entrega.
//
// TODO LO EDITABLE ESTÁ EN `CAPACIDAD` (abajo). El cálculo es una función
// pura (sin base de datos, sin IA): con los mismos datos da siempre la
// misma fecha. Este archivo no importa nada a propósito, para poder
// probarlo con `node scripts/probar-capacidad.mjs`.

export type TipoServicio = "video" | "landing" | "imagenes" | "pagina_marca" | "cro" | "otro";
export type Cola = "video" | "landing" | "imagenes";

export const TIPO_LABELS: Record<TipoServicio, { uno: string; varios: string }> = {
  video: { uno: "video", varios: "videos" },
  landing: { uno: "landing page", varios: "landing pages" },
  imagenes: { uno: "imagen", varios: "imágenes" },
  pagina_marca: { uno: "página de marca", varios: "páginas de marca" },
  cro: { uno: "optimización (CRO)", varios: "optimizaciones (CRO)" },
  otro: { uno: "otro servicio", varios: "otros servicios" },
};

export type ReglaTipo = {
  /** Cola de producción que ocupa (quién lo hace). */
  cola: Cola;
  /** Rol de la tabla `users` que produce este trabajo. */
  rol: string;
  /** Nombre del rol para la explicación. */
  rolLabel: { uno: string; varios: string };
  /** Unidades que saca UNA persona el primer día de producción. */
  primerDia: number;
  /** Unidades que saca UNA persona cada día siguiente. */
  diasSiguientes: number;
  /** Días hábiles después de producir (revisión, correcciones, subida). */
  margenDias: number;
  /** Cuántas unidades de la cola ocupa una unidad de este servicio. */
  peso: number;
  /** false = no es una regla dada por el dueño, es un estimado por confirmar. */
  confirmada: boolean;
  /** Interruptor: false = el asistente NO calcula fecha ni cola de este servicio. */
  activo: boolean;
  /** Qué se le dice al usuario cuando está apagado. */
  motivoInactivo?: string;
  /** Si se pone, la capacidad usa este número de personas y NO cuenta
   * cuántos usuarios activos hay con ese rol. */
  personasFijas?: number;
};

export const CAPACIDAD = {
  /** 1 = lunes … 5 = viernes. El sábado (medio día) no cuenta. */
  diasHabiles: [1, 2, 3, 4, 5],
  /** Días que NO se trabajan ("AAAA-MM-DD") y sí corren la fecha. Vacío a
   * propósito: los festivos de Colombia se trabajan (los clientes son de fuera). */
  festivos: [] as string[],
  /** Festivos de Colombia (resto de 2026 y 2027). SOLO recordatorio: si la
   * entrega o un día del tramo cae aquí se muestra una nota, pero la fecha
   * NO cambia. */
  recordatoriosFestivos: [
    "2026-10-12", "2026-11-02", "2026-11-16", "2026-12-08", "2026-12-25",
    "2027-01-01", "2027-01-11", "2027-03-22", "2027-03-25", "2027-03-26",
    "2027-05-01", "2027-05-10", "2027-05-31", "2027-06-07", "2027-07-05",
    "2027-07-20", "2027-08-07", "2027-08-16", "2027-10-18", "2027-11-01",
    "2027-11-15", "2027-12-08", "2027-12-25",
  ] as string[],
  /** false = un pedido que entra hoy se empieza el siguiente día hábil. */
  empiezaHoy: false,
  /** Estados de un requerimiento que todavía ocupan producción. */
  estadosEnProduccion: ["Nuevo pedido", "En progreso", "Corregir"],
  /** Estados abiertos que NO ocupan producción (esperan al cliente). */
  estadosEnEspera: ["ESPERA INFO"],
  tipos: {
    // Las landings las hace el dueño (programador): 1 por día hábil, FIJO
    // (no se multiplica por usuarios). Una landing ≈ 3 días de entrega
    // (1 de producción + 2 de revisión y subida).
    landing: {
      cola: "landing",
      rol: "programador",
      rolLabel: { uno: "programador", varios: "programadores" },
      personasFijas: 1,
      activo: true,
      primerDia: 1,
      diasSiguientes: 1,
      margenDias: 2,
      peso: 1,
      confirmada: true,
    },
    // APAGADO (activo: false): los videos pasan a producción automática y
    // el asistente no les calcula fecha ni cola. Para reactivarlo, activo: true.
    // Regla guardada: 7 videos por editor por día hábil; hasta 7 = 2 días;
    // cada bloque adicional de 6 suma 1 día.
    video: {
      activo: false,
      motivoInactivo: "Los videos van por producción automática; no se calcula fecha aquí.",
      cola: "video",
      rol: "editor_video",
      rolLabel: { uno: "editor", varios: "editores" },
      primerDia: 7,
      diasSiguientes: 6,
      margenDias: 1,
      peso: 1,
      confirmada: true,
    },
    // ── Estimados por confirmar con el dueño (no hay regla dada) ──
    imagenes: {
      activo: true,
      cola: "imagenes",
      rol: "disenador_landing",
      rolLabel: { uno: "diseñador", varios: "diseñadores" },
      primerDia: 10,
      diasSiguientes: 10,
      margenDias: 1,
      peso: 1,
      confirmada: false,
    },
    // Una página de marca se cuenta como 5 landings en la cola del diseñador.
    pagina_marca: {
      cola: "landing",
      rol: "programador",
      rolLabel: { uno: "programador", varios: "programadores" },
      personasFijas: 1,
      activo: true,
      primerDia: 1,
      diasSiguientes: 1,
      margenDias: 2,
      peso: 5,
      confirmada: false,
    },
    // Una optimización/CRO se cuenta como 2 landings.
    cro: {
      cola: "landing",
      rol: "programador",
      rolLabel: { uno: "programador", varios: "programadores" },
      personasFijas: 1,
      activo: true,
      primerDia: 1,
      diasSiguientes: 1,
      margenDias: 2,
      peso: 2,
      confirmada: false,
    },
  } as Partial<Record<TipoServicio, ReglaTipo>>,
};

const COLA_LABELS: Record<Cola, { uno: string; varios: string }> = {
  video: { uno: "video", varios: "videos" },
  landing: { uno: "landing", varios: "landings" },
  imagenes: { uno: "imagen", varios: "imágenes" },
};

/** Pipeline de `requerimientos` → cola de producción. */
export const PIPELINE_A_COLA: Record<string, Cola | undefined> = {
  video: "video",
  landing: "landing",
  imagenes_ads: "imagenes",
};

// ───────────────────────── Fechas (sin zona horaria) ─────────────────────────

function aUtc(fecha: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sumarDias(fecha: string, dias: number): string {
  const d = aUtc(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

export function esDiaHabil(fecha: string): boolean {
  const dia = aUtc(fecha).getUTCDay();
  return CAPACIDAD.diasHabiles.includes(dia) && !CAPACIDAD.festivos.includes(fecha);
}

/** El siguiente día hábil estrictamente después de `fecha`. */
export function siguienteDiaHabil(fecha: string): string {
  let f = sumarDias(fecha, 1);
  while (!esDiaHabil(f)) f = sumarDias(f, 1);
  return f;
}

/** Suma `n` días hábiles a `fecha` (n = 0 devuelve la misma fecha). */
export function sumarDiasHabiles(fecha: string, n: number): string {
  let f = fecha;
  for (let i = 0; i < n; i++) f = siguienteDiaHabil(f);
  return f;
}

/** Días hábiles entre dos fechas, contando `hasta` y no `desde`. */
export function diasHabilesEntre(desde: string, hasta: string): number {
  let n = 0;
  let f = desde;
  while (f < hasta) {
    f = sumarDias(f, 1);
    if (esDiaHabil(f)) n++;
  }
  return n;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** "jueves 15 de octubre" */
export function fechaLarga(fecha: string): string {
  const d = aUtc(fecha);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}

/** La fecha de hoy en Colombia, "AAAA-MM-DD". */
export function hoyEnColombia(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(ahora);
}

// ───────────────────────────── Cálculo de entrega ────────────────────────────

export type TrabajoEnCola = {
  cola: Cola;
  /** Unidades que faltan por producir. */
  unidades: number;
  estado: string;
  /** Fecha prometida al cliente, si la tiene. */
  fechaPrometida: string | null;
};

export type EntradaEntrega = {
  /** Hoy, "AAAA-MM-DD". */
  hoy: string;
  tipo: TipoServicio;
  cantidad: number;
  /** Requerimientos abiertos (todos los tipos; aquí se filtran). */
  cola: TrabajoEnCola[];
  /** Personas activas por rol, ej. { editor_video: 3, disenador_landing: 1 }. */
  equipo: Record<string, number>;
};

export type ResultadoEntrega = {
  tipo: TipoServicio;
  cantidad: number;
  /** null cuando el tipo no tiene regla de capacidad. */
  fecha: string | null;
  /** Fecha si este pedido se pasa por delante de la cola. */
  fechaSinCola: string | null;
  inicio: string | null;
  diasHabiles: number;
  diasProduccion: number;
  margenDias: number;
  unidadesEnCola: number;
  unidadesEnEspera: number;
  atrasados: number;
  personas: number;
  capacidadDia: number;
  /** true cuando la regla usada es un estimado por confirmar. */
  estimado: boolean;
  motivos: string[];
};

function diasDeProduccion(unidades: number, primerDia: number, siguientes: number): number {
  if (unidades <= primerDia) return 1;
  return 1 + Math.ceil((unidades - primerDia) / siguientes);
}

function plural(n: number, l: { uno: string; varios: string }): string {
  return `${n} ${n === 1 ? l.uno : l.varios}`;
}

export function calcularEntrega(e: EntradaEntrega): ResultadoEntrega {
  const cantidad = Math.max(1, Math.floor(e.cantidad) || 1);
  const regla = CAPACIDAD.tipos[e.tipo];

  if (!regla) {
    return {
      tipo: e.tipo, cantidad, fecha: null, fechaSinCola: null, inicio: null,
      diasHabiles: 0, diasProduccion: 0, margenDias: 0, unidadesEnCola: 0, unidadesEnEspera: 0,
      atrasados: 0, personas: 0, capacidadDia: 0, estimado: true,
      motivos: ["Este tipo de servicio no tiene regla de capacidad: la fecha hay que definirla a mano."],
    };
  }

  if (!regla.activo) {
    return {
      tipo: e.tipo, cantidad, fecha: null, fechaSinCola: null, inicio: null,
      diasHabiles: 0, diasProduccion: 0, margenDias: 0, unidadesEnCola: 0, unidadesEnEspera: 0,
      atrasados: 0, personas: 0, capacidadDia: 0, estimado: false,
      motivos: [regla.motivoInactivo ?? "Este servicio no se calcula aquí por ahora."],
    };
  }

  const motivos: string[] = [];
  const colaLabel = COLA_LABELS[regla.cola];

  const activos = e.equipo[regla.rol] ?? 0;
  const fijas = regla.personasFijas != null;
  const personas = regla.personasFijas ?? Math.max(1, activos);
  const primerDia = regla.primerDia * personas;
  const siguientes = regla.diasSiguientes * personas;

  const deEstaCola = e.cola.filter((t) => t.cola === regla.cola && t.unidades > 0);
  const enProduccion = deEstaCola.filter((t) => CAPACIDAD.estadosEnProduccion.includes(t.estado));
  const enEspera = deEstaCola.filter((t) => CAPACIDAD.estadosEnEspera.includes(t.estado));
  const unidadesEnCola = enProduccion.reduce((s, t) => s + t.unidades, 0);
  const unidadesEnEspera = enEspera.reduce((s, t) => s + t.unidades, 0);
  const atrasados = deEstaCola.filter((t) => t.fechaPrometida && t.fechaPrometida < e.hoy).length;

  const unidadesPedido = cantidad * regla.peso;
  const inicio = CAPACIDAD.empiezaHoy && esDiaHabil(e.hoy) ? e.hoy : siguienteDiaHabil(e.hoy);

  const diasProduccion = diasDeProduccion(unidadesEnCola + unidadesPedido, primerDia, siguientes);
  let fecha = sumarDiasHabiles(inicio, diasProduccion - 1 + regla.margenDias);

  const diasSinCola = diasDeProduccion(unidadesPedido, primerDia, siguientes);
  const fechaSinCola = sumarDiasHabiles(inicio, diasSinCola - 1 + regla.margenDias);

  // Si ese día ya está lleno de entregas prometidas, se corre al siguiente hábil.
  const prometidasEl = (f: string) =>
    deEstaCola.filter((t) => t.fechaPrometida === f).reduce((s, t) => s + t.unidades, 0);
  let corridos = 0;
  while (corridos < 30 && prometidasEl(fecha) >= siguientes) {
    fecha = siguienteDiaHabil(fecha);
    corridos++;
  }

  // ── Explicación ──
  const pedidoTxt =
    regla.peso === 1
      ? plural(cantidad, colaLabel)
      : `${plural(cantidad, TIPO_LABELS[e.tipo])} (cuenta como ${plural(unidadesPedido, colaLabel)})`;
  motivos.push(
    unidadesEnCola > 0
      ? `Hay ${plural(unidadesEnCola, colaLabel)} en cola y este pedido suma ${pedidoTxt}.`
      : `No hay ${colaLabel.varios} en cola: este pedido (${pedidoTxt}) entra de primero.`,
  );
  motivos.push(
    regla.primerDia === regla.diasSiguientes
      ? fijas
        ? `Capacidad: ${siguientes} por día hábil (las hace el ${regla.rolLabel.uno}; fijo).`
        : `Capacidad: ${siguientes} por día hábil (${plural(personas, regla.rolLabel)} × ${regla.diasSiguientes}).`
      : `Capacidad: ${primerDia} el primer día y ${siguientes} cada día siguiente (${plural(personas, regla.rolLabel)}).`,
  );
  motivos.push(
    `Se empieza el ${fechaLarga(inicio)}: ${diasProduccion} día(s) hábil(es) de producción + ${regla.margenDias} de revisión y entrega.`,
  );
  if (corridos > 0) motivos.push(`Ese día ya estaba lleno de entregas prometidas: se corrió ${corridos} día(s) hábil(es).`);
  if (unidadesEnEspera > 0) motivos.push(`${plural(unidadesEnEspera, colaLabel)} esperan información del cliente y no se contaron.`);
  if (atrasados > 0) motivos.push(`Ojo: ${atrasados} trabajo(s) de esta cola ya pasaron su fecha prometida.`);
  if (!fijas && activos === 0) motivos.push(`No hay ${regla.rolLabel.varios} activos en Usuarios: calculé con 1.`);
  // Festivos de Colombia: solo aviso, la fecha no se mueve.
  for (let f = inicio; f <= fecha; f = sumarDias(f, 1)) {
    if (CAPACIDAD.recordatoriosFestivos.includes(f) && esDiaHabil(f)) {
      motivos.push(`Ojo: el ${fechaLarga(f)} es festivo en Colombia (no cambia la fecha).`);
    }
  }
  if (!regla.confirmada) motivos.push("Estimado: este servicio no tiene una regla de capacidad confirmada.");

  return {
    tipo: e.tipo, cantidad, fecha, fechaSinCola, inicio,
    diasHabiles: diasHabilesEntre(e.hoy, fecha),
    diasProduccion, margenDias: regla.margenDias,
    unidadesEnCola, unidadesEnEspera, atrasados,
    personas, capacidadDia: siguientes,
    estimado: !regla.confirmada, motivos,
  };
}
