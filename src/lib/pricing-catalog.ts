// Tabla de precios oficial de Reditus Consulting, del Documento Maestro
// Comercial y Operativo. Tasa de referencia COMERCIAL (para cotizar) — NO
// es la tasa de mercado en vivo que usa el Panel CEO para convertir costos;
// esta es la tasa fija con la que la empresa arma sus precios en USD.
export const REFERENCE_RATE_COP = 3111;

export const LANDING_PRICE_COP = 355000;
export const VIDEO_PRICE_COP = 65000;
export const HOOK_ADICIONAL_USD = 2.85;
export const IMAGEN_PUBLICITARIA_USD = 5.75;

type Tier = { minUnidades: number; unitarioCop: number };

// Precio por unidad según cantidad — de mayor a menor para que el primer
// tier que cumpla "cantidad >= minUnidades" sea el correcto.
const LANDING_TIERS: Tier[] = [
  { minUnidades: 25, unitarioCop: 266250 },
  { minUnidades: 16, unitarioCop: 298200 },
  { minUnidades: 10, unitarioCop: 319500 },
  { minUnidades: 6, unitarioCop: 333700 },
  { minUnidades: 3, unitarioCop: 344350 },
  { minUnidades: 1, unitarioCop: 355000 },
];

const VIDEO_TIERS: Tier[] = [
  { minUnidades: 100, unitarioCop: 32500 },
  { minUnidades: 50, unitarioCop: 39000 },
  { minUnidades: 30, unitarioCop: 45500 },
  { minUnidades: 20, unitarioCop: 52000 },
  { minUnidades: 10, unitarioCop: 58500 },
  { minUnidades: 5, unitarioCop: 61750 },
  { minUnidades: 1, unitarioCop: 65000 },
];

function tierUnitCop(tiers: Tier[], cantidad: number): number {
  const tier = tiers.find((t) => cantidad >= t.minUnidades);
  return tier ? tier.unitarioCop : tiers[tiers.length - 1].unitarioCop;
}

function copToUsd(cop: number): number {
  return Math.round((cop / REFERENCE_RATE_COP) * 100) / 100;
}

/** Precio unitario oficial en USD para landing pages, según la cantidad
 * del pedido (aplica el descuento por volumen automáticamente). */
export function landingUnitPriceUsd(cantidad: number): number {
  return copToUsd(tierUnitCop(LANDING_TIERS, cantidad));
}

/** Precio unitario oficial en USD para videos convencionales, según la
 * cantidad del pedido. */
export function videoUnitPriceUsd(cantidad: number): number {
  return copToUsd(tierUnitCop(VIDEO_TIERS, cantidad));
}

/** Intenta adivinar el precio unitario oficial a partir del texto del
 * producto/servicio — usado por la herramienta de cotización por chat
 * cuando el CEO no da un precio explícito. Devuelve null si no reconoce
 * el tipo de servicio (en ese caso, el precio debe darse manualmente). */
export function guessUnitPriceUsd(texto: string, cantidad: number): number | null {
  const t = texto.toLowerCase();
  if (t.includes("landing") || t.includes("página") || t.includes("pagina")) {
    return landingUnitPriceUsd(cantidad);
  }
  if (t.includes("video")) {
    return videoUnitPriceUsd(cantidad);
  }
  if (t.includes("hook")) return HOOK_ADICIONAL_USD;
  if (t.includes("imagen")) return IMAGEN_PUBLICITARIA_USD;
  return null;
}
