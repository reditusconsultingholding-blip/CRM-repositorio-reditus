import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Eye, ListChecks, SlidersHorizontal } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import {
  DIAS_CORTOS,
  contar,
  diaSemana,
  diasDeSemana,
  esFecha,
  fechaCorta,
  fechaLarga,
  hoyBogota,
  lunesDe,
  puedeSupervisar,
  sumarDias,
  tieneSecuencia,
  type Persona,
} from "@/lib/seguimiento";
import { cargarDia, cargarSemana, conSecuencia, equipoActivo, leerPlantillaGuardada, type SemanaPersona } from "@/lib/seguimiento-server";
import { Card, CardContent } from "@/components/ui/card";
import { MiDia } from "@/components/seguimiento/mi-dia";
import { Supervision } from "@/components/seguimiento/supervision";
import { EditorPlantilla } from "@/components/seguimiento/editor-plantilla";
import { Barra, Chip, tonoPct } from "@/components/seguimiento/piezas";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguimiento diario · Reditus" };

type Vista = "hoy" | "supervision" | "semana" | "plantilla";

function uno(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

export default async function SeguimientoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const perfil = await requireProfile();
  const q = await searchParams;
  const admin = createAdminClient();
  const yo: Persona = { id: perfil.id, name: perfil.name, role: perfil.role };
  const hoy = hoyBogota();
  const [plantilla, equipo] = await Promise.all([leerPlantillaGuardada(admin), equipoActivo(admin)]);

  const esCeo = yo.role === "ceo";
  const tengoSecuencia = tieneSecuencia(plantilla, yo);
  const aCargo = conSecuencia(plantilla, equipo).filter((p) => p.id !== yo.id && puedeSupervisar(plantilla, yo, p));
  const superviso = esCeo || aCargo.length > 0;

  const pestanas: { id: Vista; texto: string; icono: typeof ListChecks }[] = [
    ...(tengoSecuencia || !superviso ? [{ id: "hoy" as const, texto: "Mi día", icono: ListChecks }] : []),
    ...(superviso ? [{ id: "supervision" as const, texto: "Supervisión", icono: Eye }] : []),
    ...(esCeo ? [{ id: "semana" as const, texto: "Semana", icono: CalendarDays }, { id: "plantilla" as const, texto: "Plantilla", icono: SlidersHorizontal }] : []),
  ];
  const pedida = uno(q.vista) as Vista;
  const vista: Vista = pestanas.some((p) => p.id === pedida) ? pedida : pestanas[0].id;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Seguimiento diario</h1>
        <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">
          {fechaLarga(hoy)} · cada tarea se entrega con su evidencia
        </p>
      </div>

      {pestanas.length > 1 && (
        <nav aria-label="Vistas de seguimiento" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {pestanas.map((p) => {
            const Icono = p.icono;
            const activa = p.id === vista;
            return (
              <Link
                key={p.id}
                href={`/seguimiento?vista=${p.id}`}
                aria-current={activa ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
                  activa ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icono className="size-4" /> {p.texto}
              </Link>
            );
          })}
        </nav>
      )}

      {vista === "hoy" && <VistaHoy admin={admin} plantilla={plantilla} yo={yo} hoy={hoy} tengoSecuencia={tengoSecuencia} />}
      {vista === "supervision" && (
        <VistaSupervision admin={admin} plantilla={plantilla} aCargo={aCargo} hoy={hoy} dia={uno(q.dia)} persona={uno(q.persona)} />
      )}
      {vista === "semana" && <VistaSemana admin={admin} plantilla={plantilla} personas={conSecuencia(plantilla, equipo)} hoy={hoy} semana={uno(q.semana)} />}
      {vista === "plantilla" && <EditorPlantilla inicial={plantilla} equipo={equipo} />}
    </div>
  );
}

type Comun = { admin: ReturnType<typeof createAdminClient>; plantilla: Awaited<ReturnType<typeof leerPlantillaGuardada>>; hoy: string };

// ------------------------------------------------------------ mi día ----

async function VistaHoy({ admin, plantilla, yo, hoy, tengoSecuencia }: Comun & { yo: Persona; tengoSecuencia: boolean }) {
  if (!tengoSecuencia) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-1">
          <p className="font-medium">Todavía no tienes una secuencia diaria asignada.</p>
          <p className="text-sm text-muted-foreground">
            Cuando el CEO arme la de tu rol ({ROLE_LABELS[yo.role]}), tus tareas del día van a aparecer aquí con sus instrucciones.
          </p>
        </CardContent>
      </Card>
    );
  }
  const [dia, [semana]] = await Promise.all([cargarDia(admin, plantilla, yo, hoy), cargarSemana(admin, plantilla, [yo], lunesDe(hoy))]);
  return (
    <div className="flex flex-col gap-4">
      <TiraSemana semana={semana} umbral={plantilla.umbral} hoy={hoy} />
      {dia.tareas.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {diaSemana(hoy) === 7 ? "Hoy es domingo: no hay secuencia. Nos vemos el lunes." : "Hoy no tienes tareas en tu secuencia."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <MiDia dia={dia} />
      )}
    </div>
  );
}

/** Lunes a sábado de una persona, en una tira que cabe en el celular. */
function TiraSemana({ semana, umbral, hoy, enlaces = false }: { semana: SemanaPersona; umbral: number; hoy: string; enlaces?: boolean }) {
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {semana.dias.map((d) => {
        const sinTareas = d.cuenta.total === 0;
        const contenido = (
          <>
            <span className="rd-etiqueta text-[9.5px] text-muted-foreground">{DIAS_CORTOS[diaSemana(d.fecha)]}</span>
            <span className="font-heading text-sm font-semibold tabular-nums leading-none">{d.futuro || sinTareas ? "—" : `${d.cuenta.pct}%`}</span>
            <span className="text-[10px] tabular-nums text-muted-foreground">{sinTareas ? "libre" : `${d.cuenta.cumplidas}/${d.cuenta.total}`}</span>
          </>
        );
        const clase = cn(
          "flex flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center",
          d.fecha === hoy ? "border-primary/60 bg-primary/[0.06]" : "border-border bg-card",
          !d.futuro && !sinTareas && d.cuenta.pct >= umbral && "border-emerald-500/50",
          !d.futuro && !sinTareas && d.fecha !== hoy && d.cuenta.pct < umbral && "border-destructive/40",
          d.futuro && "opacity-60",
        );
        return enlaces && !d.futuro ? (
          <Link
            key={d.fecha}
            href={`/seguimiento?vista=supervision&dia=${d.fecha}&persona=${semana.persona.id}`}
            className={cn(clase, "hover:border-primary")}
            aria-label={`Ver la evidencia de ${semana.persona.name} del ${fechaLarga(d.fecha)}`}
          >
            {contenido}
          </Link>
        ) : (
          <div key={d.fecha} className={clase}>
            {contenido}
          </div>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------- supervisión ----

async function VistaSupervision({ admin, plantilla, aCargo, hoy, dia, persona }: Comun & { aCargo: Persona[]; dia: string; persona: string }) {
  const fecha = esFecha(dia) && dia <= hoy ? dia : hoy;
  const personas = aCargo.some((p) => p.id === persona) ? aCargo.filter((p) => p.id === persona) : aCargo;
  const dias = await Promise.all(personas.map((p) => cargarDia(admin, plantilla, p, fecha)));
  const filtro = personas.length === 1 && aCargo.length > 1 ? `&persona=${personas[0].id}` : "";
  const porRevisar = dias.reduce((n, d) => n + contar(d.tareas).porRevisar, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/seguimiento?vista=supervision&dia=${sumarDias(fecha, -1)}${filtro}`}
          className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/50"
        >
          <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Día anterior</span>
        </Link>
        <div className="text-center">
          <p className="font-heading text-base font-semibold first-letter:uppercase">{fecha === hoy ? "Hoy" : fechaLarga(fecha)}</p>
          <p className="text-xs text-muted-foreground">
            {porRevisar > 0 ? `${porRevisar} ${porRevisar === 1 ? "tarea" : "tareas"} por revisar` : "Nada pendiente de revisar"}
          </p>
        </div>
        {fecha < hoy ? (
          <Link
            href={`/seguimiento?vista=supervision&dia=${sumarDias(fecha, 1)}${filtro}`}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/50"
          >
            <span className="hidden sm:inline">Día siguiente</span> <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="w-10" />
        )}
      </div>
      {filtro && (
        <Link href={`/seguimiento?vista=supervision&dia=${fecha}`} className="self-start text-sm text-primary hover:underline">
          Ver a todo el equipo este día
        </Link>
      )}
      <Supervision dias={dias} />
    </div>
  );
}

// ------------------------------------------------------------- semana ----

async function VistaSemana({ admin, plantilla, personas, hoy, semana }: Comun & { personas: Persona[]; semana: string }) {
  const actual = lunesDe(hoy);
  const lunes = esFecha(semana) && lunesDe(semana) <= actual ? lunesDe(semana) : actual;
  const filas = await cargarSemana(admin, plantilla, personas, lunes);
  const enCurso = lunes === actual && diasDeSemana(lunes).some((d) => d > hoy);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/seguimiento?vista=semana&semana=${sumarDias(lunes, -7)}`}
          className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/50"
        >
          <ChevronLeft className="size-4" /> <span className="hidden sm:inline">Semana anterior</span>
        </Link>
        <div className="text-center">
          <p className="font-heading text-base font-semibold">
            {fechaCorta(lunes)} – {fechaCorta(sumarDias(lunes, 5))}
          </p>
          <p className="text-xs text-muted-foreground">
            {enCurso ? "Semana en curso: cuenta hasta hoy" : "Semana cerrada"} · meta {plantilla.umbral} %
          </p>
        </div>
        {lunes < actual ? (
          <Link
            href={`/seguimiento?vista=semana&semana=${sumarDias(lunes, 7)}`}
            className="inline-flex h-10 items-center gap-1 rounded-full border border-border bg-card px-3 text-sm hover:border-primary/50"
          >
            <span className="hidden sm:inline">Semana siguiente</span> <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className="w-10" />
        )}
      </div>

      {filas.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Nadie tiene secuencia asignada. Ármala en la pestaña Plantilla.</p>
          </CardContent>
        </Card>
      )}

      {filas.map((f) => {
        const t = f.total;
        return (
          <Card key={f.persona.id} className={f.cumplio ? "border-emerald-500/40" : "border-destructive/40"}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-heading text-lg font-semibold leading-tight">{f.persona.name}</p>
                  <p className="text-xs text-muted-foreground">{ROLE_LABELS[f.persona.role]}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-heading text-3xl font-semibold tabular-nums">{t.pct} %</p>
                  <Chip tono={f.cumplio ? "verde" : enCurso ? tonoPct(t.pct, plantilla.umbral) : "rojo"} className="px-3 py-1 text-sm">
                    <ClipboardCheck className="size-3.5" />
                    {enCurso ? (f.cumplio ? "Va cumpliendo" : "Va por debajo") : f.cumplio ? "Cumplió" : "No cumplió"}
                  </Chip>
                </div>
              </div>
              <Barra pct={t.pct} umbral={plantilla.umbral} />
              <TiraSemana semana={f} umbral={plantilla.umbral} hoy={hoy} enlaces />
              <dl className="grid grid-cols-4 gap-1.5 text-center">
                {[
                  { n: t.cumplidas, de: t.total, texto: "Cumplidas" },
                  { n: t.aprobadas, texto: "Aprobadas" },
                  { n: t.devueltas, texto: "Devueltas", alerta: t.devueltas > 0 },
                  { n: t.sinHacer, texto: "Sin hacer", alerta: t.sinHacer > 0 },
                ].map((x) => (
                  <div key={x.texto} className="rounded-xl bg-muted/50 px-1 py-2">
                    <dd className={cn("font-heading text-lg font-semibold tabular-nums leading-none", x.alerta && "text-destructive")}>
                      {x.n}
                      {x.de != null && <span className="text-xs font-normal text-muted-foreground">/{x.de}</span>}
                    </dd>
                    <dt className="mt-1 text-[11px] text-muted-foreground">{x.texto}</dt>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-muted-foreground">
                Toca un día para ver su evidencia. Los días sin registro cuentan como 0 %.
                {f.dias.some((d) => !d.futuro && !d.conRegistro && d.cuenta.total > 0) &&
                  ` Sin registro: ${f.dias
                    .filter((d) => !d.futuro && !d.conRegistro && d.cuenta.total > 0)
                    .map((d) => DIAS_CORTOS[diaSemana(d.fecha)])
                    .join(", ")}.`}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
