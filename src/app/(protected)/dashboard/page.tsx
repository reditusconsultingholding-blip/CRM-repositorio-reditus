import Link from "next/link";
import { ArrowRight, CalendarClock, ClipboardCheck, TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile, INGRESOS_ROLES } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthCalendar, type DiaData, type DiaDetalle } from "@/components/dashboard/month-calendar";
import { LiveSync } from "@/components/live-sync";
import { AsistenteEntrega } from "@/components/asistente-entrega/asistente-entrega";
import { RevenueExplorer } from "@/components/dashboard/revenue-explorer";
import { getUsdCopRate, ingresoToUsd } from "@/lib/ceo-report";
import { PIPELINES } from "@/lib/statuses";
import { cn } from "@/lib/utils";

function normalizeJoin<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// «Hoy» y «ayer» se cuentan con el día de Colombia, no con el del servidor
// (UTC): si no, después de las 7 p. m. el tablero ya mostraba el día siguiente.
const ZONA = "America/Bogota";
function diaEnZona(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ZONA }).format(d); // YYYY-MM-DD
}
function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function diasEntre(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}

export default async function DashboardPage() {
  const profile = await requireProfile();
  const supabase = await createClient();
  const canSeeIngresos = (INGRESOS_ROLES as string[]).includes(profile.role);

  const now = new Date();
  const today = diaEnZona(now);
  const yesterday = sumarDias(today, -1);
  const [anio, mes] = today.split("-").map(Number);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = mes === 12 ? `${anio + 1}-01-01` : `${anio}-${String(mes + 1).padStart(2, "0")}-01`;

  const [
    ingresosHoy,
    ingresosAyer,
    ingresosMes,
    entregasDelMes,
    recordatoriosDelMes,
    proximasEntregas,
    pipelineCounts,
    usdCop,
  ] = await Promise.all([
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("precio_final_descuento, moneda", { count: "exact" })
          .eq("estado_comercial", "Cerrado")
          .eq("fecha", today)
      : Promise.resolve({ data: [], count: 0 }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("precio_final_descuento, moneda", { count: "exact" })
          .eq("estado_comercial", "Cerrado")
          .eq("fecha", yesterday)
      : Promise.resolve({ data: [], count: 0 }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("fecha, producto, precio_final_descuento, moneda, client:clients!ingresos_client_id_fkey(name)")
          .eq("estado_comercial", "Cerrado")
          .gte("fecha", monthStart)
          .lt("fecha", monthEnd)
      : Promise.resolve({ data: [] }),
    canSeeIngresos
      ? supabase
          .from("requerimientos")
          .select(
            "nombre_producto, pipeline, f_entrega_prometida, encargado:users!requerimientos_encargado_id_fkey(name), ingreso:ingresos(client:clients!ingresos_client_id_fkey(name))",
          )
          .not("estado", "in", '("ENTREGADO","Terminado")')
          .not("f_entrega_prometida", "is", null)
          .gte("f_entrega_prometida", monthStart)
          .lt("f_entrega_prometida", monthEnd)
      : Promise.resolve({ data: [] }),
    canSeeIngresos
      ? supabase
          .from("ingresos")
          .select("producto, recordatorio_fecha, recordatorio_nota, recordatorio_enviado, client:clients!ingresos_client_id_fkey(name)")
          .not("recordatorio_fecha", "is", null)
          .gte("recordatorio_fecha", monthStart)
          .lt("recordatorio_fecha", monthEnd)
      : Promise.resolve({ data: [] }),
    // Calendario de entregas: lo que sigue abierto con fecha prometida, lo
    // más urgente primero (incluye lo atrasado). Es producción, no dinero:
    // lo ve todo el equipo, con los mismos permisos de Requerimientos.
    supabase
      .from("requerimientos")
      .select(
        "id, nombre_producto, pipeline, estado, f_entrega_prometida, encargado:users!requerimientos_encargado_id_fkey(name), ingreso:ingresos(client:clients!ingresos_client_id_fkey(name))",
      )
      .not("estado", "in", '("ENTREGADO","Terminado")')
      .not("f_entrega_prometida", "is", null)
      .order("f_entrega_prometida", { ascending: true })
      .limit(60),
    // Un card por pipeline, generado desde PIPELINES en vez de una
    // consulta hardcodeada por cada uno — así un pipeline nuevo (ej.
    // "Imágenes Ads") aparece solo, sin tener que acordarse de duplicar
    // esto en cuatro sitios distintos.
    Promise.all(
      PIPELINES.map(async (p) => {
        const [abiertos, total] = await Promise.all([
          supabase
            .from("requerimientos")
            .select("id", { count: "exact", head: true })
            .eq("pipeline", p.value)
            .not("estado", "in", '("ENTREGADO","Terminado")'),
          supabase.from("requerimientos").select("id", { count: "exact", head: true }).eq("pipeline", p.value),
        ]);
        return { pipeline: p.value, label: p.label, abiertos: abiertos.count ?? 0, total: total.count ?? 0 };
      }),
    ),
    getUsdCopRate(),
  ]);

  const rateCop = usdCop ?? 4000;

  function fmtCop(n: number) {
    return `${Math.round(n * rateCop).toLocaleString("es-CO")} COP`;
  }
  function fmtUsd(n: number) {
    return n.toLocaleString("es-CO", { style: "currency", currency: "USD" });
  }

  const totalHoy =
    (ingresosHoy.data ?? []).reduce(
      (sum, r) => sum + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
      0,
    ) || 0;
  const totalAyer =
    (ingresosAyer.data ?? []).reduce(
      (sum, r) => sum + ingresoToUsd(r.precio_final_descuento, r.moneda, rateCop),
      0,
    ) || 0;
  const pedidosHoy = ingresosHoy.count ?? 0;
  const pedidosAyer = ingresosAyer.count ?? 0;

  const calendarData: Record<string, DiaData> = {};
  const detalle: Record<string, DiaDetalle> = {};
  function getDetalle(key: string): DiaDetalle {
    if (!detalle[key]) detalle[key] = { ingresos: [], entregas: [], recordatorios: [] };
    return detalle[key];
  }

  let totalMes = 0;
  for (const row of ingresosMes.data ?? []) {
    const key = row.fecha as string;
    const monto = ingresoToUsd(row.precio_final_descuento, row.moneda, rateCop);
    totalMes += monto;
    if (!calendarData[key]) calendarData[key] = { count: 0, total: 0 };
    calendarData[key].count += 1;
    calendarData[key].total += monto;

    const cliente = normalizeJoin(row.client)?.name ?? "Cliente";
    getDetalle(key).ingresos.push({ cliente, producto: row.producto ?? "—", monto });
  }

  for (const row of entregasDelMes.data ?? []) {
    const key = String(row.f_entrega_prometida);
    const pipelineLabel = PIPELINES.find((p) => p.value === row.pipeline)?.label ?? row.pipeline;
    const cliente = normalizeJoin(normalizeJoin(row.ingreso)?.client)?.name ?? "Cliente";
    getDetalle(key).entregas.push({
      producto: row.nombre_producto,
      cliente,
      pipeline: pipelineLabel,
      encargado: normalizeJoin(row.encargado)?.name ?? null,
    });
  }

  for (const row of recordatoriosDelMes.data ?? []) {
    const key = String(row.recordatorio_fecha).slice(0, 10);
    const cliente = normalizeJoin(row.client)?.name ?? "Cliente";
    getDetalle(key).recordatorios.push({
      nota: row.recordatorio_nota,
      producto: row.producto ?? "—",
      cliente,
      enviado: row.recordatorio_enviado,
    });
  }

  // ---- Calendario de entregas e informe de hoy ----
  const entregas = (proximasEntregas.data ?? []).map((row) => {
    const fecha = String(row.f_entrega_prometida).slice(0, 10);
    return {
      id: row.id as string,
      fecha,
      dias: diasEntre(today, fecha), // <0 atrasada · 0 hoy · 1 mañana
      producto: row.nombre_producto as string,
      pipeline: PIPELINES.find((p) => p.value === row.pipeline)?.label ?? String(row.pipeline),
      estado: row.estado as string,
      encargado: normalizeJoin(row.encargado)?.name ?? null,
      cliente: normalizeJoin(normalizeJoin(row.ingreso)?.client)?.name ?? null,
    };
  });
  const atrasadas = entregas.filter((e) => e.dias < 0).length;
  const entregasHoy = entregas.filter((e) => e.dias === 0).length;
  const entregasSemana = entregas.filter((e) => e.dias > 0 && e.dias <= 7).length;
  const ENTREGAS_VISIBLES = 7;
  const entregasVisibles = entregas.slice(0, ENTREGAS_VISIBLES);
  const enCurso = pipelineCounts.reduce((s, p) => s + p.abiertos, 0);
  const recordatoriosHoy = (detalle[today]?.recordatorios ?? []).filter((r) => !r.enviado).length;
  // Trabajos abiertos que no aparecen en el calendario porque nadie les puso fecha prometida.
  const sinFecha = entregas.length < 60 ? Math.max(0, enCurso - entregas.length) : 0;

  const diferencia = totalHoy - totalAyer;
  const fechaLarga = now.toLocaleDateString("es-CO", { timeZone: ZONA, weekday: "long", day: "numeric", month: "long" });
  const fechaAyer = new Date(`${yesterday}T12:00:00Z`).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const informe: { texto: string; valor: string; alerta?: boolean; href: string }[] = [
    ...(canSeeIngresos
      ? [{ texto: "Pedidos cerrados hoy", valor: `${pedidosHoy}`, href: "/ingresos" }]
      : []),
    { texto: "Entregas para hoy", valor: `${entregasHoy}`, href: "/requerimientos" },
    { texto: "Entregas atrasadas", valor: `${atrasadas}`, alerta: atrasadas > 0, href: "/requerimientos" },
    { texto: "Entregas en los próximos 7 días", valor: `${entregasSemana}`, href: "/requerimientos" },
    ...(canSeeIngresos
      ? [{ texto: "Recordatorios pendientes de hoy", valor: `${recordatoriosHoy}`, alerta: recordatoriosHoy > 0, href: "/ingresos" }]
      : []),
    { texto: "Trabajos en curso", valor: `${enCurso}`, href: "/requerimientos" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">
            Hola, {profile.name.split(" ")[0]}
          </h1>
          <p className="mt-1 pl-[0.85rem] text-sm text-muted-foreground first-letter:uppercase">{fechaLarga}</p>
        </div>
        {canSeeIngresos && <AsistenteEntrega className="ml-auto" />}
        <LiveSync tables={["ingresos", "requerimientos"]} />
      </div>

      {/* 1 · Hoy y ayer, de un vistazo (solo quien ve Ingresos ve dinero) */}
      {canSeeIngresos && (
        <section aria-label="Ingresos de hoy y de ayer" className="grid gap-4 md:grid-cols-[1.35fr_1fr_1fr]">
          <Card className="border-primary/40">
            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <p className="rd-etiqueta text-primary">Hoy</p>
                {(totalHoy > 0 || totalAyer > 0) && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-medium",
                      diferencia >= 0 ? "bg-green-100 text-green-900" : "bg-red-100 text-red-900",
                    )}
                    title="Diferencia frente a ayer"
                  >
                    {diferencia >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                    {diferencia >= 0 ? "+" : "−"}
                    {fmtUsd(Math.abs(diferencia))} vs. ayer
                  </span>
                )}
              </div>
              <p className="font-heading text-4xl font-semibold tracking-tight tabular-nums">{fmtCop(totalHoy)}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fmtUsd(totalHoy)}</span> · {pedidosHoy} pedido(s)
                registrados hoy
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="rd-etiqueta text-muted-foreground">Ayer</p>
              <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{fmtCop(totalAyer)}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fmtUsd(totalAyer)}</span> · {pedidosAyer} pedido(s)
              </p>
              <p className="text-xs text-muted-foreground first-letter:uppercase">{fechaAyer}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-1">
              <p className="rd-etiqueta text-muted-foreground">Este mes</p>
              <p className="font-heading text-2xl font-semibold tracking-tight tabular-nums">{fmtCop(totalMes)}</p>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{fmtUsd(totalMes)}</span> ·{" "}
                {(ingresosMes.data ?? []).length} pedido(s) este mes
              </p>
            </CardContent>
          </Card>
        </section>
      )}

      {/* 2 · Informe de hoy + calendario de entregas */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardCheck className="size-4 text-primary" />
              Informe de hoy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y">
              {informe.map((f) => (
                <li key={f.texto}>
                  <Link
                    href={f.href}
                    className="flex items-center justify-between gap-3 py-2.5 text-sm transition-colors hover:text-primary"
                  >
                    <span className="text-muted-foreground">{f.texto}</span>
                    <span
                      className={cn(
                        "min-w-9 rounded-lg px-2 py-0.5 text-center font-mono text-base font-semibold tabular-nums",
                        f.alerta ? "bg-red-100 text-red-900" : "bg-muted text-foreground",
                      )}
                    >
                      {f.valor}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="size-4 text-primary" />
              Calendario de entregas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {entregasVisibles.length === 0 ? (
              <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                No hay entregas prometidas pendientes.
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {entregasVisibles.map((e) => {
                  const f = new Date(`${e.fecha}T12:00:00Z`);
                  const cuando =
                    e.dias < 0
                      ? `Atrasada ${-e.dias} día(s)`
                      : e.dias === 0
                        ? "Hoy"
                        : e.dias === 1
                          ? "Mañana"
                          : `En ${e.dias} días`;
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/requerimientos/${e.id}`}
                        className="flex items-center gap-3 rounded-xl border bg-card/60 p-2 transition-colors hover:border-ring/70"
                      >
                        <span
                          className={cn(
                            "flex w-12 shrink-0 flex-col items-center rounded-lg py-1 leading-none",
                            e.dias < 0
                              ? "bg-red-100 text-red-900"
                              : e.dias === 0
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted text-foreground",
                          )}
                        >
                          <span className="rd-etiqueta text-[9px] tracking-[0.12em]">
                            {f.toLocaleDateString("es-CO", { timeZone: "UTC", month: "short" }).replace(".", "")}
                          </span>
                          <span className="mt-0.5 font-heading text-lg font-semibold tabular-nums">{f.getUTCDate()}</span>
                        </span>
                        <span className="min-w-0 flex-1 leading-tight">
                          <span className="block truncate text-sm font-medium">{e.producto}</span>
                          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                            {[e.cliente, e.pipeline, e.encargado ?? "Sin encargado"].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
                            e.dias < 0
                              ? "bg-red-100 text-red-900"
                              : e.dias <= 1
                                ? "bg-amber-100 text-amber-900"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {cuando}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
            {sinFecha > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {sinFecha} trabajo(s) en curso no tienen fecha de entrega prometida, por eso no salen aquí.
              </p>
            )}
            <Link
              href="/requerimientos"
              className="flex w-fit items-center gap-1 self-end text-xs font-medium text-primary hover:underline"
            >
              {entregas.length > ENTREGAS_VISIBLES
                ? `Ver las ${entregas.length} entregas pendientes`
                : "Ver todos los requerimientos"}
              <ArrowRight className="size-3" />
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* 3 · Producción en curso por línea */}
      <section aria-label="Producción en curso" className="flex flex-col gap-2">
        <h2 className="rd-etiqueta text-muted-foreground">Producción en curso</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {pipelineCounts.map((p) => (
            <Card key={p.pipeline} size="sm">
              <CardContent className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-sm font-medium">{p.label} en curso</span>
                  <span className="block text-xs text-muted-foreground">de {p.total} totales</span>
                </span>
                <span className="font-heading text-2xl font-semibold tabular-nums">{p.abiertos}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* 4 · Detalle: consulta por fechas y calendario del mes */}
      {canSeeIngresos && <RevenueExplorer />}

      {canSeeIngresos && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ingresos de{" "}
              {now.toLocaleDateString("es-CO", { timeZone: ZONA, month: "long", year: "numeric" })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthCalendar year={anio} month={mes - 1} data={calendarData} detalle={detalle} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
