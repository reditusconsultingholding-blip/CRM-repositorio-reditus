"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Plus, ScanSearch, Trash2, Upload } from "lucide-react";
import { analizarVideoReferencia, consultarAnalisis, prepararVideoReferencia } from "@/app/(protected)/videos/clonar-actions";
import { createClient } from "@/lib/supabase/client";
import {
  ENCUADRES,
  ENCUADRE_LABELS,
  FUNCIONES_TOMA,
  FUNCION_LABELS,
  MAX_TOMAS,
  PASO_DE_FUNCION,
  TIPOS_TOMA,
  TIPO_TOMA_LABELS,
  TOMA_VACIA,
  duracionDeReferencia,
  type CambiosClon,
  type TomaReferencia,
} from "@/lib/clonacion-video";
import type { AnuncioVideo } from "@/lib/investigacion-video/tipos";
import { MAX_ANUNCIO_CLON, enlaceSeguro } from "@/lib/videos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

/** Un anuncio corto típico, para no empezar de cero: se ajusta toma por toma mirando la referencia. */
const ESTRUCTURA_TIPICA: TomaReferencia[] = [
  { ...TOMA_VACIA, duracion: 3, funcion: "gancho", tipo: "persona-habla", encuadre: "primer-plano" },
  { ...TOMA_VACIA, duracion: 5, funcion: "dolor", tipo: "persona-accion", encuadre: "plano-medio" },
  { ...TOMA_VACIA, duracion: 5, funcion: "intento-fallido", tipo: "apoyo", encuadre: "detalle" },
  { ...TOMA_VACIA, duracion: 6, funcion: "demostracion", tipo: "persona-accion", encuadre: "plano-medio" },
  { ...TOMA_VACIA, duracion: 4, funcion: "prueba", tipo: "producto", encuadre: "detalle" },
  { ...TOMA_VACIA, duracion: 5, funcion: "cierre", tipo: "producto", encuadre: "primer-plano", textoEnPantalla: true },
];

function Sel<T extends string>({ valor, opciones, etiquetas, onChange, nombre, disabled }: { valor: T; opciones: readonly T[]; etiquetas: Record<T, string>; onChange: (v: T) => void; nombre: string; disabled?: boolean }) {
  return (
    <Select items={etiquetas} value={valor} disabled={disabled} onValueChange={(v) => v && onChange(v as T)}>
      <SelectTrigger className="w-full" aria-label={nombre}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o} value={o}>
            {etiquetas[o]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Props = {
  enlace: string;
  transcripcion: string;
  tomas: TomaReferencia[];
  /** Anuncios activos que ya trajo la investigación de mercado: se puede elegir uno como referencia. */
  anuncios: AnuncioVideo[];
  bloqueado?: boolean;
  onEnlace: (v: string) => void;
  onTranscripcion: (v: string) => void;
  onTomas: (t: TomaReferencia[]) => void;
  /** Qué debe ser distinto en el video nuevo. */
  cambios: CambiosClon;
  onCambios: (c: CambiosClon) => void;
  /** Hay servidor de videos: el análisis automático del archivo está disponible. */
  servidorActivo: boolean;
  producto: string;
};

const SONDEO_ANALISIS_MS = 5000;

/**
 * «Clonar anuncio»: la referencia. Se clona la ESTRUCTURA (función, duración,
 * tipo de toma, encuadre, cierre), no el material. Hoy la estructura la
 * describe una persona en este formulario; el análisis automático del video
 * queda preparado para el servidor.
 */
export function ClonarAnuncio({ enlace, transcripcion, tomas, anuncios, bloqueado, onEnlace, onTranscripcion, onTomas, cambios, onCambios, servidorActivo, producto }: Props) {
  const archivo = useRef<HTMLInputElement>(null);
  const [analisis, setAnalisis] = useState<{ trabajoId: string; detalle: string } | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [avisoAnalisis, setAvisoAnalisis] = useState<string | null>(null);
  const alTerminar = useRef({ onTomas, onTranscripcion, transcripcion });
  useEffect(() => {
    alTerminar.current = { onTomas, onTranscripcion, transcripcion };
  });

  // Mientras el servidor analiza, se consulta cada pocos segundos. Al terminar, las tomas llenan el formulario.
  const enAnalisis = analisis?.trabajoId ?? null;
  useEffect(() => {
    if (!enAnalisis) return;
    let vivo = true;
    let enVuelo = false;
    const reloj = window.setInterval(() => {
      if (enVuelo || document.hidden) return;
      enVuelo = true;
      void consultarAnalisis(enAnalisis)
        .then((r) => {
          if (!vivo) return;
          if ("error" in r) {
            setAnalisis(null);
            return void toast.error(r.error, { duration: 9000 });
          }
          if (r.estado === "en-cola" || r.estado === "analizando") return void setAnalisis({ trabajoId: enAnalisis, detalle: r.detalle });
          setAnalisis(null);
          if (r.estado !== "listo") return void setAvisoAnalisis(r.detalle);
          alTerminar.current.onTomas(r.tomas);
          if (r.transcripcion && !alTerminar.current.transcripcion.trim()) alTerminar.current.onTranscripcion(r.transcripcion);
          setAvisoAnalisis(
            [
              `El servidor encontró ${r.tomas.length} tomas. Revísalas: la clasificación la hizo la IA mirando un fotograma por toma.`,
              r.conTranscripcion ? "Trajo además lo que se dice (solo para leer su estructura)." : "No trajo lo que se dice (el servidor no tiene servicio de transcripción): si quieres, pégalo abajo.",
              r.aviso ?? "",
              "El video y sus fotogramas ya se borraron.",
            ]
              .filter(Boolean)
              .join(" "),
          );
          toast.success("Estructura del video lista: revísala");
        })
        .finally(() => {
          enVuelo = false;
        });
    }, SONDEO_ANALISIS_MS);
    return () => {
      vivo = false;
      window.clearInterval(reloj);
    };
  }, [enAnalisis]);

  async function analizar(origen: { refId?: string; url?: string }) {
    setAvisoAnalisis(null);
    const r = await analizarVideoReferencia(origen);
    if ("error" in r) return void toast.error(r.error, { duration: 10000 });
    setAnalisis({ trabajoId: r.trabajoId, detalle: "Esperando a que el servidor de videos lo tome (pregunta cada minuto)." });
  }

  async function subir(file: File | undefined) {
    if (!file) return;
    setSubiendo(true);
    try {
      const prep = await prepararVideoReferencia({ tipo: file.type, tamano: file.size });
      if ("error" in prep) return void toast.error(prep.error, { duration: 9000 });
      const { error } = await createClient().storage.from(prep.bucket).uploadToSignedUrl(prep.path, prep.token, file, { contentType: file.type });
      if (error) return void toast.error(`No se pudo subir el video: ${error.message}`, { duration: 9000 });
      await analizar({ refId: prep.refId });
    } finally {
      setSubiendo(false);
    }
  }
  const esArchivo = /\.(mp4|mov|webm)(\?|#|$)/i.test(enlace.trim());
  const ocupadoAnalisis = subiendo || !!analisis;
  const cambiar = (i: number, c: Partial<TomaReferencia>) => onTomas(tomas.map((t, j) => (j === i ? { ...t, ...c } : t)));
  const total = duracionDeReferencia(tomas);
  const abrir = enlaceSeguro(enlace);
  // Segundo en que empieza cada toma.
  const inicios = tomas.map((_, i) => duracionDeReferencia(tomas.slice(0, i)));

  return (
    <div id="clonar-anuncio" className="flex flex-col gap-4 rounded-xl border border-primary/30 bg-primary/10 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Video original</span>
        <Chip tono={tomas.length ? "verde" : "ambar"}>{tomas.length ? `${tomas.length} tomas · ${total} s` : "Falta describir sus tomas"}</Chip>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Se clona <strong className="font-medium text-foreground">cómo está construido</strong>: qué función cumple cada toma, cuánto dura, qué tipo de toma es y cómo cierra. No se copia su material: personas nuevas, sin su marca, sin sus logos, sin su música ni
        su voz, y sin sus textos literales. El producto, la oferta y el llamado a la acción son los de tu cliente.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <Label className="flex flex-col items-stretch gap-1.5">
          <span>Enlace del anuncio (para volver a verlo)</span>
          <span className="flex gap-2">
            <Input value={enlace} maxLength={500} inputMode="url" placeholder="https://…" disabled={bloqueado} onChange={(e) => onEnlace(e.target.value)} aria-label="Enlace del anuncio de referencia" />
            {abrir && (
              <a href={abrir} target="_blank" rel="noopener noreferrer" aria-label="Abrir el anuncio de referencia" className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-input bg-card hover:bg-accent">
                <ExternalLink className="size-4" />
              </a>
            )}
          </span>
        </Label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm leading-none font-medium">Archivo del video original</span>
          <input ref={archivo} type="file" hidden accept="video/mp4,video/quicktime,video/webm" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void subir(f); }} />
          <span className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={bloqueado || ocupadoAnalisis || !servidorActivo} onClick={() => archivo.current?.click()}>
              <Upload /> {subiendo ? "Subiendo…" : "Subir y analizar"}
            </Button>
            {esArchivo && (
              <Button type="button" variant="outline" disabled={bloqueado || ocupadoAnalisis || !servidorActivo} onClick={() => void analizar({ url: enlace.trim() })}>
                <ScanSearch /> Analizar el enlace
              </Button>
            )}
          </span>
          <span className="text-xs text-muted-foreground">
            {servidorActivo
              ? "El servidor saca los cortes y un fotograma por toma; la IA dice qué tipo de toma es cada una. El video se usa solo para leer su estructura y se borra. Un enlace de red social no se puede descargar: baja el video y súbelo."
              : "El análisis automático se activa al conectar el servidor de videos. Mientras tanto, describe el video toma por toma aquí abajo."}
          </span>
          {analisis && (
            <span role="status" className="rounded-lg border border-primary/30 bg-card px-2 py-1.5 text-xs" data-analisis>
              <strong className="font-medium">Analizando el video…</strong> {analisis.detalle}
            </span>
          )}
          {avisoAnalisis && (
            <span role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs leading-relaxed text-amber-700 dark:text-amber-300" data-analisis-listo>
              {avisoAnalisis}
            </span>
          )}
        </div>
      </div>

      {anuncios.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className={ETIQUETA}>O elige uno de los que trajo la investigación (los que más llevan activos)</span>
          <ul className="flex flex-col gap-1">
            {anuncios.slice(0, 5).map((a) => (
              <li key={a.ref} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1.5 text-xs">
                <span className="font-mono font-semibold text-primary">{a.ref}</span>
                <strong className="min-w-0 max-w-48 truncate font-medium">{a.anunciante || "Anunciante sin nombre"}</strong>
                <Chip>{a.dias !== null ? `${a.dias} días activo` : "días: sin dato"}</Chip>
                {a.formato !== "desconocido" && <Chip>{a.formato}</Chip>}
                <Button variant={enlace === a.enlace ? "default" : "outline"} size="xs" className="ml-auto" disabled={bloqueado || !a.enlace} onClick={() => onEnlace(a.enlace)}>
                  {enlace === a.enlace ? "Es la referencia" : "Usar de referencia"}
                </Button>
              </li>
            ))}
          </ul>
          <span className="text-xs text-muted-foreground">De estos anuncios el sistema solo conoce el texto y los días activos, no el video: ábrelo y describe sus tomas.</span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={ETIQUETA}>La estructura, toma por toma (la llena el análisis; o descríbela a mano)</span>
          {!tomas.length && (
            <Button variant="outline" size="sm" disabled={bloqueado} onClick={() => onTomas(ESTRUCTURA_TIPICA)}>
              Empezar con una estructura típica
            </Button>
          )}
        </div>
        <ol className="flex flex-col gap-2">
          {tomas.map((t, i) => {
            const desde = inicios[i];
            const hasta = desde + t.duracion;
            return (
              <li key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2" data-toma={i + 1}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">{i + 1}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {desde}–{hasta} s · paso {PASO_DE_FUNCION[t.funcion]}
                  </span>
                  <label className="ml-auto flex items-center gap-1.5 text-xs">
                    <input type="checkbox" className="size-4 accent-primary" checked={t.textoEnPantalla} disabled={bloqueado} onChange={(e) => cambiar(i, { textoEnPantalla: e.target.checked })} />
                    Texto grande en pantalla
                  </label>
                  <Button variant="ghost" size="icon-sm" aria-label={`Quitar la toma ${i + 1}`} disabled={bloqueado} onClick={() => onTomas(tomas.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)]">
                  <Input type="number" inputMode="numeric" min={1} max={20} value={t.duracion} disabled={bloqueado} aria-label={`Segundos de la toma ${i + 1}`} onChange={(e) => cambiar(i, { duracion: Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))) })} />
                  <Sel valor={t.funcion} opciones={FUNCIONES_TOMA} etiquetas={FUNCION_LABELS} nombre={`Función de la toma ${i + 1}`} disabled={bloqueado} onChange={(v) => cambiar(i, { funcion: v })} />
                  <Sel valor={t.tipo} opciones={TIPOS_TOMA} etiquetas={TIPO_TOMA_LABELS} nombre={`Tipo de la toma ${i + 1}`} disabled={bloqueado} onChange={(v) => cambiar(i, { tipo: v })} />
                  <Sel valor={t.encuadre} opciones={ENCUADRES} etiquetas={ENCUADRE_LABELS} nombre={`Encuadre de la toma ${i + 1}`} disabled={bloqueado} onChange={(v) => cambiar(i, { encuadre: v })} />
                </div>
                <Input value={t.quePasa} maxLength={300} disabled={bloqueado} placeholder="Qué pasa, con tus palabras y sin nombres ni marcas: «alguien muestra el problema en la cocina»" aria-label={`Qué pasa en la toma ${i + 1}`} onChange={(e) => cambiar(i, { quePasa: e.target.value })} />
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={bloqueado || tomas.length >= MAX_TOMAS} onClick={() => onTomas([...tomas, { ...TOMA_VACIA, funcion: tomas.length ? "demostracion" : "gancho" }])}>
            <Plus /> Agregar toma
          </Button>
          {tomas.length > 0 && <span className="text-xs text-muted-foreground">La última toma con función «Oferta» o «Cierre» será el cierre con la foto real y tu oferta.</span>}
        </div>
      </div>

      {/* ------------------------------------------------ qué cambia en el video nuevo */}
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-2" id="cambios-del-clon">
        <span className={ETIQUETA}>Qué cambia en el video nuevo</span>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked disabled readOnly />
          <span className="min-w-0 flex-1">
            Cambiar la persona (siempre: nunca se usa la del original)
            <Input className="mt-1" value={cambios.persona} maxLength={300} disabled={bloqueado} placeholder="Cómo es la nueva: «mujer de unos 35 años, pelo recogido, cocina clara». Vacío = generar una distinta" aria-label="Descripción de la persona nueva" onChange={(e) => onCambios({ ...cambios, cambiarPersona: true, persona: e.target.value })} />
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={cambios.cambiarIdioma} disabled={bloqueado} onChange={(e) => onCambios({ ...cambios, cambiarIdioma: e.target.checked })} />
          <span className="min-w-0 flex-1">
            Cambiar el idioma (el original está en otro)
            {cambios.cambiarIdioma && <Input className="mt-1" value={cambios.idioma} maxLength={80} disabled={bloqueado} placeholder="A cuál: «español de México». Vacío = el del país del proyecto" aria-label="Idioma de destino" onChange={(e) => onCambios({ ...cambios, idioma: e.target.value })} />}
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked={cambios.nombrarProducto} disabled={bloqueado} onChange={(e) => onCambios({ ...cambios, nombrarProducto: e.target.checked })} />
          Decir el nombre del producto{producto ? ` («${producto.slice(0, 60)}»)` : " del cliente"}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-primary" checked disabled readOnly />
          Cerrar con la oferta y el llamado a la acción del cliente (siempre)
        </label>
        <Textarea value={cambios.notas} maxLength={600} rows={2} disabled={bloqueado} placeholder="Otras notas: «más corto», «que salga en exteriores», «sin mostrar caras»…" aria-label="Otras notas para el video nuevo" onChange={(e) => onCambios({ ...cambios, notas: e.target.value })} />
        <span className="text-xs text-muted-foreground">El resultado es un video NUEVO, generado toma por toma con la misma estructura. Nunca se edita ni se reutiliza el original; sin sus marcas, logos ni música.</span>
      </div>

      <details className="rounded-lg border border-border bg-card">
        <summary className="cursor-pointer px-2 py-1.5 text-xs font-medium">Lo que se dice en el original (pegar o corregir), solo para leer su estructura</summary>
        <div className="border-t border-border p-2">
          <Textarea value={transcripcion} maxLength={MAX_ANUNCIO_CLON} rows={3} disabled={bloqueado} aria-label="Transcripción del anuncio de referencia" onChange={(e) => onTranscripcion(e.target.value)} />
          <span className="mt-1 block text-xs text-muted-foreground">No se copia ninguna frase: la IA toma la función de cada una y escribe las tuyas con los datos de tu cliente.</span>
        </div>
      </details>
    </div>
  );
}
