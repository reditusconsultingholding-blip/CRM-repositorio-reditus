// Costos fijos mensuales de la empresa (SaaS) — no varían por persona.
// Los sueldos SÍ varían por persona, ver user_payroll_rates /
// src/lib/payroll-checklist.ts en vez de este archivo.
export type PayrollSettings = {
  elevenLabsUsdMes: number;
  googleStorageUsdMes: number;
};

export const DEFAULT_PAYROLL: PayrollSettings = {
  elevenLabsUsdMes: 12,
  googleStorageUsdMes: 30,
};

export const SEMANAS_POR_MES = 52 / 12; // ≈ 4.345 — para prorratear fijos mensuales a la semana.

export function fijosMensualesUsd(p: PayrollSettings = DEFAULT_PAYROLL) {
  return p.elevenLabsUsdMes + p.googleStorageUsdMes;
}
