import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeCeoReport } from "@/lib/ceo-report";
import { getPayrollSettings } from "@/lib/payroll-settings";
import { getWeeklyPayrollChecklist } from "@/lib/payroll-checklist";
import { listVaultEntries } from "@/lib/vault-actions";
import { SEMANAS_POR_MES } from "@/lib/payroll";
import { ROLE_LABELS } from "@/lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CeoAssistant } from "@/components/ceo/ceo-assistant";
import { PayrollSettingsForm } from "@/components/ceo/payroll-settings-form";
import { PayrollRatesTable, type PersonRate } from "@/components/ceo/payroll-rates-table";
import { PayrollChecklist } from "@/components/ceo/payroll-checklist";
import { CredentialsVault } from "@/components/ceo/credentials-vault";
import { LiveSync } from "@/components/live-sync";

function fmtUsd(n: number) {
  return n.toLocaleString("es-CO", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export default async function CeoPage() {
  const profile = await requireProfile();
  if (profile.role !== "ceo") redirect("/dashboard");

  const supabase = await createClient();

  const [r, payrollSettings, checklist, { data: users }, { data: rates }, vaultEntries] = await Promise.all([
    computeCeoReport(),
    getPayrollSettings(),
    getWeeklyPayrollChecklist(),
    supabase.from("users").select("id, name, role").eq("active", true).neq("role", "ceo").order("name"),
    supabase.from("user_payroll_rates").select("user_id, modo, monto, moneda"),
    listVaultEntries().catch(() => []),
  ]);

  const rateByUser = new Map((rates ?? []).map((rt) => [rt.user_id, rt]));
  const people: PersonRate[] = (users ?? []).map((u) => {
    const rt = rateByUser.get(u.id);
    return {
      userId: u.id,
      name: u.name,
      role: ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] ?? u.role,
      modo: (rt?.modo as PersonRate["modo"]) ?? null,
      monto: rt ? Number(rt.monto) : null,
      moneda: (rt?.moneda as PersonRate["moneda"]) ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Panel CEO</h1>
          <p className="text-sm text-muted-foreground">Visible solo para ti.</p>
        </div>
        <LiveSync tables={["ingresos", "requerimientos", "user_payroll_rates"]} />
      </div>

      <Tabs defaultValue="rentabilidad">
        <TabsList>
          <TabsTrigger value="rentabilidad">Rentabilidad</TabsTrigger>
          <TabsTrigger value="nomina">Nómina</TabsTrigger>
          <TabsTrigger value="checklist">Checklist de pago</TabsTrigger>
          <TabsTrigger value="contrasenas">Contraseñas</TabsTrigger>
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
                <Row label="Salarios fijos (semanales)" value={`-${fmtUsd(r.costoFijoSemanal)}`} />
                <Row label="Costos fijos SaaS (prorrateado)" value={`-${fmtUsd(r.costoFijoProrrateadoSemana)}`} />
                <Row
                  label={`Editores de video (${r.videosSemana} entregados)`}
                  value={`-${fmtUsd(r.costoVideoSemana)}`}
                />
                <Row
                  label={`Programadores (${r.landingsSemana} páginas)`}
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
                  label={`Editores de video (${r.videosMes} entregados)`}
                  value={`-${fmtUsd(r.costoVideoMes)}`}
                />
                <Row
                  label={`Programadores (${r.landingsMes} páginas)`}
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

        <TabsContent value="nomina" className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nómina por persona</CardTitle>
              <p className="text-xs text-muted-foreground">
                Cada persona tiene su propia tarifa — &quot;Semanal fijo&quot; para un sueldo fijo, o
                &quot;Por pieza&quot; para pagar por video (Editor de Video) o por página publicada
                (Programador).
              </p>
            </CardHeader>
            <CardContent>
              <PayrollRatesTable people={people} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Costos fijos de SaaS</CardTitle>
              <PayrollSettingsForm settings={payrollSettings} />
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2 text-sm">
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
            <CardContent className="flex flex-col gap-3">
              <PayrollChecklist
                weekStart={checklist.weekStart}
                weekEnd={checklist.weekEnd}
                limitDate={checklist.limitDate}
                items={checklist.items}
              />
              {checklist.sinConfigurar.length > 0 && (
                <p className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900">
                  Sin tarifa configurada (no aparecen en el checklist):{" "}
                  {checklist.sinConfigurar.map((p) => p.name).join(", ")}. Configúrala en la pestaña
                  Nómina.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contrasenas">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bóveda de contraseñas</CardTitle>
            </CardHeader>
            <CardContent>
              <CredentialsVault entries={vaultEntries} />
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
