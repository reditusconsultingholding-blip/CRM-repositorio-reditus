// Cifras de nómina/costos confirmadas por Sebastian (2026-08-15). Si cambian,
// solo hay que actualizar este archivo — todo el panel CEO las lee de aquí.
export const PAYROLL = {
  // Salarios fijos (USD/día), 6 días a la semana.
  disenadoraLandingUsdDia: 26.5,
  gerenteComercialUsdDia: 16.66,
  projectManagerUsdDia: 14.66, // Directora Operativa
  diasPorSemana: 6,

  // Costos por pieza entregada.
  editorVideoUsdPorVideo: 6,
  programadorCopPorPagina: 20000,

  // Costos fijos mensuales (USD).
  elevenLabsUsdMes: 12,
  googleStorageUsdMes: 30,
} as const;

export const SEMANAS_POR_MES = 52 / 12; // ≈ 4.345 — para prorratear fijos mensuales a la semana.

export function salarioFijoSemanal() {
  const { disenadoraLandingUsdDia, gerenteComercialUsdDia, projectManagerUsdDia, diasPorSemana } =
    PAYROLL;
  return (
    (disenadoraLandingUsdDia + gerenteComercialUsdDia + projectManagerUsdDia) * diasPorSemana
  );
}

export function fijosMensualesUsd() {
  return PAYROLL.elevenLabsUsdMes + PAYROLL.googleStorageUsdMes;
}
