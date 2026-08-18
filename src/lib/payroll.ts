// Costos fijos mensuales de la empresa (SaaS y similares) — ahora viven en
// la tabla gastos_fijos (ver src/lib/gastos-fijos.ts), el CEO los agrega o
// quita desde la app. Los sueldos SÍ varían por persona, ver
// user_payroll_rates / src/lib/payroll-checklist.ts en vez de este archivo.

// Trabajamos semanas de 6 días y meses de ~28 días — 4 semanas por mes,
// no el promedio calendario (52/12 ≈ 4.345) que no aplica a este negocio.
export const SEMANAS_POR_MES = 4;
