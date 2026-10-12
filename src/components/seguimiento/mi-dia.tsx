"use client";

import { useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ChevronDown, ExternalLink, Link2, Lock, RotateCcw, Trash2, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fmtPeso } from "@/lib/prospeccion";
import {
  ACEPTA_EVIDENCIA,
  BUCKET_SEGUIMIENTO,
  EXT_EVIDENCIA,
  MAX_EVIDENCIA_BYTES,
  contar,
  faltaPara,
  horaBogota,
  type DiaVista,
  type EstadoTarea,
  type TareaVista,
} from "@/lib/seguimiento";
import { agregarEnlace, guardarNota, marcarTarea, prepararEvidencia, quitarEvidencia, registrarEvidencia } from "@/app/(protected)/seguimiento/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Barra, ChipEstado, Chip, Instrucciones, ListaEvidencias, PaginaDia, RecursoResenas, ResumenCuenta } from "./piezas";

/** La secuencia de hoy de la persona: cada tarea con sus instrucciones y su
 * evidencia. Sin la evidencia que pide la plantilla no se puede marcar. */
export function MiDia({ dia }: { dia: DiaVista }) {
  const cuenta = contar(dia.tareas);
  const bloques: { nombre: string; tareas: { tarea: TareaVista; numero: number }[] }[] = [];
  dia.tareas.forEach((tarea, i) => {
    const ultimo = bloques[bloques.length - 1];
    if (ultimo && ultimo.nombre === tarea.bloque) ultimo.tareas.push({ tarea, numero: i + 1 });
    else bloques.push({ nombre: tarea.bloque, tareas: [{ tarea, numero: i + 1 }] });
  });

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/40">
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="rd-etiqueta text-primary">Tu avance de hoy</p>
              <p className="font-heading text-3xl font-semibold tabular-nums tracking-tight">{cuenta.pct} %</p>
            </div>
            {cuenta.total > 0 && cuenta.sinHacer === 0 && cuenta.devueltas === 0 && (
              <Chip tono="verde">
                <CheckCircle2 className="size-3" /> Día completo
              </Chip>
            )}
          </div>
          <Barra pct={cuenta.pct} />
          <ResumenCuenta c={cuenta} />
        </CardContent>
      </Card>

      {bloques.map((b) => (
        <section key={`${b.nombre}-${b.tareas[0].numero}`} className="flex flex-col gap-3" aria-label={b.nombre}>
          <h2 className="rd-etiqueta pl-1 text-muted-foreground">{b.nombre}</h2>
          {b.tareas.map(({ tarea, numero }) => (
            <TarjetaTarea key={tarea.id} dia={dia} tarea={tarea} numero={numero} />
          ))}
        </section>
      ))}
    </div>
  );
}

function TarjetaTarea({ dia, tarea, numero }: { dia: DiaVista; tarea: TareaVista; numero: number }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [enlace, setEnlace] = useState("");
  const [conEnlace, setConEnlace] = useState(false);
  const [nota, setNota] = useState(tarea.entrega.nota);
  const [pending, startTransition] = useTransition();
  // Al marcar o desmarcar, la tarjeta cambia en el acto; el servidor sigue
  // validando y, si rechaza el cambio, vuelve sola a como estaba.
  const [marca, ponerMarca] = useOptimistic<boolean | null>(null);
  const estado: EstadoTarea = marca === null ? tarea.estado : marca ? "hecha" : "pendiente";
  const cerrada = tarea.estado === "aprobada";
  const entregada = estado === "hecha" || cerrada;
  const [abierta, setAbierta] = useState(!entregada);
  const ocupado = !!subiendo || pending;
  const falta = faltaPara(tarea, tarea.entrega);
  const n = tarea.entrega.evidencias.length;

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivos = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!archivos.length) return;
    try {
      for (const file of archivos) {
        if (!EXT_EVIDENCIA.test(file.name)) {
          toast.error(`«${file.name}» no sirve como evidencia. Sube una imagen, un video o un PDF.`);
          continue;
        }
        if (file.size > MAX_EVIDENCIA_BYTES) {
          toast.error(`«${file.name}» pesa ${fmtPeso(file.size)} y el máximo es ${fmtPeso(MAX_EVIDENCIA_BYTES)}. Súbelo a Drive y pega el enlace.`);
          continue;
        }
        setSubiendo(`Subiendo ${file.name} (${fmtPeso(file.size)})…`);
        const prep = await prepararEvidencia(tarea.id, { nombre: file.name, tamano: file.size });
        if ("error" in prep) {
          toast.error(prep.error);
          continue;
        }
        const supabase = createClient();
        const { error } = await supabase.storage
          .from(BUCKET_SEGUIMIENTO)
          .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
        if (error) {
          const muyGrande = /size|large|exceed|413/i.test(error.message);
          toast.error(
            muyGrande
              ? "El almacenamiento rechazó el archivo por su tamaño. Súbelo a Drive y pega el enlace."
              : `No se pudo subir: ${error.message}. Revisa tu conexión e intenta de nuevo.`,
            { duration: 9000 },
          );
          continue;
        }
        const reg = await registrarEvidencia(tarea.id, { path: prep.path, nombre: file.name });
        if (reg.error) toast.error(reg.error);
        else toast.success("Evidencia subida");
      }
    } catch (err) {
      toast.error(`No se pudo subir: ${err instanceof Error ? err.message : "error de red"}`);
    } finally {
      setSubiendo(null);
      router.refresh();
    }
  }

  function pegarEnlace() {
    startTransition(async () => {
      const r = await agregarEnlace(tarea.id, enlace);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Enlace guardado");
        setEnlace("");
        setConEnlace(false);
      }
    });
  }

  function quitar(id: string) {
    startTransition(async () => {
      const r = await quitarEvidencia(tarea.id, id);
      if (r.error) toast.error(r.error);
    });
  }

  function marcar(hecha: boolean) {
    if (hecha) setAbierta(false);
    startTransition(async () => {
      ponerMarca(hecha);
      const r = await marcarTarea(tarea.id, hecha, nota);
      if (r.error) {
        toast.error(r.error);
        if (hecha) setAbierta(true);
      } else if (r.aviso) toast.success(r.aviso, { duration: 7000 });
      else if (hecha) toast.success("Tarea entregada");
    });
  }

  function notaAlSalir() {
    if (nota.trim() === tarea.entrega.nota.trim() || cerrada) return;
    startTransition(async () => {
      const r = await guardarNota(tarea.id, nota);
      if (r.error) toast.error(r.error);
    });
  }

  return (
    <Card
      className={cn(
        estado === "devuelta" && "border-destructive/50",
        estado === "aprobada" && "border-emerald-500/40",
        estado === "hecha" && "border-primary/40",
      )}
    >
      <CardContent className="flex flex-col gap-3">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex w-full items-start gap-3 text-left">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-full font-heading text-sm font-semibold",
              entregada ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-primary/10 text-primary",
            )}
          >
            {entregada ? <CheckCircle2 className="size-4" /> : numero}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-heading text-base font-semibold leading-snug">{tarea.titulo}</span>
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <ChipEstado estado={estado} />
              {tarea.evidencia ? (
                <Chip tono={n >= tarea.cantidad ? "verde" : "ambar"}>
                  {n} de {tarea.cantidad} {tarea.cantidad === 1 ? "evidencia" : "evidencias"}
                </Chip>
              ) : (
                <Chip>No pide archivo</Chip>
              )}
              {tarea.opcional && <Chip>No cuenta para el %</Chip>}
            </span>
          </span>
          <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", abierta && "rotate-180")} />
        </button>

        {estado === "devuelta" && tarea.revision && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-sm" role="alert">
            <p className="font-semibold text-destructive">
              {tarea.revision.porNombre.split(" ")[0]} te la devolvió · {horaBogota(tarea.revision.en)}
            </p>
            <p className="mt-0.5">{tarea.revision.nota}</p>
            <p className="mt-1 text-xs text-muted-foreground">Corrige la evidencia y vuelve a entregarla.</p>
          </div>
        )}
        {tarea.estado === "aprobada" && tarea.revision?.nota && (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-sm">
            <b>{tarea.revision.porNombre.split(" ")[0]}:</b> {tarea.revision.nota}
          </p>
        )}

        {abierta && (
          <div className="flex flex-col gap-3">
            <Instrucciones texto={tarea.instrucciones} />
            {tarea.paginaDelDia && dia.pagina && <PaginaDia pagina={dia.pagina} />}
            {tarea.resenas && <RecursoResenas fecha={dia.fecha} />}
            {tarea.enlaces.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {tarea.enlaces.map((l) =>
                  l.url.startsWith("/") ? (
                    <Link key={l.url} href={l.url} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-primary hover:border-primary/50">
                      <ExternalLink className="size-3" /> {l.rotulo}
                    </Link>
                  ) : (
                    <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-medium text-primary hover:border-primary/50">
                      <ExternalLink className="size-3" /> {l.rotulo}
                    </a>
                  ),
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl border border-dashed border-border p-3">
              <p className="rd-etiqueta text-muted-foreground">{tarea.evidencia ? "Evidencia" : "Evidencia (opcional)"}</p>
              <ListaEvidencias
                fecha={dia.fecha}
                userId={dia.userId}
                evidencias={tarea.entrega.evidencias}
                accion={
                  cerrada
                    ? undefined
                    : (ev) => (
                        <button
                          type="button"
                          disabled={ocupado}
                          onClick={() => quitar(ev.id)}
                          aria-label={`Quitar ${ev.nombre}`}
                          className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )
                }
              />
              {!cerrada && (
                <>
                  <input ref={inputRef} type="file" hidden multiple accept={ACEPTA_EVIDENCIA} onChange={subir} />
                  {subiendo ? (
                    <div className="flex flex-col gap-1.5" role="status">
                      <p className="text-xs text-muted-foreground">{subiendo} No cierres esta pantalla.</p>
                      <div className="h-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                      <Button type="button" variant="outline" size="lg" className="h-11 sm:h-9" disabled={ocupado} onClick={() => inputRef.current?.click()}>
                        <Upload /> Subir archivo
                      </Button>
                      <Button type="button" variant="outline" size="lg" className="h-11 sm:h-9" disabled={ocupado} onClick={() => setConEnlace((v) => !v)}>
                        <Link2 /> Pegar enlace
                      </Button>
                    </div>
                  )}
                  {conEnlace && !subiendo && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={enlace}
                        onChange={(e) => setEnlace(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && enlace.trim() && pegarEnlace()}
                        placeholder="https://www.instagram.com/… o TikTok o Drive"
                        inputMode="url"
                        autoCapitalize="none"
                        aria-label="Enlace de la publicación"
                        className="h-11 sm:h-9"
                      />
                      <Button type="button" size="lg" className="h-11 sm:h-9" disabled={ocupado || !enlace.trim()} onClick={pegarEnlace}>
                        Guardar enlace
                      </Button>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Captura, video o PDF (máximo {fmtPeso(MAX_EVIDENCIA_BYTES)}), o el enlace de la publicación. Solo lo ven tu supervisora y el CEO.
                  </p>
                </>
              )}
            </div>

            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Nota (opcional): qué hiciste o «no se pudo porque…»
              <Textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                onBlur={notaAlSalir}
                disabled={cerrada}
                maxLength={1000}
                placeholder="Ejemplo: se publicó a las 10:30. / No se pudo porque…"
                className="text-foreground"
              />
            </label>

            {cerrada ? (
              <p className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <Lock className="size-3.5" /> Aprobada: ya no se puede cambiar.
              </p>
            ) : tarea.estado === "hecha" ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-muted-foreground">Entregada a las {tarea.entrega.hechaEn ? horaBogota(tarea.entrega.hechaEn) : "—"}. Falta que la revisen.</p>
                <Button type="button" variant="ghost" disabled={ocupado} onClick={() => marcar(false)}>
                  <RotateCcw /> Desmarcar
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Button type="button" size="lg" className="h-12 w-full text-base sm:h-10 sm:w-auto sm:self-start sm:px-5" disabled={ocupado || !!falta} onClick={() => marcar(true)}>
                  <CheckCircle2 /> {pending ? "Guardando…" : tarea.estado === "devuelta" ? "Volver a entregar" : "Marcar como hecha"}
                </Button>
                {falta && <p className="text-xs text-amber-700 dark:text-amber-300">{falta}</p>}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
