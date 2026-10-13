"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Eye, Pencil } from "lucide-react";
import { analizarFotos } from "@/app/(protected)/videos/proyecto-actions";
import { PRESENTACION_LABELS, TAMANO_LABELS, fichaConDatos, type FichaProducto } from "@/lib/proyecto-video";
import type { DatosVideo } from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA, Segmento } from "@/components/prospectos/piezas";

const TAMANOS = ["pequeno", "mediano", "grande"] as const;
const SI_NO = ["si", "no"] as const;
const PRESENTACIONES = ["se-sostiene", "se-apoya", "se-acuesta"] as const;
const ETIQ_PRESENTACION = { "se-sostiene": "Se sostiene", "se-apoya": "Se apoya", "se-acuesta": "Se acuesta" } as const;

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col items-stretch gap-1.5">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs font-normal text-muted-foreground">{ayuda}</span>}
    </Label>
  );
}

/** Pastillas de una opción que también se pueden dejar sin marcar («no se sabe»). */
function Opcion<T extends string>({ value, onChange, opciones, etiquetas, disabled }: { value: T | ""; onChange: (v: T | "") => void; opciones: readonly T[]; etiquetas: Record<T, string>; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmento value={value as T} onChange={(v) => onChange(v === value ? "" : v)} opciones={opciones} etiquetas={etiquetas} disabled={disabled} />
      {value === "" && <span className="text-xs text-muted-foreground">Sin marcar: no se afirma nada.</span>}
    </div>
  );
}

type Props = {
  /** Los datos del formulario con las fotos ya puestas (`fotosProducto`). */
  datos: DatosVideo;
  ficha: FichaProducto;
  onChange: (f: FichaProducto) => void;
  bloqueado?: boolean;
};

/**
 * Ficha del producto: la IA de visión mira las fotos y propone lo que SE VE;
 * la persona lo corrige, llena lo que una foto no dice (medidas, contenido,
 * ingredientes, efectos) y lo confirma. Sin esa confirmación no se arma el
 * proyecto. Si la IA no está, se llena todo a mano.
 */
export function FichaProductoBloque({ datos, ficha, onChange, bloqueado }: Props) {
  const [analizando, setAnalizando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const hayFotos = datos.fotosProducto.length > 0;
  const confirmada = !!ficha.confirmado;
  const quieto = bloqueado || analizando || confirmada;

  /** Cualquier cambio quita la confirmación: lo confirmado es lo que quedó escrito. */
  const set = <K extends keyof FichaProducto>(k: K, v: FichaProducto[K]) => onChange({ ...ficha, [k]: v, origen: ficha.origen || "manual", confirmado: null });

  async function analizar() {
    setAnalizando(true);
    setAviso(null);
    const r = await analizarFotos(datos);
    setAnalizando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    onChange(r.ficha);
    setAviso(r.aviso ?? null);
    if (!r.aviso) toast.success("Fotos analizadas: revisa y confirma");
  }

  function confirmar() {
    if (!fichaConDatos(ficha)) return void toast.error("La ficha está vacía: analiza las fotos o llénala a mano.");
    // La firma real (quién y cuándo) la pone el servidor al guardar.
    onChange({ ...ficha, origen: ficha.origen || "manual", confirmado: { porId: "pendiente", por: "", fecha: new Date().toISOString() } });
    toast.success("Ficha confirmada");
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Ficha del producto</span>
        <Chip tono={confirmada ? "verde" : fichaConDatos(ficha) ? "ambar" : "neutro"}>{confirmada ? "Confirmada" : fichaConDatos(ficha) ? "Por confirmar" : "Sin llenar"}</Chip>
        {ficha.origen === "ia" && <Chip>Propuesta por IA mirando las fotos</Chip>}
        <span className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={!hayFotos || analizando || bloqueado} onClick={() => void analizar()}>
            <Eye className={cn(analizando && "animate-pulse")} /> {analizando ? "Mirando las fotos…" : fichaConDatos(ficha) ? "Volver a analizar" : "Analizar las fotos"}
          </Button>
          {confirmada ? (
            <Button type="button" variant="outline" size="sm" disabled={bloqueado} onClick={() => onChange({ ...ficha, confirmado: null })}>
              <Pencil /> Corregir
            </Button>
          ) : (
            <Button type="button" size="sm" disabled={bloqueado || analizando || !fichaConDatos(ficha)} onClick={confirmar}>
              <Check /> Confirmar
            </Button>
          )}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {hayFotos
          ? "La IA solo describe lo que se ve en las fotos; tú lo corriges y lo confirmas. Lo que confirmes es lo que el video muestra y dice del producto: nada más."
          : "Sube primero las fotos del producto. Sin fotos puedes llenar la ficha a mano."}
      </p>
      {aviso && (
        <p role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
          {aviso}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <span className={ETIQUETA}>Lo que se ve en la foto</span>
        <div className="grid gap-3 md:grid-cols-3">
          <Campo etiqueta="Tamaño aparente">
            <Opcion value={ficha.tamano} onChange={(v) => set("tamano", v)} opciones={TAMANOS} etiquetas={TAMANO_LABELS} disabled={quieto} />
          </Campo>
          <Campo etiqueta="¿Cabe en una mano?">
            <Opcion value={ficha.cabeEnMano} onChange={(v) => set("cabeEnMano", v)} opciones={SI_NO} etiquetas={{ si: "Sí", no: "No" }} disabled={quieto} />
          </Campo>
          <Campo etiqueta="Cómo se muestra" ayuda={ficha.presentacion ? PRESENTACION_LABELS[ficha.presentacion] : undefined}>
            <Opcion value={ficha.presentacion} onChange={(v) => set("presentacion", v)} opciones={PRESENTACIONES} etiquetas={ETIQ_PRESENTACION} disabled={quieto} />
          </Campo>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo etiqueta="Cómo se usa" ayuda="Solo lo que deja ver su forma o lo impreso.">
            <Textarea value={ficha.comoSeUsa} onChange={(e) => set("comoSeUsa", e.target.value)} maxLength={600} rows={2} disabled={quieto} />
          </Campo>
          <Campo etiqueta="Qué se ve en la etiqueta" ayuda="Texto que se lee, colores y elementos. Tal cual.">
            <Textarea value={ficha.etiqueta} onChange={(e) => set("etiqueta", e.target.value)} maxLength={600} rows={2} disabled={quieto} />
          </Campo>
        </div>
        <Campo etiqueta="Qué NO se puede saber por la foto" ayuda="Esto no se afirma en el video salvo que lo respondas abajo.">
          <Textarea value={ficha.noSeSabe} onChange={(e) => set("noSeSabe", e.target.value)} maxLength={600} rows={2} disabled={quieto} />
        </Campo>
      </div>

      <div className="flex flex-col gap-3">
        <span className={ETIQUETA}>Lo que hay que preguntar (no se deduce de una foto)</span>
        <div className="grid gap-3 md:grid-cols-2">
          <Campo etiqueta="Medidas">
            <Input value={ficha.medidas} onChange={(e) => set("medidas", e.target.value)} maxLength={160} placeholder="Ej.: 12 cm de alto" disabled={quieto} />
          </Campo>
          <Campo etiqueta="Contenido">
            <Input value={ficha.contenido} onChange={(e) => set("contenido", e.target.value)} maxLength={160} placeholder="Ej.: 60 cápsulas · 250 ml · 1 unidad" disabled={quieto} />
          </Campo>
          <Campo etiqueta="Ingredientes o materiales" ayuda="Solo los que confirmó el cliente.">
            <Input value={ficha.ingredientes} onChange={(e) => set("ingredientes", e.target.value)} maxLength={400} disabled={quieto} />
          </Campo>
          <Campo etiqueta="Efectos o beneficios que se pueden decir" ayuda="Con las palabras del cliente. Sin promesas de salud.">
            <Input value={ficha.efectos} onChange={(e) => set("efectos", e.target.value)} maxLength={400} disabled={quieto} />
          </Campo>
        </div>
      </div>
      {confirmada && (
        <p className="text-xs text-muted-foreground">
          Confirmada{ficha.confirmado?.por ? ` por ${ficha.confirmado.por}` : ""}. Pulsa «Corregir» para cambiar algo; habrá que confirmarla de nuevo.
        </p>
      )}
    </div>
  );
}
