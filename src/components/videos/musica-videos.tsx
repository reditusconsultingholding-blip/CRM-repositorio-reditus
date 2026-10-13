"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Music, Plus, Trash2, Upload } from "lucide-react";
import { agregarPista, bibliotecaMusica, confirmarPista, prepararPista, quitarPista, type EstadoMusica } from "@/app/(protected)/videos/aprendizajes-actions";
import { createClient } from "@/lib/supabase/client";
import { TONOS_MUSICA, TONO_MUSICA_LABELS, type TonoMusica } from "@/lib/proyecto-video";
import { BUCKET_VIDEOS_GENERADOS } from "@/lib/trabajos-video";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirmar } from "./progreso-video";

const PARA_QUE: Record<TonoMusica, string> = {
  neutro: "Fondo discreto. Se usa también cuando el tono del video no tiene pistas.",
  energia: "Ritmo alto: ofertas, retos, usos del producto.",
  suspenso: "Tensión: historias, problemas que se resuelven.",
  emotivo: "Cálida: testimonios, regalos, familia.",
};

const nombreDe = (url: string) => decodeURIComponent(url.split("?")[0].split("/").pop() ?? url);

/**
 * Biblioteca de música por tono. Al armar un video se elige sola una pista del
 * tono del proyecto (rotando para no repetir) y suena por debajo de la voz.
 * Todos la ven; solo el CEO sube o quita pistas.
 */
export function MusicaVideos() {
  const [estado, setEstado] = useState<EstadoMusica | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [enlace, setEnlace] = useState<Partial<Record<TonoMusica, string>>>({});
  const entrada = useRef<HTMLInputElement>(null);
  const tonoSubida = useRef<TonoMusica>("neutro");
  const [confirmar, dialogo] = useConfirmar();

  useEffect(() => {
    let vivo = true;
    void bibliotecaMusica().then((r) => {
      if (!vivo) return;
      if ("error" in r) setError(r.error);
      else setEstado(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  async function correr(clave: string, fn: () => Promise<EstadoMusica | { error: string }>, exito: string) {
    setOcupado(clave);
    const r = await fn();
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    setEstado(r);
    toast.success(exito);
  }

  async function subir(file: File | undefined) {
    const tono = tonoSubida.current;
    if (!file) return;
    setOcupado(`subir:${tono}`);
    try {
      const prep = await prepararPista({ tono, tipo: file.type, tamano: file.size });
      if ("error" in prep) return void toast.error(prep.error, { duration: 10000 });
      const { error: e } = await createClient().storage.from(BUCKET_VIDEOS_GENERADOS).uploadToSignedUrl(prep.path, prep.token, file, { contentType: "audio/mpeg" });
      if (e) return void toast.error(`No se pudo subir la pista: ${e.message}`);
      const r = await confirmarPista(prep.path);
      if ("error" in r) return void toast.error(r.error, { duration: 10000 });
      setEstado(r);
      toast.success(`Pista agregada a «${TONO_MUSICA_LABELS[tono]}»`);
    } finally {
      setOcupado(null);
    }
  }

  if (error) return <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">{error}</p>;
  if (!estado) return <p className="text-sm text-muted-foreground">Cargando la música…</p>;
  const puede = estado.puedeEditar;

  return (
    <div className="flex flex-col gap-3" id="musica-videos">
      <input
        ref={entrada}
        type="file"
        hidden
        accept="audio/mpeg,.mp3"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          void subir(f);
        }}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {TONOS_MUSICA.map((t) => {
          const pistas = estado.biblioteca[t];
          return (
            <section key={t} data-tono={t} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
              <div className="flex items-center gap-2">
                <Music className="size-4 text-primary" />
                <h4 className="font-heading text-base font-semibold">{TONO_MUSICA_LABELS[t]}</h4>
                <span className="ml-auto text-sm text-muted-foreground">
                  {pistas.length} {pistas.length === 1 ? "pista" : "pistas"}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{PARA_QUE[t]}</p>
              {pistas.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">Sin pistas: los videos de este tono salen {t === "neutro" ? "sin música" : "con una pista de «Neutro», o sin música si tampoco hay"}.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {pistas.map((u) => (
                    <li key={u} className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2">
                      <span className="truncate text-sm font-medium" title={u}>
                        {nombreDe(u)}
                      </span>
                      <div className="flex items-center gap-2">
                        <audio controls preload="none" src={u} className="h-8 min-w-0 flex-1" aria-label={`Escuchar ${nombreDe(u)}`} />
                        {puede && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Quitar ${nombreDe(u)}`}
                            disabled={!!ocupado}
                            onClick={async () => {
                              if (await confirmar(`Se quita «${nombreDe(u)}» de «${TONO_MUSICA_LABELS[t]}». Los videos ya armados no cambian.`, { titulo: "¿Quitar la pista?", si: "Sí, quitar" })) void correr(`quitar:${u}`, () => quitarPista(t, u), "Pista quitada");
                            }}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {puede && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!ocupado}
                    onClick={() => {
                      tonoSubida.current = t;
                      entrada.current?.click();
                    }}
                  >
                    <Upload /> {ocupado === `subir:${t}` ? "Subiendo…" : "Subir mp3"}
                  </Button>
                  <Input className="h-8 min-w-0 flex-1 basis-40" placeholder="o pega un enlace https a un .mp3" value={enlace[t] ?? ""} aria-label={`Enlace de una pista de ${TONO_MUSICA_LABELS[t]}`} onChange={(e) => setEnlace((x) => ({ ...x, [t]: e.target.value }))} />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!ocupado || !(enlace[t] ?? "").trim()}
                    onClick={() =>
                      void correr(`agregar:${t}`, () => agregarPista(t, enlace[t] ?? ""), "Pista agregada").then(() => setEnlace((x) => ({ ...x, [t]: "" })))
                    }
                  >
                    <Plus /> Agregar
                  </Button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {!puede && <p className="text-sm text-muted-foreground">Las pistas las sube o quita el CEO.</p>}
      {dialogo}
    </div>
  );
}
