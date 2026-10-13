"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { ArrowLeft, Check, CheckCircle2, Circle, GraduationCap, Loader2, Lock, Play } from "lucide-react";
import { toast } from "sonner";
import { iniciarSesion, type SesionNueva } from "@/app/(protected)/maestria/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sala } from "@/components/maestria/sala";
import { Diploma } from "@/components/maestria/diploma";
import { ResultadoEvaluacion, tonoNota } from "@/components/maestria/evaluacion";
import {
  DIFICULTADES,
  ESCENARIOS,
  MODULOS,
  MODULO_EXAMEN,
  NOTA_APROBAR,
  NOTA_EXAMEN,
  PERFILES,
  estadoMaestria,
  notaMinima,
  type Dificultad,
  type Modulo,
  type PerfilId,
  type Progreso,
  type SesionResumen,
} from "@/lib/negociacion";
import { cn } from "@/lib/utils";

const PROPIA = "propia";

function Opcion({ activa, onClick, titulo, detalle }: { activa: boolean; onClick: () => void; titulo: string; detalle?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(
        "rounded-xl border px-3 py-2 text-left text-sm transition-colors",
        activa ? "border-primary bg-primary/[0.07]" : "border-border bg-card hover:border-primary/50",
      )}
    >
      <span className="block font-medium">{titulo}</span>
      {detalle && <span className="mt-0.5 block text-xs text-muted-foreground">{detalle}</span>}
    </button>
  );
}

export function Maestria({ nombre, progreso, sesiones, iaActiva }: { nombre: string; progreso: Progreso[]; sesiones: SesionResumen[]; iaActiva: boolean }) {
  const router = useRouter();
  const [sesion, setSesion] = useState<SesionNueva | null>(null);
  const [leccion, setLeccion] = useState<Modulo | null>(null);
  const [revisando, setRevisando] = useState<SesionResumen | null>(null);
  const [escenario, setEscenario] = useState(ESCENARIOS[0].id);
  const [propia, setPropia] = useState("");
  const [perfil, setPerfil] = useState<PerfilId>("sorpresa");
  const [dificultad, setDificultad] = useState<Dificultad>("media");
  const [abriendo, abrir] = useTransition();

  const estado = estadoMaestria(progreso, sesiones);
  const practicas = sesiones.filter((s) => s.tipo === "practica");
  const promedio = practicas.length ? Math.round(practicas.reduce((n, s) => n + (s.nota ?? 0), 0) / practicas.length) : 0;
  const examen = progreso.find((p) => p.modulo === MODULO_EXAMEN);

  function empezar(pedido: Parameters<typeof iniciarSesion>[0]) {
    abrir(async () => {
      const r = await iniciarSesion(pedido);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setLeccion(null);
      setSesion(r.sesion);
    });
  }

  if (sesion) {
    return (
      <Sala
        key={sesion.id}
        sesion={sesion}
        onSalir={() => {
          setSesion(null);
          router.refresh();
        }}
      />
    );
  }

  if (revisando?.evaluacion) {
    const minima = notaMinima(revisando.tipo);
    return (
      <div className="flex flex-col gap-4">
        <ResultadoEvaluacion titulo={revisando.escenario} evaluacion={revisando.evaluacion} minima={minima} aprobado={(revisando.nota ?? 0) >= minima} />
        <Button variant="outline" className="self-start" onClick={() => setRevisando(null)}>
          <ArrowLeft className="size-4" /> Volver
        </Button>
      </div>
    );
  }

  // Primero se explica; la práctica solo empieza desde aquí.
  if (leccion) {
    return (
      <Card>
        <CardHeader>
          <p className="rd-etiqueta text-[10px] text-muted-foreground">
            Semana {leccion.n} de {MODULOS.length} · primero la explicación
          </p>
          <CardTitle className="font-heading text-xl">{leccion.titulo}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 text-sm leading-relaxed [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">
            <ReactMarkdown>{leccion.leccion}</ReactMarkdown>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/[0.06] px-3 py-2.5">
              <p className="font-heading text-sm font-semibold">Frases para llevarte</p>
              <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                {leccion.frases.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-xl border border-destructive/30 bg-destructive/[0.04] px-3 py-2.5">
              <p className="font-heading text-sm font-semibold">Errores típicos</p>
              <ul className="mt-1.5 list-disc pl-5 text-sm">
                {leccion.errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            En la práctica el entrenador primero comprueba que entendiste. Si no, vuelve a explicarlo. Después hace de contraparte y te detiene
            cada vez que te equivoques. Se aprueba con {NOTA_APROBAR}.
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => empezar({ tipo: "clase", modulo: leccion.n })} disabled={abriendo || !iaActiva}>
              {abriendo ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Ya lo entendí: vamos a la práctica
            </Button>
            <Button variant="ghost" onClick={() => setLeccion(null)} disabled={abriendo}>
              <ArrowLeft className="size-4" /> Volver al plan
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue={estado.graduado ? "diploma" : "clases"}>
      <TabsList>
        <TabsTrigger value="clases">Clases y progreso</TabsTrigger>
        <TabsTrigger value="practica">Práctica libre</TabsTrigger>
        <TabsTrigger value="diploma">Diploma</TabsTrigger>
      </TabsList>

      {/* ------------------------------------------------ clases ---- */}
      <TabsContent value="clases" className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <div className="flex items-end justify-between gap-3">
              <p className="font-heading text-base font-semibold">
                {estado.modulosAprobados} de {MODULOS.length} módulos aprobados
              </p>
              <p className="text-xs text-muted-foreground">Un módulo por semana son 3 meses. Puedes ir más rápido.</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(estado.modulosAprobados / MODULOS.length) * 100}%` }} />
            </div>
          </CardContent>
        </Card>

        <ol className="flex flex-col gap-2">
          {MODULOS.map((m) => {
            const p = progreso.find((x) => x.modulo === m.n);
            const aprobado = !!p?.aprobado_en;
            const bloqueado = estado.moduloActual != null && m.n > estado.moduloActual;
            return (
              <li key={m.n}>
                <button
                  type="button"
                  disabled={bloqueado}
                  onClick={() => setLeccion(m)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left transition-colors",
                    bloqueado ? "cursor-not-allowed opacity-55" : "hover:border-primary/60",
                    m.n === estado.moduloActual && "border-primary/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl font-heading text-sm font-semibold",
                      aprobado ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {aprobado ? <Check className="size-4" /> : bloqueado ? <Lock className="size-4" /> : m.n}
                  </span>
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block font-medium">{m.titulo}</span>
                    <span className="mt-0.5 block text-sm text-muted-foreground">{m.resumen}</span>
                  </span>
                  {p && p.intentos > 0 && (
                    <span className="shrink-0 text-right leading-tight">
                      <span className={cn("block font-heading text-lg font-semibold tabular-nums", tonoNota(p.mejor_nota, NOTA_APROBAR))}>{p.mejor_nota}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {p.intentos} {p.intentos === 1 ? "intento" : "intentos"}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </TabsContent>

      {/* ---------------------------------------------- práctica ---- */}
      <TabsContent value="practica" className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Juego de rol en vivo</CardTitle>
            <p className="text-sm text-muted-foreground">
              Elige con quién negociar. La IA hace de contraparte, responde al instante y al final te califica y te corrige frase por frase.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <p className="mb-1.5 text-sm font-medium">Situación</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {ESCENARIOS.map((e) => (
                  <Opcion key={e.id} activa={escenario === e.id} onClick={() => setEscenario(e.id)} titulo={e.titulo} detalle={e.descripcion} />
                ))}
                <Opcion
                  activa={escenario === PROPIA}
                  onClick={() => setEscenario(PROPIA)}
                  titulo="Una situación mía"
                  detalle="Ensaya una negociación real que tengas pendiente"
                />
              </div>
              {escenario === PROPIA && (
                <Textarea
                  className="mt-2"
                  rows={3}
                  maxLength={1200}
                  value={propia}
                  onChange={(e) => setPropia(e.target.value)}
                  placeholder="Ej. Mañana hablo con Carlos, dueño de una marca de suplementos. Quiere 10 videos al mes pero pide pagar a 60 días…"
                />
              )}
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Tipo de contraparte</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {PERFILES.map((p) => (
                  <Opcion key={p.id} activa={perfil === p.id} onClick={() => setPerfil(p.id)} titulo={p.texto} detalle={p.detalle} />
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Dificultad</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {DIFICULTADES.map((d) => (
                  <Opcion key={d.id} activa={dificultad === d.id} onClick={() => setDificultad(d.id)} titulo={d.texto} detalle={d.detalle} />
                ))}
              </div>
            </div>

            <Button
              className="self-start"
              disabled={abriendo || !iaActiva || (escenario === PROPIA && propia.trim().length < 20)}
              onClick={() =>
                empezar({ tipo: "practica", escenarioId: escenario, personalizado: escenario === PROPIA ? propia : undefined, perfil, dificultad })
              }
            >
              {abriendo ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Empezar a negociar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Historial</CardTitle>
          </CardHeader>
          <CardContent>
            {sesiones.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aquí van a quedar tus sesiones calificadas.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {sesiones.slice(0, 40).map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => setRevisando(s)} className="flex w-full items-center gap-3 py-2 text-left text-sm hover:text-primary">
                      <span className={cn("w-9 shrink-0 font-heading text-base font-semibold tabular-nums", tonoNota(s.nota ?? 0, notaMinima(s.tipo)))}>
                        {s.nota}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{s.escenario}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {s.tipo === "practica" ? DIFICULTADES.find((d) => d.id === s.dificultad)?.texto : s.tipo === "examen" ? "Examen" : "Clase"} ·{" "}
                        {new Date(s.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </TabsContent>

      {/* ----------------------------------------------- diploma ---- */}
      <TabsContent value="diploma" className="flex flex-col gap-4">
        {estado.graduado && estado.graduadoEn && (
          <Diploma nombre={nombre} fecha={estado.graduadoEn} notaExamen={examen?.mejor_nota ?? NOTA_EXAMEN} promedio={promedio} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{estado.graduado ? "Lo que cumpliste" : "Lo que falta para graduarte"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              El diploma no se regala: el evaluador es estricto y el examen final no tiene pausas ni ayudas.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="flex flex-col gap-2">
              {estado.requisitos.map((r) => (
                <li key={r.texto} className="flex items-center gap-2.5 text-sm">
                  {r.hecho ? <CheckCircle2 className="size-4 shrink-0 text-emerald-600" /> : <Circle className="size-4 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 flex-1">{r.texto}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{r.detalle}</span>
                </li>
              ))}
            </ul>

            {!estado.graduado && (
              <Button className="self-start" disabled={!estado.examenDisponible || abriendo || !iaActiva} onClick={() => empezar({ tipo: "examen" })}>
                {abriendo ? <Loader2 className="size-4 animate-spin" /> : estado.examenDisponible ? <GraduationCap className="size-4" /> : <Lock className="size-4" />}
                {estado.examenDisponible ? "Presentar el examen final" : "Examen final bloqueado"}
              </Button>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
