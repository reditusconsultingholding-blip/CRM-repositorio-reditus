"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { marcarDiaCampo, guardarFotoDia, reiniciarReto75 } from "@/app/(protected)/reto75/actions";
import { cn } from "@/lib/utils";

export type Reto75Dia = {
  id: string;
  dia_numero: number;
  fecha: string;
  dieta: boolean;
  entreno1: boolean;
  entreno2_outdoor: boolean;
  agua: boolean;
  lectura: boolean;
  foto_url: string | null;
  dieta_at?: string | null;
  entreno1_at?: string | null;
  entreno2_outdoor_at?: string | null;
  agua_at?: string | null;
  lectura_at?: string | null;
};

type Run = { id: string; numero_intento: number; fecha_inicio: string; estado: string };

const CAMPOS: { key: keyof Pick<Reto75Dia, "dieta" | "entreno1" | "entreno2_outdoor" | "agua" | "lectura">; label: string }[] = [
  { key: "dieta", label: "Dieta — sin trampas, sin alcohol" },
  { key: "entreno1", label: "Entrenamiento 1 (45 min)" },
  { key: "entreno2_outdoor", label: "Entrenamiento 2 al aire libre (45 min)" },
  { key: "agua", label: "1 galón de agua (≈3.7L)" },
  { key: "lectura", label: "10 páginas de lectura" },
];

function diaCompleto(d: Reto75Dia) {
  return d.dieta && d.entreno1 && d.entreno2_outdoor && d.agua && d.lectura;
}

function algoMarcado(d: Reto75Dia) {
  return d.dieta || d.entreno1 || d.entreno2_outdoor || d.agua || d.lectura || !!d.foto_url;
}

export function Reto75Grid({ run, dias, userId }: { run: Run; dias: Reto75Dia[]; userId: string; reglas: string[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [localDias, setLocalDias] = useState(dias);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const todayKey = new Date().toISOString().slice(0, 10);

  const selected = localDias.find((d) => d.id === selectedId) ?? null;
  const completados = localDias.filter(diaCompleto).length;
  const diaActual = localDias.find((d) => d.fecha === todayKey) ?? localDias.find((d) => !diaCompleto(d) && d.fecha <= todayKey);

  function updateLocal(id: string, patch: Partial<Reto75Dia>) {
    setLocalDias((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function toggleCampo(dia: Reto75Dia, campo: (typeof CAMPOS)[number]["key"]) {
    const nuevoValor = !dia[campo];
    updateLocal(dia.id, { [campo]: nuevoValor } as Partial<Reto75Dia>);
    startTransition(async () => {
      const result = await marcarDiaCampo(dia.id, campo, nuevoValor);
      if (result?.error) {
        toast.error(result.error);
        updateLocal(dia.id, { [campo]: !nuevoValor } as Partial<Reto75Dia>);
      }
    });
  }

  async function handleFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !selected) return;
    setUploading(true);
    try {
      const supabase = createClient();
      const path = `${userId}/${selected.id}-${Date.now()}-${file.name}`;
      const { error } = await supabase.storage.from("reto75-fotos").upload(path, file);
      if (error) {
        toast.error(`No se pudo subir la foto: ${error.message}`);
        return;
      }
      const { data } = supabase.storage.from("reto75-fotos").getPublicUrl(path);
      updateLocal(selected.id, { foto_url: data.publicUrl });
      const result = await guardarFotoDia(selected.id, data.publicUrl);
      if (result?.error) toast.error(result.error);
    } finally {
      setUploading(false);
    }
  }

  function handleReiniciar() {
    if (!confirm("¿Se te pasó un día? Esto reinicia el conteo desde el día 1 (regla del reto). ¿Confirmas?")) return;
    startTransition(async () => {
      const result = await reiniciarReto75();
      if (result?.error) toast.error(result.error);
      else toast.success("Reiniciado — día 1 de nuevo. ¡Vamos!");
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">
            Intento #{run.numero_intento} — Día {diaActual?.dia_numero ?? localDias.length} de 75
          </p>
          <p className="text-xs text-muted-foreground">{completados} día(s) completos al 100%</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={handleReiniciar} disabled={pending}>
          <RotateCcw className="size-3.5" />
          Reiniciar (fallé un día)
        </Button>
      </div>

      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10 md:grid-cols-15">
        {localDias.map((d) => {
          const esFuturo = d.fecha > todayKey;
          const completo = diaCompleto(d);
          const parcial = !completo && algoMarcado(d);
          const esHoy = d.fecha === todayKey;
          return (
            <button
              key={d.id}
              type="button"
              disabled={esFuturo}
              onClick={() => setSelectedId(d.id)}
              title={`Día ${d.dia_numero} — ${new Date(`${d.fecha}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}`}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border text-[11px] font-medium transition-colors",
                esFuturo && "cursor-not-allowed border-dashed text-muted-foreground/40",
                !esFuturo && !completo && !parcial && "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                parcial && "border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200",
                completo && "border-green-400 bg-green-500 text-white hover:bg-green-600",
                esHoy && "ring-2 ring-primary ring-offset-1",
              )}
            >
              {d.dia_numero}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-green-500" /> Día completo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-amber-300" /> Algo pendiente
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" /> Sin marcar
        </span>
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  Día {selected.dia_numero} —{" "}
                  {new Date(`${selected.fecha}T12:00:00`).toLocaleDateString("es-CO", { dateStyle: "long" })}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-2.5">
                {CAMPOS.map((c) => (
                  <label key={c.key} className="flex items-center gap-2.5 rounded-md border p-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={selected[c.key]}
                      onChange={() => toggleCampo(selected, c.key)}
                      className="size-4 accent-primary"
                    />
                    {c.label}
                  </label>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="flex items-center gap-1.5">
                  <Camera className="size-3.5" />
                  Foto del día
                </Label>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFoto} />
                {selected.foto_url ? (
                  <div className="relative w-fit">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.foto_url}
                      alt={`Foto día ${selected.dia_numero}`}
                      className="max-h-64 rounded-md border object-contain"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        updateLocal(selected.id, { foto_url: null });
                        guardarFotoDia(selected.id, null);
                      }}
                      className="absolute right-1 top-1 rounded-full bg-background/90 p-1 text-muted-foreground hover:text-destructive"
                      title="Quitar foto"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-fit gap-1.5"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    <Camera className="size-3.5" />
                    {uploading ? "Subiendo…" : "Subir foto"}
                  </Button>
                )}
              </div>

              {diaCompleto(selected) && (
                <p className="flex items-center gap-1.5 rounded-md bg-green-100 px-3 py-2 text-xs font-medium text-green-900">
                  <Check className="size-3.5" /> Día completo
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
