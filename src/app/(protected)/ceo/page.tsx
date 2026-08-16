import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { computeCeoReport } from "@/lib/ceo-report";
import { getPayrollSettings } from "@/lib/payroll-settings";
import { getWeeklyPayrollChecklist } from "@/lib/payroll-checklist";
import { SEMANAS_POR_MES } from "@/lib/payroll";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CeoAssistant } from "@/components/ceo/ceo-assistant";
import { PayrollSettingsForm } from "@/components/ceo/payroll-settings-form";
import { PayrollChecklist } from "@/components/ceo/payroll-checklist";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default async function CeoPage() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") redirect("/dashboard");

  const [r, payrollSettings, checklist] = await Promise.all([
    computeCeoReport(),
    getPayrollSettings(),
    getWeeklyPayrollChecklist(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Panel CEO</h1>
        <p className="text-sm text-muted-foreground">Visible solo para ti.</p>
      </div>

      <Tabs defaultValue="rentabilidad">
        <TabsList>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="nomina">Nómina</TabsTrigger>
          <TabsTrigger value="checklist">Checklist de pago</TabsTrigger>
          <TabsTrigger value="asistente">Asistente CEO</TabsTrigger>
        </TabsList>

        <TabsContent value="rentabilidad" className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Esta semana</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Ingresos (ventas)" value={fmtUsd(r.ingresosSemanaUsd)} />
                <Row label="Salarios fijos (diseñadora, GC, PM)" value={`-${fmtUsd(r.costoFijoSemanal)}`} />
                <Row label="Costos fijos SaaS (prorrateado)" value={`-${fmtUsd(r.costoFijoProrrateadoSemana)}`} />
                <Row
                  label={`Editor de video (${r.videosSemana} entregados × $${r.editorVideoUsdPorVideo})`}
                  value={`-${fmtUsd(r.costoVideoSemana)}`}
                />
                <Row
                  label={`Programador (${r.landingsSemana} páginas × ${fmtUsd(r.programadorCopPorPagina / r.rateCop)})`}
                  value={`-${fmtUsd(r.costoProgramadorSemanaUsd)}`}
                />
                <Separator className="my-1" />
                <Row label="Costo total" value={`-${fmtUsd(r.costoTotalSemana)}`} bold />
                <Row label="Rentabilidad" value={fmtUsd(r.rentabilidadSemana)} bold positive={r.rentabilidadSemana >= 0} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Este mes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <Row label="Ingresos (ventas)" value={fmtUsd(r.ingresosMesUsd)} />
                <Row
                  label="Salarios fijos (aprox., 4.345 semanas)"
                  value={`-${fmtUsd(r.costoFijoSemanal * SEMANAS_POR_MES)}`}
                />
                <Row label="Costos fijos SaaS (ElevenLabs + Google Storage)" value={`-${fmtUsd(r.costoFijoMensual)}`} />
                <Row
                  label={`Editor de video (${r.videosMes} entregados × $${r.editorVideoUsdPorVideo})`}
                  value={`-${fmtUsd(r.costoVideoMes)}`}
                />
                <Row
                  label={`Programador (${r.landingsMes} páginas × ${fmtUsd(r.programadorCopPorPagina / r.rateCop)})`}
                  value={`-${fmtUsd(r.costoProgramadorMesUsd)}`}
                />
                <Separator className="my-1" />
                <Row label="Costo total" value={`-${fmtUsd(r.costoTotalMes)}`} bold />
                <Row label="Rentabilidad" value={fmtUsd(r.rentabilidadMes)} bold positive={r.rentabilidadMes >= 0} />
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            Tasa USD→COP usada: {Math.round(r.rateCop).toLocaleString("es-CO")}
            {!r.rateCopIsLive && " (no se pudo consultar en vivo, se usó un valor de respaldo)"}.{" "}
            &quot;Entregado&quot; = requerimiento en estado &quot;Terminado&quot; esta semana/mes.
          </p>
        </TabsContent>

        <TabsContent value="nomina">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Nómina y costos fijos</CardTitle>
              <PayrollSettingsForm settings={payrollSettings} />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Row label="Diseñadora Landing" value={`$${payrollSettings.disenadoraLandingUsdDia}/día`} />
              <Row label="Gerente Comercial" value={`$${payrollSettings.gerenteComercialUsdDia}/día`} />
              <Row label="Directora Operativa" value={`$${payrollSettings.projectManagerUsdDia}/día`} />
              <Row label="Días/semana" value={`${payrollSettings.diasPorSemana}`} />
              <Row label="Editor de Video" value={`$${payrollSettings.editorVideoUsdPorVideo}/video`} />
              <Row
                label="Programador"
                value={`${fmtUsd(payrollSettings.programadorCopPorPagina / r.rateCop)}/página`}
              />
              <Row label="ElevenLabs" value={`$${payrollSettings.elevenLabsUsdMes}/mes`} />
              <Row label="Google Storage" value={`$${payrollSettings.googleStorageUsdMes}/mes`} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="checklist">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checklist de pago — semana pasada</CardTitle>
            </CardHeader>
            <CardContent>
              <PayrollChecklist
                weekStart={checklist.weekStart}
                weekEnd={checklist.weekEnd}
                dueDate={checklist.dueDate}
                items={checklist.items}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="asistente">
          <CeoAssistant />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  positive,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={bold ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span
        className={`font-mono ${bold ? "font-semibold" : ""} ${
          positive === true ? "text-green-600" : positive === false ? "text-red-600" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
