// Valores de nómina/costos por defecto — se usan solo si la tabla
// payroll_settings todavía no existe o está vacía (antes de correr la
// migración 0007, o si falla la consulta). Una vez migrada, el CEO edita
// estos valores desde /ceo y quedan guardados en la base de datos —
// ver src/lib/payroll-settings.ts.
export type PayrollSettings = {
  disenadoraLandingUsdDia: number;
  gerenteComercialUsdDia: number;
  projectManagerUsdDia: number;
  diasPorSemana: number;
  editorVideoUsdPorVideo: number;
  programadorCopPorPagina: number;
  elevenLabsUsdMes: number;
  googleStorageUsdMes: number;
};

export const DEFAULT_PAYROLL: PayrollSettings = {
  disenadoraLandingUsdDia: 26.5,
  gerenteComercialUsdDia: 16.66,
  projectManagerUsdDia: 14.66, // Directora Operativa
  diasPorSemana: 6,
  editorVideoUsdPorVideo: 6,
  programadorCopPorPagina: 20000,
  elevenLabsUsdMes: 12,
  googleStorageUsdMes: 30,
};

export const SEMANAS_POR_MES = 52 / 12; // ≈ 4.345 — para prorratear fijos mensuales a la semana.

export function salarioFijoSemanal(p: PayrollSettings = DEFAULT_PAYROLL) {
  return (
    (p.disenadoraLandingUsdDia + p.gerenteComercialUsdDia + p.projectManagerUsdDia) *
    p.diasPorSemana
  );
}

export function fijosMensualesUsd(p: PayrollSettings = DEFAULT_PAYROLL) {
  return p.elevenLabsUsdMes + p.googleStorageUsdMes;
}
