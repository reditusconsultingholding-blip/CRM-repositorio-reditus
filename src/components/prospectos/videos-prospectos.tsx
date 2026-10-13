"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Clapperboard, ExternalLink, Play, X } from "lucide-react";
import { completarVideoProspecto, correrVideoProspecto, decidirVideoProspecto, generarParaLosUltimos, videosDeProspectos } from "@/app/(protected)/prospectos/video-actions";
import { nombrePais } from "@/lib/videos";
import { COSTO_ESTIMADO_PROSPECTO, ETAPA_VIDEO_LABELS, enMarcha, type EtapaVideoProspecto, type FilaVideoProspecto, type VideoProspecto } from "@/lib/videos-prospecto";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/prospectos/piezas";

const TONO: Record<EtapaVideoProspecto, "neutro" | "azul" | "ambar" | "verde" | "rojo"> = {
  "sin-decidir": "ambar",
  no: "neutro",
  agendado: "azul",
  pagina: "azul",
  investigacion: "azul",
  lanzado: "verde",
  detenido: "rojo",
};

type Props = {
  filas: FilaVideoProspecto[];
  /** Solo el CEO decide; los demás ven el estado. */
  esCeo: boolean;
  /** El CEO pidió que se le pregunte antes de cada video (por defecto sí). */
  pideAprobacion: boolean;
  /** En la ficha de un prospecto: solo ese, sin encabezado de lista. */
  soloUno?: boolean;
};

/**
 * Video gratis automático para prospectos. El CEO responde «¿Hacer video para
 * este prospecto? Sí / No». Con el Sí, el sistema entra a la página, toma las
 * fotos reales, investiga el país, escribe el guion y lanza el modo directo;
 * esta pantalla empuja las etapas mientras está abierta (si se cierra, sigue
 * el servidor de videos). El video final lo aprueba siempre una persona.
 */
export function VideosProspectos({ filas: iniciales, esCeo, pideAprobacion, soloUno }: Props) {
  const [filas, setFilas] = useState(iniciales);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const corriendo = useRef(new Set<string>());
  const [trabajando, setTrabajando] = useState<string[]>([]);

  const poner = useCallback((v: VideoProspecto) => setFilas((l) => l.map((f) => (f.candidato.id === v.prospectoId ? { ...f, video: v } : f))), []);

  /** Empuja las etapas de un prospecto agendado, una tras otra, hasta que se lance o se detenga. */
  const empujar = useCallback(
    async (id: string) => {
      if (corriendo.current.has(id)) return;
      corriendo.current.add(id);
      setTrabajando((l) => [...l, id]);
      try {
        for (let vuelta = 0; vuelta < 5; vuelta++) {
          const r = await correrVideoProspecto(id);
          if ("error" in r) return void toast.error(r.error, { duration: 9000 });
          poner(r.video);
          // Si no cambió de etapa (tope diario, o lo está corriendo el servidor), no se insiste.
          if (!enMarcha(r.video.etapa) || (vuelta > 0 && r.video.etapa === "agendado")) return;
          if (r.video.etapa === "agendado" && /tope diario/.test(r.video.detalle)) return;
        }
      } finally {
        corriendo.current.delete(id);
        setTrabajando((l) => l.filter((x) => x !== id));
      }
    },
    [poner],
  );

  // Lo que ya estaba agendado al abrir la pantalla sigue desde donde iba.
  useEffect(() => {
    for (const f of iniciales) if (enMarcha(f.video.etapa) && !/tope diario/.test(f.video.detalle)) void empujar(f.candidato.id);
  }, [iniciales, empujar]);

  async function decidir(id: string, hacer: boolean) {
    setOcupado(id);
    const r = await decidirVideoProspecto(id, hacer);
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    poner(r.video);
    if (hacer) {
      toast.success("Agendado: empieza por la página del producto");
      void empujar(id);
    }
  }

  async function ultimos() {
    if (!window.confirm("Se agendan los videos de los 3 prospectos más recientes que estén pendientes, sin preguntar uno por uno. Cada uno consulta anuncios y genera imágenes y clips (respetando los topes). ¿Continuar?")) return;
    setOcupado("ultimos");
    const r = await generarParaLosUltimos(3);
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    setFilas(r.filas);
    for (const f of r.filas) if (enMarcha(f.video.etapa)) void empujar(f.candidato.id);
  }

  async function refrescar() {
    const r = await videosDeProspectos();
    if (!("error" in r)) setFilas(r.filas);
  }

  if (!filas.length) return null;
  const porDecidir = filas.filter((f) => f.video.etapa === "sin-decidir").length;

  return (
    <Card id="videos-prospectos">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clapperboard className="size-4" /> {soloUno ? "Video gratis para este prospecto" : "Videos gratis para prospectos"}
          {!soloUno && porDecidir > 0 && <Chip tono="ambar">{porDecidir} por decidir</Chip>}
        </CardTitle>
        <CardDescription>
          {esCeo
            ? pideAprobacion
              ? "Tú decides a cuáles se les hace. Con el Sí, el sistema hace todo solo y al final te pide aprobar el video."
              : "La pregunta está apagada: los prospectos nuevos se agendan solos hasta el tope diario. El video final lo apruebas tú."
            : "El CEO decide a cuáles se les hace video. Aquí ves en qué va cada uno."}
        </CardDescription>
        {!soloUno && (
          <CardAction className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => void refrescar()}>
              Actualizar
            </Button>
            {esCeo && (
              <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => void ultimos()}>
                <Play /> Generar ahora para los últimos 3 prospectos
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {esCeo && <p className="text-xs leading-relaxed text-muted-foreground">{COSTO_ESTIMADO_PROSPECTO}</p>}
        <ul className="flex flex-col gap-2">
          {filas.map(({ candidato: c, video: v }) => (
            <li key={c.id} className="flex flex-col gap-2 rounded-xl border border-border bg-muted/30 p-3" data-prospecto={c.id} data-etapa={v.etapa}>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Chip tono={TONO[v.etapa]}>{trabajando.includes(c.id) && enMarcha(v.etapa) ? "Trabajando…" : ETAPA_VIDEO_LABELS[v.etapa]}</Chip>
                {soloUno ? <strong className="text-sm font-medium">{c.nombre}</strong> : <Link href={`/prospectos/${c.id}`} className="text-sm font-medium hover:underline">{c.nombre}</Link>}
                <span className="min-w-0 flex-1 basis-40 truncate text-xs text-muted-foreground">
                  {v.producto || c.producto || "Producto por detectar en su tienda"} · {nombrePais(c.pais)}
                </span>
                {v.guionId && (
                  <Link href={`/videos?guion=${v.guionId}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <ExternalLink className="size-3" /> Ver en Creativos
                  </Link>
                )}
              </div>
              {v.detalle && <p className="text-xs leading-relaxed">{v.detalle}</p>}
              {v.fotos.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {v.fotos.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt={`Foto ${i + 1} tomada de la página`} className="size-14 rounded-lg border border-border bg-card object-cover" />
                  ))}
                </div>
              )}
              {v.etapa === "sin-decidir" &&
                (esCeo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">¿Hacer video para este prospecto?</span>
                    <Button size="sm" disabled={!!ocupado} onClick={() => void decidir(c.id, true)}>
                      <Check /> Sí
                    </Button>
                    <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => void decidir(c.id, false)}>
                      <X /> No
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">Espera la decisión del CEO.</span>
                ))}
              {v.etapa === "no" && (
                <span className="text-xs text-muted-foreground">
                  {v.decididoPor || "El CEO"} dijo que no. No se vuelve a preguntar.
                  {esCeo && (
                    <Button variant="link" size="xs" disabled={!!ocupado} onClick={() => void decidir(c.id, true)}>
                      Cambiar a Sí
                    </Button>
                  )}
                </span>
              )}
              {v.etapa === "detenido" && esCeo && <Reintentar video={v} ocupado={!!ocupado} onListo={(nv) => { poner(nv); void empujar(c.id); }} />}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function Reintentar({ video, ocupado, onListo }: { video: VideoProspecto; ocupado: boolean; onListo: (v: VideoProspecto) => void }) {
  const [oferta, setOferta] = useState(video.oferta);
  const [llamado, setLlamado] = useState(video.llamado);
  const [enviando, setEnviando] = useState(false);
  async function enviar() {
    setEnviando(true);
    const r = await completarVideoProspecto(video.prospectoId, { oferta, llamado });
    setEnviando(false);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    onListo(r.video);
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
      <Input value={oferta} maxLength={400} placeholder="Oferta (solo si la página no la muestra)" aria-label="Oferta del video del prospecto" onChange={(e) => setOferta(e.target.value)} />
      <Input value={llamado} maxLength={200} placeholder="Llamado a la acción" aria-label="Llamado a la acción del video del prospecto" onChange={(e) => setLlamado(e.target.value)} />
      <Button variant="outline" disabled={ocupado || enviando} onClick={() => void enviar()}>
        <Play /> Volver a correr
      </Button>
    </div>
  );
}
