"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Link2, RotateCcw, Upload } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  marcarTerminado,
  prepararSubida,
  reabrirPieza,
  registrarEnlace,
  registrarVideo,
} from "@/app/(protected)/prospectos/prospeccion-actions";
import { BUCKET_VIDEOS, MAX_VIDEO_BYTES, fmtPeso, type Servicio } from "@/lib/prospeccion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Chip } from "./piezas";

/** Subida de la pieza de prueba y botón «Terminado». La usan la ficha del
 * prospecto (roles de Ingresos) y «Mis videos» (quien la tiene asignada).
 * El archivo va directo del navegador a Storage con una URL firmada que
 * entrega el servidor después de validar el permiso. */
export function SubirPieza({
  id,
  servicio,
  videoUrl,
  videoNombre,
  terminado,
  puedeReabrir = false,
}: {
  id: string;
  servicio: Servicio;
  videoUrl: string | null;
  videoNombre: string | null;
  terminado: boolean;
  puedeReabrir?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [conEnlace, setConEnlace] = useState(false);
  const [enlace, setEnlace] = useState("");
  const [pending, startTransition] = useTransition();
  const ocupado = !!subiendo || pending;
  const esVideoArchivo = !!videoUrl && /\.(mp4|mov|m4v|webm)(\?|$)/i.test(videoUrl);
  const esImagen = !!videoUrl && /\.(png|jpe?g|webp)(\?|$)/i.test(videoUrl);

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast.error(
        `«${file.name}» pesa ${fmtPeso(file.size)} y el máximo es ${fmtPeso(MAX_VIDEO_BYTES)}. Expórtalo más liviano o pega un enlace de Drive.`,
      );
      return;
    }
    setSubiendo(`Subiendo ${file.name} (${fmtPeso(file.size)})…`);
    try {
      const prep = await prepararSubida(id, { nombre: file.name, tamano: file.size });
      if ("error" in prep) {
        toast.error(prep.error);
        return;
      }
      const supabase = createClient();
      const { error } = await supabase.storage
        .from(BUCKET_VIDEOS)
        .uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type || undefined });
      if (error) {
        const muyGrande = /size|large|exceed|413/i.test(error.message);
        toast.error(
          muyGrande
            ? "El almacenamiento rechazó el archivo por su tamaño. Expórtalo más liviano o pega un enlace de Drive."
            : `No se pudo subir: ${error.message}. Revisa tu conexión e intenta de nuevo.`,
          { duration: 9000 },
        );
        return;
      }
      const reg = await registrarVideo(id, { path: prep.path, nombre: file.name });
      if (reg.error) toast.error(reg.error);
      else toast.success("Pieza subida");
    } catch (err) {
      toast.error(`No se pudo subir: ${err instanceof Error ? err.message : "error de red"}`);
    } finally {
      setSubiendo(null);
    }
  }

  function guardarEnlace() {
    startTransition(async () => {
      const r = await registrarEnlace(id, enlace);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Enlace guardado");
        setEnlace("");
        setConEnlace(false);
      }
    });
  }

  function terminar() {
    startTransition(async () => {
      const r = await marcarTerminado(id);
      if (r.error) toast.error(r.error);
      else if (r.aviso) toast.warning(r.aviso, { duration: 9000 });
      else toast.success("Marcado como terminado");
    });
  }

  function reabrir() {
    startTransition(async () => {
      const r = await reabrirPieza(id);
      if (r.error) toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {videoUrl ? (
        <div className="flex flex-col gap-2">
          {esVideoArchivo && (
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="max-h-[420px] w-full max-w-xs self-start rounded-xl border border-border bg-black"
            />
          )}
          {esImagen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={videoUrl} alt="Pieza subida" className="max-h-[420px] w-full max-w-sm self-start rounded-xl border border-border object-contain" />
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {terminado ? <Chip tono="verde"><CheckCircle2 className="size-3" /> Terminado</Chip> : <Chip tono="ambar">Sin marcar como terminado</Chip>}
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="size-3 shrink-0" />
              <span className="truncate">{videoNombre ?? "Abrir pieza"}</span>
            </a>
          </div>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
          {servicio === "video" ? "Todavía no hay video subido." : "Todavía no hay muestra subida."}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        hidden
        accept={servicio === "video" ? "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" : "video/*,image/png,image/jpeg,image/webp,application/pdf"}
        onChange={subir}
      />

      {subiendo ? (
        <div className="flex flex-col gap-1.5" role="status">
          <p className="text-xs text-muted-foreground">{subiendo} No cierres esta pestaña.</p>
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {!terminado && (
            <>
              <Button type="button" variant={videoUrl ? "outline" : "default"} disabled={ocupado} onClick={() => inputRef.current?.click()}>
                <Upload /> {videoUrl ? "Reemplazar archivo" : servicio === "video" ? "Subir video" : "Subir muestra"}
              </Button>
              <Button type="button" variant="ghost" disabled={ocupado} onClick={() => setConEnlace((v) => !v)}>
                <Link2 /> Pegar un enlace
              </Button>
            </>
          )}
          {videoUrl && !terminado && (
            <Button type="button" disabled={ocupado} onClick={terminar}>
              <CheckCircle2 /> {pending ? "Guardando…" : "Marcar terminado"}
            </Button>
          )}
          {terminado && puedeReabrir && (
            <Button type="button" variant="outline" disabled={ocupado} onClick={reabrir}>
              <RotateCcw /> Devolver a edición
            </Button>
          )}
        </div>
      )}

      {conEnlace && !terminado && !subiendo && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={enlace}
            onChange={(e) => setEnlace(e.target.value)}
            placeholder="https://drive.google.com/…"
            inputMode="url"
            aria-label="Enlace a la pieza"
          />
          <Button type="button" variant="outline" disabled={ocupado || !enlace.trim()} onClick={guardarEnlace}>
            Guardar enlace
          </Button>
        </div>
      )}
      {!terminado && !subiendo && (
        <p className="text-xs text-muted-foreground">
          Máximo {fmtPeso(MAX_VIDEO_BYTES)} por archivo. Si pesa más, pega un enlace de Drive con acceso «cualquier persona con el
          enlace».
        </p>
      )}
    </div>
  );
}
