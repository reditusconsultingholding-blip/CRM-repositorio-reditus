// Estado del cargador que se muestra al cambiar entre CRM y Pulso.
// Vive fuera de React porque el cambio cruza dos layouts distintos
// ((protected) y (pulso)): el selector que recibe el clic se desmonta a
// mitad de camino y quien avisa «ya cargó» es otro componente.

export type DestinoApp = "crm" | "pulso";
export type CambioApp = { destino: DestinoApp; fase: "activa" | "saliendo" } | null;

/** Tope: pase lo que pase, el cargador se quita a los 15 s. */
export const TOPE_MS = 15_000;
/** Mínimo en pantalla, para que no sea un parpadeo si la otra app carga al instante. */
const MINIMO_MS = 650;
/** Lo que dura el fundido de salida (igual que rd-carga-sale en globals.css). */
const SALIDA_MS = 320;

let estado: CambioApp = null;
let inicio = 0;
let tTope: ReturnType<typeof setTimeout> | undefined;
let tSalida: ReturnType<typeof setTimeout> | undefined;
const oyentes = new Set<() => void>();

function publicar(nuevo: CambioApp) {
  estado = nuevo;
  oyentes.forEach((f) => f());
}

export function suscribirCambio(f: () => void) {
  oyentes.add(f);
  return () => {
    oyentes.delete(f);
  };
}

export function leerCambio(): CambioApp {
  return estado;
}

/** Muestra el cargador rumbo a `destino`. Si ya iba hacia allá, solo cancela una salida pendiente. */
export function iniciarCambio(destino: DestinoApp) {
  clearTimeout(tSalida);
  if (estado?.destino === destino && estado.fase === "activa") return;
  clearTimeout(tTope);
  inicio = Date.now();
  tTope = setTimeout(() => cambioListo(), TOPE_MS);
  publicar({ destino, fase: "activa" });
}

/** La app de destino ya está lista: se desvanece el cargador. Sin `destino` lo quita sea cual sea. */
export function cambioListo(destino?: DestinoApp) {
  if (!estado || estado.fase !== "activa") return;
  if (destino && estado.destino !== destino) return;
  const actual = estado.destino;
  const falta = Math.max(0, MINIMO_MS - (Date.now() - inicio));
  clearTimeout(tSalida);
  tSalida = setTimeout(() => {
    clearTimeout(tTope);
    publicar({ destino: actual, fase: "saliendo" });
    tSalida = setTimeout(() => publicar(null), SALIDA_MS);
  }, falta);
}
