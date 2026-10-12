"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Save, Trash2, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type UserRole } from "@/lib/roles";
import {
  BLOQUES_SUGERIDOS,
  DIAS_CORTOS,
  ROLES,
  TODOS_LOS_DIAS,
  plantillaInicial,
  type Persona,
  type Plantilla,
  type TareaPlantilla,
} from "@/lib/seguimiento";
import { guardarPlantillaAccion } from "@/app/(protected)/seguimiento/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CAMPO, Chip } from "./piezas";

/** Plantilla de secuencias, por rol (y opcionalmente por persona). Solo CEO. */
export function EditorPlantilla({ inicial, equipo }: { inicial: Plantilla; equipo: Persona[] }) {
  const [p, setP] = useState<Plantilla>(inicial);
  const [sucio, setSucio] = useState(false);
  const rolesConTareas = useMemo(() => ROLES.filter((r) => p.tareas.some((x) => x.rol === r)), [p.tareas]);
  const [rol, setRol] = useState<UserRole>(rolesConTareas[0] ?? "gerente_comercial");
  const [abierta, setAbierta] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const delRol = p.tareas.filter((x) => x.rol === rol).sort((a, b) => a.orden - b.orden);

  function cambiar(fn: (borrador: Plantilla) => void) {
    setP((actual) => {
      const copia: Plantilla = JSON.parse(JSON.stringify(actual));
      fn(copia);
      return copia;
    });
    setSucio(true);
  }

  function editar(id: string, parche: Partial<TareaPlantilla>) {
    cambiar((b) => {
      const tarea = b.tareas.find((x) => x.id === id);
      if (tarea) Object.assign(tarea, parche);
    });
  }

  function mover(id: string, paso: -1 | 1) {
    cambiar((b) => {
      const lista = b.tareas.filter((x) => x.rol === rol).sort((a, c) => a.orden - c.orden);
      const i = lista.findIndex((x) => x.id === id);
      const j = i + paso;
      if (i < 0 || j < 0 || j >= lista.length) return;
      [lista[i], lista[j]] = [lista[j], lista[i]];
      lista.forEach((x, k) => (x.orden = k + 1));
    });
  }

  function agregar() {
    const id = `t-${Date.now().toString(36)}`;
    cambiar((b) => {
      b.tareas.push({
        id,
        rol,
        userId: null,
        bloque: delRol[delRol.length - 1]?.bloque ?? "Contenido del día",
        titulo: "",
        instrucciones: "",
        evidencia: true,
        cantidad: 1,
        dias: TODOS_LOS_DIAS,
        paginaDelDia: false,
        resenas: false,
        opcional: false,
        enlaces: [],
        orden: delRol.length + 1,
        activa: true,
      });
    });
    setAbierta(id);
  }

  function guardar() {
    const sinTitulo = p.tareas.find((x) => !x.titulo.trim());
    if (sinTitulo) {
      setRol(sinTitulo.rol);
      setAbierta(sinTitulo.id);
      toast.error("Hay una tarea sin título. Escríbelo o elimínala.");
      return;
    }
    startTransition(async () => {
      const r = await guardarPlantillaAccion(p);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Plantilla guardada. Aplica desde hoy.");
        setSucio(false);
      }
    });
  }

  function restaurar() {
    if (!window.confirm("¿Cargar la plantilla inicial? Se reemplaza lo que ves; no se guarda hasta que toques Guardar.")) return;
    setP(plantillaInicial());
    setSucio(true);
    setAbierta(null);
  }

  return (
    <div className="flex flex-col gap-4 pb-20">
      <Card>
        <CardContent className="flex flex-col gap-3">
          <p className="rd-etiqueta text-muted-foreground">Reglas</p>
          <label className="flex flex-wrap items-center gap-2 text-sm">
            Para «Cumplió» la semana debe llegar al
            <Input
              type="number"
              min={1}
              max={100}
              value={p.umbral}
              onChange={(e) => cambiar((b) => (b.umbral = Math.min(100, Math.max(1, Number(e.target.value) || 1))))}
              className="h-10 w-20 text-center md:h-9"
              aria-label="Porcentaje mínimo para cumplir"
            />
            %
          </label>
          <div className="flex flex-col gap-2">
            <p className="text-sm">Quién supervisa a cada rol (el CEO siempre puede revisar a todos):</p>
            {rolesConTareas
              .filter((r) => r !== "ceo")
              .map((r) => (
                <label key={r} className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-2">
                  <span className="sm:w-44">{ROLE_LABELS[r]}</span>
                  <select
                    className={cn(CAMPO, "sm:w-60")}
                    value={p.supervision[r] ?? ""}
                    onChange={(e) =>
                      cambiar((b) => {
                        if (e.target.value) b.supervision[r] = e.target.value as UserRole;
                        else delete b.supervision[r];
                      })
                    }
                  >
                    <option value="">Solo el CEO</option>
                    {ROLES.filter((x) => x !== r && x !== "ceo").map((x) => (
                      <option key={x} value={x}>
                        {ROLE_LABELS[x]}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
          Secuencia del rol
          <select className={CAMPO} value={rol} onChange={(e) => setRol(e.target.value as UserRole)}>
            {ROLES.map((r) => {
              const n = p.tareas.filter((x) => x.rol === r).length;
              return (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} · {n ? `${n} tareas` : "sin secuencia"}
                </option>
              );
            })}
          </select>
        </label>
        <Button type="button" variant="outline" size="lg" className="h-10 sm:mt-5 sm:h-9" onClick={agregar}>
          <Plus /> Agregar tarea
        </Button>
      </div>

      {delRol.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">
          {ROLE_LABELS[rol]} todavía no tiene secuencia. Agrega la primera tarea.
        </p>
      )}

      {delRol.map((tarea, i) => {
        const abiertaEsta = abierta === tarea.id;
        const personasDelRol = equipo.filter((u) => u.role === tarea.rol || u.id === tarea.userId);
        return (
          <Card key={tarea.id} className={cn(!tarea.activa && "opacity-60")}>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" aria-expanded={abiertaEsta} onClick={() => setAbierta(abiertaEsta ? null : tarea.id)}>
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 font-heading text-xs font-semibold text-primary">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium leading-snug">{tarea.titulo || "Tarea nueva (sin título)"}</span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      <Chip>{tarea.bloque}</Chip>
                      <Chip tono={tarea.evidencia ? "azul" : "gris"}>{tarea.evidencia ? `Pide ${tarea.cantidad} evidencia${tarea.cantidad > 1 ? "s" : ""}` : "Sin evidencia"}</Chip>
                      {tarea.dias.length < 6 && <Chip>{tarea.dias.map((d) => DIAS_CORTOS[d]).join(" ")}</Chip>}
                      {tarea.opcional && <Chip>No cuenta</Chip>}
                      {!tarea.activa && <Chip tono="ambar">Pausada</Chip>}
                    </span>
                  </span>
                  <ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", abiertaEsta && "rotate-180")} />
                </button>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                  <Button type="button" variant="ghost" size="icon" disabled={i === 0} onClick={() => mover(tarea.id, -1)} aria-label="Subir">
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" disabled={i === delRol.length - 1} onClick={() => mover(tarea.id, 1)} aria-label="Bajar">
                    <ArrowDown />
                  </Button>
                </div>
              </div>

              {abiertaEsta && (
                <div className="flex flex-col gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Título
                    <Input value={tarea.titulo} maxLength={160} onChange={(e) => editar(tarea.id, { titulo: e.target.value })} className="h-10 text-foreground md:h-9" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Instrucciones (un paso por línea; es lo que la persona lee para saber qué hacer)
                    <Textarea value={tarea.instrucciones} maxLength={4000} onChange={(e) => editar(tarea.id, { instrucciones: e.target.value })} className="min-h-32 text-foreground" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      Bloque
                      <Input value={tarea.bloque} maxLength={40} list="seg-bloques" onChange={(e) => editar(tarea.id, { bloque: e.target.value })} className="h-10 text-foreground md:h-9" />
                    </label>
                    <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                      A quién le toca
                      <select className={cn(CAMPO, "text-foreground")} value={tarea.userId ?? ""} onChange={(e) => editar(tarea.id, { userId: e.target.value || null })}>
                        <option value="">Todo el rol · {ROLE_LABELS[tarea.rol]}</option>
                        {personasDelRol.map((u) => (
                          <option key={u.id} value={u.id}>
                            Solo {u.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1 text-xs font-medium text-muted-foreground">Días en que aplica</legend>
                    <div className="flex flex-wrap gap-1.5">
                      {TODOS_LOS_DIAS.map((d) => {
                        const on = tarea.dias.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={on}
                            onClick={() => editar(tarea.id, { dias: on ? tarea.dias.filter((x) => x !== d) : [...tarea.dias, d].sort() })}
                            className={cn(
                              "h-10 min-w-12 rounded-lg border px-2 text-sm font-medium",
                              on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground",
                            )}
                          >
                            {DIAS_CORTOS[d]}
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <Casilla marcada={tarea.evidencia} alCambiar={(v) => editar(tarea.id, { evidencia: v })} texto="Exige evidencia para marcarla" />
                    <label className={cn("flex items-center gap-2 text-sm", !tarea.evidencia && "opacity-50")}>
                      Evidencias que pide
                      <Input
                        type="number"
                        min={1}
                        max={10}
                        disabled={!tarea.evidencia}
                        value={tarea.cantidad}
                        onChange={(e) => editar(tarea.id, { cantidad: Math.min(10, Math.max(1, Math.round(Number(e.target.value)) || 1)) })}
                        className="h-10 w-20 text-center md:h-9"
                      />
                    </label>
                    <Casilla marcada={tarea.paginaDelDia} alCambiar={(v) => editar(tarea.id, { paginaDelDia: v })} texto="Mostrar la página del día (antes y después)" />
                    <Casilla marcada={tarea.resenas} alCambiar={(v) => editar(tarea.id, { resenas: v })} texto="Mostrar de dónde sacar las reseñas" />
                    <Casilla marcada={tarea.opcional} alCambiar={(v) => editar(tarea.id, { opcional: v })} texto="Opcional: no cuenta para el porcentaje" />
                    <Casilla marcada={tarea.activa} alCambiar={(v) => editar(tarea.id, { activa: v })} texto="Activa (si la apagas, deja de aparecer)" />
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Enlaces de apoyo (opcional)</p>
                    {tarea.enlaces.map((l, k) => (
                      <div key={k} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[12rem_1fr_auto]">
                        <Input
                          value={l.rotulo}
                          placeholder="Texto del botón"
                          maxLength={60}
                          onChange={(e) => editar(tarea.id, { enlaces: tarea.enlaces.map((x, q) => (q === k ? { ...x, rotulo: e.target.value } : x)) })}
                          className="col-span-2 h-10 sm:col-span-1 md:h-9"
                        />
                        <Input
                          value={l.url}
                          placeholder="https://… o /prospectos"
                          inputMode="url"
                          autoCapitalize="none"
                          onChange={(e) => editar(tarea.id, { enlaces: tarea.enlaces.map((x, q) => (q === k ? { ...x, url: e.target.value } : x)) })}
                          className="h-10 md:h-9"
                        />
                        <Button type="button" variant="ghost" size="icon-lg" aria-label="Quitar enlace" onClick={() => editar(tarea.id, { enlaces: tarea.enlaces.filter((_, q) => q !== k) })}>
                          <Trash2 />
                        </Button>
                      </div>
                    ))}
                    {tarea.enlaces.length < 6 && (
                      <Button type="button" variant="ghost" className="self-start" onClick={() => editar(tarea.id, { enlaces: [...tarea.enlaces, { rotulo: "", url: "" }] })}>
                        <Plus /> Agregar enlace
                      </Button>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="destructive"
                    className="self-start"
                    onClick={() => {
                      if (window.confirm(`¿Eliminar «${tarea.titulo || "tarea nueva"}» de la plantilla? Lo ya entregado en días anteriores no se borra.`)) {
                        cambiar((b) => (b.tareas = b.tareas.filter((x) => x.id !== tarea.id)));
                      }
                    }}
                  >
                    <Trash2 /> Eliminar tarea
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <datalist id="seg-bloques">
        {BLOQUES_SUGERIDOS.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-2.5 shadow-lg backdrop-blur">
        <Button type="button" size="lg" className="h-11 flex-1 sm:h-9 sm:flex-none sm:px-5" disabled={pending || !sucio} onClick={guardar}>
          <Save /> {pending ? "Guardando…" : sucio ? "Guardar plantilla" : "Sin cambios"}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-11 sm:h-9" disabled={pending} onClick={restaurar}>
          <Undo2 /> Plantilla inicial
        </Button>
        <p className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">
          {p.actualizado ? `Última edición: ${p.actualizadoPor ?? "CEO"} · ${new Date(p.actualizado).toLocaleDateString("es-CO", { timeZone: "America/Bogota" })}` : "Es la plantilla inicial: todavía no se ha editado."}
        </p>
      </div>
    </div>
  );
}

function Casilla({ marcada, alCambiar, texto }: { marcada: boolean; alCambiar: (v: boolean) => void; texto: string }) {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <input type="checkbox" checked={marcada} onChange={(e) => alCambiar(e.target.checked)} className="size-4 shrink-0 accent-[var(--primary)]" />
      {texto}
    </label>
  );
}
