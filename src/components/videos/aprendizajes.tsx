"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeftRight, History, Pencil, Plus, Save, Star, X } from "lucide-react";
import { cambiarAprendizaje, guardarRetro, listarAprendizajes, type EstadoAprendizajes } from "@/app/(protected)/videos/aprendizajes-actions";
import { ETAPAS_APRENDIZAJE, ETAPA_APRENDIZAJE_LABELS, ORIGEN_APRENDIZAJE_LABELS, type Aprendizaje, type EtapaAprendizaje } from "@/lib/aprendizajes-video";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Chip } from "@/components/prospectos/piezas";

type Formato = { slug: string; nombre: string };

const fecha = (iso: string) => (iso ? new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" }) : "");
const SELECT = "h-9 rounded-lg border border-input bg-card px-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Formulario corto para dejar una retroalimentación (se usa junto al video final y en la pantalla de aprendizajes). */
export function RetroVideo({ guionId, formatos, formatoNombre, alGuardar }: { guionId: string | null; formatos?: Formato[]; formatoNombre?: string; alGuardar?: (e: EstadoAprendizajes) => void }) {
  const [nota, setNota] = useState("");
  const [etapa, setEtapa] = useState<EtapaAprendizaje>("edicion");
  const [general, setGeneral] = useState(false);
  const [formato, setFormato] = useState(formatos?.[0]?.slug ?? "");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    setGuardando(true);
    const r = await guardarRetro(guionId, { nota, etapa, general, ...(guionId ? {} : { formato }) });
    setGuardando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    setNota("");
    toast.success(r.aviso ?? "Guardado", { duration: 8000 });
    alGuardar?.(r);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-retro>
      <span className="text-sm font-semibold">{guionId ? "Retroalimentación de este video" : "Agregar un aprendizaje"}</span>
      <span className="text-sm leading-relaxed text-muted-foreground">
        Escribe qué cambiarías o qué quedó bien. Se guarda como aprendizaje y los próximos videos {guionId ? `de formato «${formatoNombre ?? "este formato"}»` : "de ese formato"} lo tendrán en cuenta.
      </span>
      <Textarea value={nota} rows={2} maxLength={1200} placeholder="Ej.: el producto debe verse desde el primer segundo, no solo al final." aria-label="Retroalimentación" onChange={(e) => setNota(e.target.value)} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label className="flex items-center gap-2 text-sm">
          Es sobre
          <select className={SELECT} value={etapa} onChange={(e) => setEtapa(e.target.value as EtapaAprendizaje)} aria-label="Etapa">
            {ETAPAS_APRENDIZAJE.map((x) => (
              <option key={x} value={x}>
                {ETAPA_APRENDIZAJE_LABELS[x]}
              </option>
            ))}
          </select>
        </label>
        {!guionId && formatos && !general && (
          <label className="flex items-center gap-2 text-sm">
            Formato
            <select className={SELECT} value={formato} onChange={(e) => setFormato(e.target.value)} aria-label="Formato">
              {formatos.map((f) => (
                <option key={f.slug} value={f.slug}>
                  {f.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={general} onChange={(e) => setGeneral(e.target.checked)} />
          Aplica a todos los formatos
        </label>
        <Button className="ml-auto" disabled={guardando || nota.trim().length < 8} onClick={() => void guardar()}>
          <Save /> {guardando ? "Guardando…" : "Guardar aprendizaje"}
        </Button>
      </div>
    </div>
  );
}

/**
 * «Aprendizajes»: lo que el equipo fue corrigiendo, por formato y generales.
 * Todos lo ven; lo editan el CEO y la directora operativa.
 */
export function AprendizajesVideos({ formatos }: { formatos: Formato[] }) {
  const [estado, setEstado] = useState<EstadoAprendizajes | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<string>("todos");
  const [verApagados, setVerApagados] = useState(false);
  const [editando, setEditando] = useState<{ id: string; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarAprendizajes().then((r) => {
      if (!vivo) return;
      if ("error" in r) setError(r.error);
      else setEstado(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const nombre = useMemo(() => new Map(formatos.map((f) => [f.slug, f.nombre])), [formatos]);
  const lista = useMemo(() => estado?.lista ?? [], [estado]);
  const grupos = useMemo(() => {
    const visibles = lista.filter((a) => (verApagados || a.activo) && (filtro === "todos" || (filtro === "general" ? !a.formato : a.formato === filtro)));
    const claves = [...new Set(visibles.map((a) => a.formato))].sort((a, b) => (a === "" ? -1 : b === "" ? 1 : (nombre.get(a) ?? a).localeCompare(nombre.get(b) ?? b)));
    return claves.map((k) => ({ clave: k, items: visibles.filter((a) => a.formato === k).sort((a, b) => Number(b.activo) - Number(a.activo) || Number(b.importante) - Number(a.importante) || b.fecha.localeCompare(a.fecha)) }));
  }, [lista, filtro, verApagados, nombre]);
  const conAprendizajes = useMemo(() => [...new Set(lista.map((a) => a.formato).filter(Boolean))], [lista]);

  async function cambiar(a: Aprendizaje, cambio: Parameters<typeof cambiarAprendizaje>[1], exito: string) {
    setOcupado(a.id);
    const r = await cambiarAprendizaje(a.id, cambio);
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    setEstado(r);
    toast.success(exito);
  }

  if (error) return <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>;
  if (!estado) return <p className="text-sm text-muted-foreground">Cargando los aprendizajes…</p>;
  const puede = estado.puedeEditar;

  return (
    <div className="flex flex-col gap-4" id="aprendizajes">
      {puede ? <RetroVideo guionId={null} formatos={formatos} alGuardar={setEstado} /> : <p className="text-sm text-muted-foreground">Los aprendizajes los escriben y editan el CEO y la directora operativa. Aquí los puedes consultar.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          Ver
          <select className={SELECT} value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por formato">
            <option value="todos">Todos</option>
            <option value="general">Generales (todos los formatos)</option>
            {conAprendizajes.map((f) => (
              <option key={f} value={f}>
                {nombre.get(f) ?? f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={verApagados} onChange={(e) => setVerApagados(e.target.checked)} />
          Mostrar también los apagados
        </label>
        <span className="ml-auto text-sm text-muted-foreground">
          {lista.filter((a) => a.activo).length} vigentes · {lista.filter((a) => !a.activo).length} apagados
        </span>
      </div>

      {grupos.length === 0 && <p className="text-sm text-muted-foreground">No hay aprendizajes con ese filtro.</p>}
      {grupos.map((g) => (
        <section key={g.clave || "general"} className="flex flex-col gap-2" aria-label={g.clave ? (nombre.get(g.clave) ?? g.clave) : "Generales"}>
          <h3 className="font-heading text-lg font-semibold">{g.clave ? `Formato: ${nombre.get(g.clave) ?? g.clave}` : "Generales · valen para todos los formatos"}</h3>
          <ul className="flex flex-col gap-2">
            {g.items.map((a) => (
              <li key={a.id} data-aprendizaje={a.id} className={cn("flex flex-col gap-2 rounded-xl border border-border bg-card p-3", !a.activo && "opacity-60")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Chip tono="azul">{ETAPA_APRENDIZAJE_LABELS[a.etapa]}</Chip>
                  {a.importante && <Chip tono="ambar">Importante</Chip>}
                  {!a.activo && <Chip tono="neutro">{a.reemplazadaPor ? "Apagado: lo reemplazó uno más reciente" : "Apagado"}</Chip>}
                  <span className="text-xs text-muted-foreground">
                    {ORIGEN_APRENDIZAJE_LABELS[a.origen]} · {a.autor || "—"} · {fecha(a.fecha)}
                    {a.producto ? ` · ${a.producto}` : ""}
                  </span>
                </div>
                {editando?.id === a.id ? (
                  <div className="flex flex-col gap-2">
                    <Textarea value={editando.texto} rows={2} maxLength={260} aria-label="Texto de la regla" onChange={(e) => setEditando({ id: a.id, texto: e.target.value })} />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={ocupado === a.id || !editando.texto.trim()}
                        onClick={() => {
                          const texto = editando.texto;
                          setEditando(null);
                          void cambiar(a, { regla: texto }, "Regla editada");
                        }}
                      >
                        <Save /> Guardar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditando(null)}>
                        <X /> Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-[15px] leading-relaxed font-medium">{a.regla}</p>
                )}
                {a.nota && a.nota !== a.regla && <p className="text-sm leading-relaxed text-muted-foreground">Nota original: «{a.nota}»</p>}
                {puede && editando?.id !== a.id && (
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => setEditando({ id: a.id, texto: a.regla })}>
                      <Pencil /> Editar
                    </Button>
                    <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => void cambiar(a, { importante: !a.importante }, a.importante ? "Ya no es importante" : "Marcado importante")}>
                      <Star /> {a.importante ? "Quitar importante" : "Marcar importante"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => void cambiar(a, { activo: !a.activo }, a.activo ? "Apagado: ya no se usa" : "Encendido de nuevo")}>
                      {a.activo ? <X /> : <Plus />} {a.activo ? "Apagar" : "Encender"}
                    </Button>
                    {a.formato ? (
                      <Button size="sm" variant="outline" disabled={ocupado === a.id} onClick={() => void cambiar(a, { formato: "" }, "Ahora vale para todos los formatos")}>
                        <ArrowLeftRight /> Pasar a general
                      </Button>
                    ) : (
                      <label className="flex items-center gap-1.5 text-sm">
                        <ArrowLeftRight className="size-4" /> Pasar a
                        <select
                          className={SELECT}
                          value=""
                          disabled={ocupado === a.id}
                          aria-label="Mover a un formato"
                          onChange={(e) => {
                            if (e.target.value) void cambiar(a, { formato: e.target.value }, `Ahora es solo de «${nombre.get(e.target.value) ?? e.target.value}»`);
                          }}
                        >
                          <option value="">un formato…</option>
                          {formatos.map((f) => (
                            <option key={f.slug} value={f.slug}>
                              {f.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                )}
                {a.historial.length > 1 && (
                  <details className="text-sm text-muted-foreground">
                    <summary className="flex cursor-pointer items-center gap-1.5">
                      <History className="size-3.5" /> Historial ({a.historial.length})
                    </summary>
                    <ul className="mt-1 flex flex-col gap-0.5 pl-5">
                      {a.historial.map((h, i) => (
                        <li key={`${h.fecha}-${i}`}>
                          {fecha(h.fecha)} · {h.quien}: {h.que}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
