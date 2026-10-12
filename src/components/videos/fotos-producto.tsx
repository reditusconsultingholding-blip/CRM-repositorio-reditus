"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, X } from "lucide-react";
import { confirmarFotoProducto, prepararFotoProducto } from "@/app/(protected)/videos/actions";
import { createClient } from "@/lib/supabase/client";
import {
  BUCKET_VIDEOS_GENERADOS,
  MAX_FOTO_PRODUCTO_BYTES,
  MAX_IMAGENES_PRODUCTO,
  TIPOS_FOTO_PRODUCTO,
} from "@/lib/trabajos-video";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** Los enlaces de las fotos, tal como viajan al paso «Generar video»: uno por línea. */
export function enlacesDeFotos(texto: string): string[] {
  return texto
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Fotos reales del producto: se arrastran, se pegan con Ctrl+V (en cualquier
 * parte de la pantalla) o se eligen del equipo. Cada una se sube y queda como
 * un enlace https en la misma lista que usa el paso «Generar video».
 */
export function FotosProducto({ fotos, onChange }: { fotos: string; onChange: (cambio: (antes: string) => string) => void }) {
  const [subiendo, setSubiendo] = useState(0);
  const [encima, setEncima] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lista = enlacesDeFotos(fotos);
  const cupo = MAX_IMAGENES_PRODUCTO - lista.length;
  const cupoRef = useRef(cupo);
  useEffect(() => {
    cupoRef.current = cupo;
  });

  const subir = useCallback(
    async (archivos: File[]) => {
      const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
      if (!imagenes.length) return;
      const libres = cupoRef.current;
      if (libres <= 0) return void toast.error(`Ya hay ${MAX_IMAGENES_PRODUCTO} fotos, que es el máximo. Quita una para poner otra.`);
      if (imagenes.length > libres) toast.warning(`Solo caben ${libres} más: se suben las primeras.`);
      const supabase = createClient();
      for (const file of imagenes.slice(0, libres)) {
        if (!TIPOS_FOTO_PRODUCTO[file.type]) {
          toast.error(`«${file.name || "imagen"}» no sirve: la foto debe ser PNG, JPG o WebP.`);
          continue;
        }
        if (file.size > MAX_FOTO_PRODUCTO_BYTES) {
          toast.error(`«${file.name || "imagen"}» pesa más de ${MAX_FOTO_PRODUCTO_BYTES / 1024 / 1024} MB.`);
          continue;
        }
        setSubiendo((n) => n + 1);
        try {
          const prep = await prepararFotoProducto({ tipo: file.type, tamano: file.size });
          if ("error" in prep) {
            toast.error(prep.error);
            continue;
          }
          const { error } = await supabase.storage.from(BUCKET_VIDEOS_GENERADOS).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
          if (error) {
            toast.error(`No se pudo subir la foto: ${error.message}. Revisa tu conexión e intenta de nuevo.`, { duration: 9000 });
            continue;
          }
          const listo = await confirmarFotoProducto(prep.path);
          if ("error" in listo) {
            toast.error(listo.error);
            continue;
          }
          onChange((antes) => [...enlacesDeFotos(antes), listo.url].slice(0, MAX_IMAGENES_PRODUCTO).join("\n"));
          toast.success("Foto del producto subida");
        } catch (err) {
          toast.error(`No se pudo subir la foto: ${err instanceof Error ? err.message : "error de red"}`);
        } finally {
          setSubiendo((n) => n - 1);
        }
      }
    },
    [onChange],
  );

  // Ctrl+V en cualquier parte de «Crear video»: si lo pegado trae imágenes, son fotos del producto.
  useEffect(() => {
    const alPegar = (e: ClipboardEvent) => {
      const archivos = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (!archivos.length) return;
      e.preventDefault();
      void subir(archivos);
    };
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [subir]);

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm leading-none font-medium">Fotos reales del producto</span>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          e.preventDefault();
          setEncima(false);
          void subir(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-dashed p-3 transition-colors",
          encima ? "border-primary bg-primary/10" : "border-border bg-muted/30",
        )}
      >
        {lista.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {lista.map((u, i) => (
              <li key={u} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt={`Foto ${i + 1} del producto`} className="size-20 rounded-lg border border-border bg-card object-cover" />
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">Principal</span>
                )}
                <button
                  type="button"
                  aria-label={`Quitar la foto ${i + 1}`}
                  onClick={() => onChange((antes) => enlacesDeFotos(antes).filter((x) => x !== u).join("\n"))}
                  className="absolute -top-1.5 -right-1.5 flex size-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-destructive"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            type="file"
            hidden
            multiple
            accept={Object.keys(TIPOS_FOTO_PRODUCTO).join(",")}
            onChange={(e) => {
              const archivos = Array.from(e.target.files ?? []);
              e.target.value = "";
              void subir(archivos);
            }}
          />
          <Button type="button" variant="outline" disabled={subiendo > 0 || cupo <= 0} onClick={() => input.current?.click()}>
            <ImagePlus /> {subiendo > 0 ? "Subiendo…" : "Elegir fotos"}
          </Button>
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground" role="status">
            {subiendo > 0
              ? "Subiendo la foto. No cierres esta pantalla."
              : cupo <= 0
                ? `Ya están las ${MAX_IMAGENES_PRODUCTO} fotos que caben.`
                : `Arrástralas aquí, pégalas con Ctrl+V o elígelas. Hasta ${MAX_IMAGENES_PRODUCTO}, en PNG, JPG o WebP. La primera es la que se usa en las escenas donde aparece el producto.`}
          </p>
        </div>
      </div>
    </div>
  );
}
