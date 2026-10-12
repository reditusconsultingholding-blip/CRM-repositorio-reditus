"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  CopyPlus,
  ExternalLink,
  FileText,
  FolderOpen,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { escribirGuion, guardarGuionVideo, resumirMercado } from "@/app/(protected)/videos/actions";
import { guardarGuion as guardarGuionProspecto } from "@/app/(protected)/prospectos/prospeccion-actions";
import type { FormatoTarjeta } from "@/lib/video-formatos";
import {
  MAX_GUION,
  MAX_REFERENCIAS,
  ORIGEN_LABELS,
  PAISES,
  REFERENCIA_VACIA,
  enlaceSeguro,
  lineaMercado,
  nombrePais,
  referenciasUtiles,
  rellenar,
  urlAdsLibrary,
  urlTikTokBusqueda,
  urlTikTokCreativeCenter,
  type DatosVideo,
  type GuionGuardado,
  type OrigenGuion,
  type Referencia,
} from "@/lib/videos";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Chip, ETIQUETA } from "@/components/prospectos/piezas";

export type ProspectoOrigen = { id: string; nombre: string };

type Props = {
  formatos: FormatoTarjeta[];
  guiones: GuionGuardado[];
  errorLista: string | null;
  inicial: Partial<DatosVideo>;
  prospecto: ProspectoOrigen | null;
  prospectoNoEncontrado: boolean;
  puedeUsarEnProspecto: boolean;
  videoActivo: boolean;
};

const VACIO: DatosVideo = {
  formato: "",
  producto: "",
  pais: "CO",
  cliente: "",
  enlace: "",
  oferta: "",
  valores: "",
  paisBusqueda: "CO",
  palabraClave: "",
  referencias: [{ ...REFERENCIA_VACIA }],
  resumenMercado: "",
};

const ITEMS_PAIS = Object.fromEntries(PAISES.map((p) => [p.codigo, p.nombre]));

async function copiar(texto: string, aviso: string) {
  try {
    await navigator.clipboard.writeText(texto);
    toast.success(aviso);
  } catch {
    toast.error("No se pudo copiar. Selecciona el texto y cópialo a mano.");
  }
}

function fecha(iso: string) {
  if (!iso) return "—";
  // Zona fija: el servidor y el navegador deben escribir lo mismo.
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  });
}

function Paso({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-xs text-primary">{n}</span>
      {children}
    </span>
  );
}

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <Label className="flex flex-col items-stretch gap-1.5">
      <span>{etiqueta}</span>
      {children}
      {ayuda && <span className="text-xs font-normal text-muted-foreground">{ayuda}</span>}
    </Label>
  );
}

function EnlaceBoton({ href, children }: { href: string | null; children: React.ReactNode }) {
  const clase = buttonVariants({ variant: "outline" });
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(clase, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={clase}>
      {children}
    </a>
  );
}

export function CrearVideo(props: Props) {
  const { formatos, prospecto } = props;
  const [datos, setDatos] = useState<DatosVideo>({ ...VACIO, ...props.inicial });
  const [guion, setGuion] = useState("");
  const [origen, setOrigen] = useState<OrigenGuion>("manual");
  const [idGuardado, setIdGuardado] = useState<string | null>(null);
  const [guardadoTexto, setGuardadoTexto] = useState<string | null>(null);
  const [prospectoId, setProspectoId] = useState<string | null>(prospecto?.id ?? null);
  const [indicacion, setIndicacion] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoMercado, setAvisoMercado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"mercado" | "guion" | "guardar" | "prospecto" | null>(null);
  const [guiones, setGuiones] = useState(props.guiones);
  const arriba = useRef<HTMLDivElement>(null);

  const formato = useMemo(() => formatos.find((f) => f.slug === datos.formato) ?? null, [formatos, datos.formato]);
  const refsUtiles = referenciasUtiles(datos.referencias);
  const palabra = (datos.palabraClave || datos.producto).trim();
  const listoParaEscribir = !!formato && !!datos.producto.trim();
  const sinGuardar = !!guion.trim() && guion !== guardadoTexto;

  function set<K extends keyof DatosVideo>(k: K, v: DatosVideo[K]) {
    setDatos((d) => ({ ...d, [k]: v }));
  }
  function setRef(i: number, cambio: Partial<Referencia>) {
    setDatos((d) => ({ ...d, referencias: d.referencias.map((r, j) => (j === i ? { ...r, ...cambio } : r)) }));
  }

  function confirmarReemplazo() {
    return !guion.trim() || window.confirm("Ya hay un guion escrito. ¿Reemplazarlo por una versión nueva?");
  }

  function usarPlantilla() {
    if (!formato || !confirmarReemplazo()) return;
    setGuion(`${lineaMercado(datos.referencias)}\n\n${rellenar(formato.plantilla, datos)}`);
    setOrigen("plantilla");
    setAviso(null);
  }

  async function generar() {
    if (!confirmarReemplazo()) return;
    setOcupado("guion");
    setAviso(null);
    const r = await escribirGuion(datos, indicacion);
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    setGuion(r.texto);
    setOrigen(r.origen);
    setAviso(r.aviso ?? null);
    if (r.origen === "ia") {
      toast.success("Guion listo");
      setIndicacion("");
    }
  }

  async function resumir() {
    setOcupado("mercado");
    setAvisoMercado(null);
    const r = await resumirMercado(datos);
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    set("resumenMercado", r.resumen);
    setAvisoMercado(r.aviso ?? null);
    if (!r.aviso) toast.success("Patrones resumidos a partir de lo que pegaste");
  }

  async function guardar(comoNuevo: boolean) {
    setOcupado("guardar");
    const r = await guardarGuionVideo({ id: comoNuevo ? null : idGuardado, datos, guion, origen, prospectoId });
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    const g = r.guardado;
    setIdGuardado(g.id);
    setGuardadoTexto(g.guion);
    setGuiones((lista) => [g, ...lista.filter((x) => x.id !== g.id)]);
    toast.success(comoNuevo || !idGuardado ? "Guion guardado" : "Cambios guardados");
  }

  async function usarEnProspecto() {
    if (!prospecto) return;
    if (!window.confirm(`Esto reemplaza el guion actual de «${prospecto.nombre}» en su ficha. ¿Continuar?`)) return;
    setOcupado("prospecto");
    const r = await guardarGuionProspecto(prospecto.id, guion);
    setOcupado(null);
    if (r.error) toast.error(r.error, { duration: 9000 });
    else toast.success("Guion copiado a la ficha del prospecto");
  }

  function abrir(g: GuionGuardado, duplicar: boolean) {
    if (sinGuardar && !window.confirm("Tienes un guion sin guardar. ¿Descartarlo y abrir este?")) return;
    setDatos({
      formato: g.formato,
      producto: g.producto,
      pais: g.pais,
      cliente: g.cliente,
      enlace: g.enlace,
      oferta: g.oferta,
      valores: g.valores,
      paisBusqueda: g.paisBusqueda,
      palabraClave: g.palabraClave,
      referencias: g.referencias.length ? g.referencias : [{ ...REFERENCIA_VACIA }],
      resumenMercado: g.resumenMercado,
    });
    setGuion(g.guion);
    setOrigen(g.origen);
    setIdGuardado(duplicar ? null : g.id);
    setGuardadoTexto(duplicar ? null : g.guion);
    // Una copia no hereda el prospecto, salvo que sea el de esta visita.
    setProspectoId(duplicar ? (prospecto?.id ?? null) : g.prospectoId);
    setAviso(null);
    setAvisoMercado(null);
    arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.success(duplicar ? "Copia lista: cambia lo que necesites y guárdala" : "Guion abierto");
  }

  return (
    <div ref={arriba} className="flex scroll-mt-20 flex-col gap-4">
      <div>
        {prospecto && (
          <Link
            href={`/prospectos/${prospecto.id}`}
            className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> {prospecto.nombre}
          </Link>
        )}
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Crear video</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Elige el formato, pon el producto y lo que dio el cliente, mira qué anuncios están escalando y sal con el guion
          listo para producir, con la estructura de video ganador de Reditus.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {prospecto && <Chip tono="azul">Viene del prospecto: {prospecto.nombre}</Chip>}
          {idGuardado && <Chip tono={sinGuardar ? "ambar" : "verde"}>{sinGuardar ? "Cambios sin guardar" : "Guardado"}</Chip>}
        </div>
        {props.prospectoNoEncontrado && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            No se encontró ese prospecto o no lo tienes asignado. Puedes crear el guion igual, llenando los datos a mano.
          </p>
        )}
      </div>

      {/* ------------------------------------------------ 01 formato */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="01">Formato</Paso>
          </CardTitle>
          <CardDescription>
            Todos siguen la misma estructura (impacto, bajada, refuerzo, subida con el producto y llamado a la acción);
            cambia cómo se ve y qué hay que conseguir.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Formato del video" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {formatos.map((f) => {
              const activo = f.slug === datos.formato;
              return (
                <button
                  key={f.slug}
                  type="button"
                  role="radio"
                  aria-checked={activo}
                  onClick={() => set("formato", f.slug)}
                  className={cn(
                    "flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    activo ? "border-primary bg-primary/10" : "border-border bg-card hover:border-ring/60 hover:bg-muted/40",
                  )}
                >
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="font-heading text-base font-semibold">{f.nombre}</span>
                    {f.estado === "por confirmar" && <Chip tono="ambar">Por confirmar</Chip>}
                  </span>
                  <span className="text-xs leading-relaxed text-muted-foreground">{f.para_que_sirve}</span>
                  <span className="mt-auto flex flex-col gap-1 pt-1">
                    <span className={ETIQUETA}>Necesita</span>
                    <span className="text-xs">{f.necesita.join(" · ")}</span>
                    <span className="text-xs text-muted-foreground">
                      {f.duracion} · {f.relacion_aspecto}
                      {f.etapa_embudo ? ` · ${f.etapa_embudo}` : ""}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          {formato && (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-4">
              {formato.estado === "por confirmar" && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300">
                  <strong>Formato por confirmar.</strong> No está documentado en la base de Reditus; lo que ves es una
                  interpretación de trabajo. Confianza: {formato.confianza}
                </p>
              )}
              <div className="grid gap-4 md:grid-cols-3">
                <Lista titulo="Cuándo usarlo" items={formato.cuando_si} />
                <Lista titulo="Cuándo no" items={formato.cuando_no} />
                <Lista titulo="Riesgos" items={formato.riesgos} />
              </div>
              <details className="group">
                <summary className="cursor-pointer text-xs font-medium text-primary outline-none hover:underline focus-visible:underline">
                  Ver la estructura escena por escena
                </summary>
                <div className="mt-2 overflow-x-auto rounded-lg border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tiempo</TableHead>
                        <TableHead>Escena</TableHead>
                        <TableHead>Qué pasa</TableHead>
                        <TableHead>De dónde sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formato.estructura.map((e) => (
                        <TableRow key={e.tiempo + e.escena}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{e.tiempo}</TableCell>
                          <TableCell className="font-medium">{e.escena}</TableCell>
                          <TableCell className="min-w-64 whitespace-normal">{e.que_pasa}</TableCell>
                          <TableCell className="text-xs whitespace-normal text-muted-foreground">{e.fuente}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {/* --------------------------------------------- 02 producto */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="02">Producto y datos del cliente</Paso>
          </CardTitle>
          <CardDescription>
            La IA solo usa lo que escribas aquí. Lo que falte queda entre [corchetes] en el guion para completarlo con el
            cliente: no se inventan precios, cifras ni testimonios.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Campo etiqueta="Producto">
            <Input
              value={datos.producto}
              onChange={(e) => set("producto", e.target.value)}
              maxLength={240}
              placeholder="Nombre y qué es, en pocas palabras"
            />
          </Campo>
          <Campo etiqueta="País del video (acento y oferta)">
            <Select
              items={ITEMS_PAIS}
              value={datos.pais}
              onValueChange={(v) => {
                if (!v) return;
                // La búsqueda sigue al país mientras nadie la haya cambiado a mano.
                setDatos((d) => ({ ...d, pais: v as string, paisBusqueda: d.paisBusqueda === d.pais ? (v as string) : d.paisBusqueda }));
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAISES.map((p) => (
                  <SelectItem key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Campo>
          <Campo etiqueta="Cliente o marca">
            <Input value={datos.cliente} onChange={(e) => set("cliente", e.target.value)} maxLength={160} />
          </Campo>
          <Campo etiqueta="Enlace de la tienda o del producto">
            <Input
              value={datos.enlace}
              onChange={(e) => set("enlace", e.target.value)}
              maxLength={500}
              inputMode="url"
              placeholder="https://…"
            />
          </Campo>
          <div className="md:col-span-2">
            <Campo
              etiqueta="Oferta"
              ayuda="Tal como la dio el cliente: precio, envío, forma de pago, promoción. Si no la tienes, déjala vacía."
            >
              <Input
                value={datos.oferta}
                onChange={(e) => set("oferta", e.target.value)}
                maxLength={400}
                placeholder="Ej.: envío gratis a todo el país y pago contra entrega"
              />
            </Campo>
          </div>
          <div className="md:col-span-2">
            <Campo
              etiqueta="Valores que dio el cliente"
              ayuda="Beneficios, a quién le vende, dolores, objeciones, lo que NO se puede decir, referencias que le gustan."
            >
              <Textarea value={datos.valores} onChange={(e) => set("valores", e.target.value)} maxLength={4000} rows={4} />
            </Campo>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------- 03 investigación */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="03">Investigación de mercado</Paso>
          </CardTitle>
          <CardDescription>
            El CRM no puede leer la biblioteca de anuncios por su cuenta: la búsqueda la abres tú, miras y pegas lo que
            viste. La IA resume solo lo que pegues; no ha visto ningún anuncio.
          </CardDescription>
          <CardAction>
            <Chip tono={refsUtiles.length ? "azul" : "neutro"}>
              {refsUtiles.length
                ? `${refsUtiles.length} ${refsUtiles.length === 1 ? "referencia" : "referencias"}`
                : "Sin referencias de mercado"}
            </Chip>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
            <Campo etiqueta="Buscar en">
              <Select items={ITEMS_PAIS} value={datos.paisBusqueda} onValueChange={(v) => v && set("paisBusqueda", v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAISES.map((p) => (
                    <SelectItem key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Campo>
            <Campo etiqueta="Palabra clave">
              <Input
                value={datos.palabraClave}
                onChange={(e) => set("palabraClave", e.target.value)}
                maxLength={120}
                placeholder={datos.producto.trim() || "Como lo buscaría el comprador: «faja reductora», «colágeno»…"}
              />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-2">
            <EnlaceBoton href={palabra ? urlAdsLibrary(datos.paisBusqueda, palabra) : null}>
              <Search /> Biblioteca de anuncios de Meta
            </EnlaceBoton>
            <EnlaceBoton href={urlTikTokCreativeCenter(datos.paisBusqueda)}>
              <ExternalLink /> TikTok Creative Center
            </EnlaceBoton>
            <EnlaceBoton href={palabra ? urlTikTokBusqueda(palabra) : null}>
              <ExternalLink /> Buscar en TikTok
            </EnlaceBoton>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Empieza por {nombrePais(datos.pais)}. Si hay pocos anuncios del nicho, cambia «Buscar en» a Ecuador o al país
            donde más se esté pautando. Fíjate en los que llevan más tiempo activos y en los que tienen varias versiones
            del mismo anuncio: son las mejores señales de que están escalando. En TikTok Creative Center la palabra se
            escribe allá; si el país no aparece, elige el más cercano.
          </p>

          <div className="flex flex-col gap-3">
            <span className={ETIQUETA}>Referencias que viste (de 1 a {MAX_REFERENCIAS})</span>
            {datos.referencias.map((r, i) => {
              const enlace = enlaceSeguro(r.enlace);
              return (
                <div key={i} className="grid gap-2 rounded-xl border border-border bg-muted/30 p-3 md:grid-cols-[minmax(0,1fr)_7rem_7rem_auto]">
                  <div className="flex gap-2 md:col-span-4">
                    <Input
                      value={r.enlace}
                      onChange={(e) => setRef(i, { enlace: e.target.value })}
                      maxLength={500}
                      inputMode="url"
                      placeholder="Enlace del anuncio o del video"
                      aria-label={`Enlace de la referencia ${i + 1}`}
                    />
                    {enlace && (
                      <a
                        href={enlace}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={buttonVariants({ variant: "ghost", size: "icon" })}
                        aria-label={`Abrir la referencia ${i + 1}`}
                      >
                        <ExternalLink />
                      </a>
                    )}
                  </div>
                  <Input
                    value={r.gancho}
                    onChange={(e) => setRef(i, { gancho: e.target.value })}
                    maxLength={600}
                    placeholder="Qué hace el gancho: qué se ve y qué se dice en los primeros 3 segundos"
                    aria-label={`Qué hace el gancho de la referencia ${i + 1}`}
                  />
                  <Input
                    value={r.dias}
                    onChange={(e) => setRef(i, { dias: e.target.value })}
                    maxLength={60}
                    placeholder="Días activo"
                    aria-label={`Días activo de la referencia ${i + 1}`}
                  />
                  <Input
                    value={r.duplicados}
                    onChange={(e) => setRef(i, { duplicados: e.target.value })}
                    maxLength={60}
                    placeholder="Duplicados"
                    aria-label={`Duplicados de la referencia ${i + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar la referencia ${i + 1}`}
                    disabled={datos.referencias.length === 1 && !r.enlace && !r.gancho && !r.dias && !r.duplicados}
                    onClick={() =>
                      setDatos((d) => {
                        const resto = d.referencias.filter((_, j) => j !== i);
                        return { ...d, referencias: resto.length ? resto : [{ ...REFERENCIA_VACIA }] };
                      })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={datos.referencias.length >= MAX_REFERENCIAS}
                onClick={() => setDatos((d) => ({ ...d, referencias: [...d.referencias, { ...REFERENCIA_VACIA }] }))}
              >
                <Plus /> Agregar referencia
              </Button>
              <Button variant="outline" disabled={!refsUtiles.length || !listoParaEscribir || !!ocupado} onClick={resumir}>
                <Sparkles className={cn(ocupado === "mercado" && "animate-pulse")} />
                {ocupado === "mercado" ? "Resumiendo…" : "Resumir patrones con IA"}
              </Button>
              {!refsUtiles.length && (
                <span className="text-xs text-muted-foreground">
                  Sin referencias el guion se genera igual y lo deja escrito en su primera línea.
                </span>
              )}
            </div>
          </div>

          {avisoMercado && <Aviso>{avisoMercado}</Aviso>}
          {(datos.resumenMercado || refsUtiles.length > 0) && (
            <Campo
              etiqueta="Patrones del mercado"
              ayuda="Sale solo de las referencias pegadas y de la base de conocimiento de Reditus. Puedes corregirlo: el guion usa este texto."
            >
              <Textarea
                value={datos.resumenMercado}
                onChange={(e) => set("resumenMercado", e.target.value)}
                maxLength={6000}
                rows={6}
                placeholder="Resume los patrones con IA o escríbelos tú."
              />
            </Campo>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------- 04 guion */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="04">Guion</Paso>
          </CardTitle>
          <CardDescription>
            {formato
              ? `Formato ${formato.nombre}, con la estructura de video ganador. Edítalo con libertad antes de guardarlo.`
              : "Elige un formato y escribe el producto para poder generarlo."}
          </CardDescription>
          <CardAction className="flex items-center gap-1">
            {guion.trim() && <Chip>{ORIGEN_LABELS[origen]}</Chip>}
            <Button variant="ghost" size="sm" disabled={!guion.trim()} onClick={() => copiar(guion, "Guion copiado")}>
              <Copy /> Copiar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {aviso && <Aviso>{aviso}</Aviso>}
          <Textarea
            value={guion}
            onChange={(e) => {
              setGuion(e.target.value);
              if (!guion.trim()) setOrigen("manual");
            }}
            rows={guion.trim() ? 22 : 6}
            maxLength={MAX_GUION}
            placeholder="Todavía no hay guion. Genéralo con IA, parte de la plantilla del formato o escríbelo aquí."
            className="max-h-[640px] font-mono text-[13px] leading-relaxed"
            aria-label="Guion"
          />
          <div className="flex flex-col gap-2 border-t border-border pt-3 lg:flex-row">
            <Input
              value={indicacion}
              onChange={(e) => setIndicacion(e.target.value)}
              maxLength={600}
              placeholder="Indicación opcional: «más corto», «gancho de humor», «para público de 50+»…"
              aria-label="Indicación para la IA"
            />
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" disabled={!listoParaEscribir || !!ocupado} onClick={usarPlantilla}>
                <FileText /> Usar la plantilla
              </Button>
              <Button disabled={!listoParaEscribir || !!ocupado} onClick={generar}>
                {guion.trim() ? <RefreshCw className={cn(ocupado === "guion" && "animate-spin")} /> : <Sparkles />}
                {ocupado === "guion" ? "Escribiendo…" : guion.trim() ? "Regenerar con IA" : "Generar con IA"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ----------------------------------------------- 05 guardar */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="05">Guardar</Paso>
          </CardTitle>
          <CardDescription>
            Queda en «Guiones guardados», con el formato, los datos y las referencias, para reabrirlo o duplicarlo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button disabled={!guion.trim() || !listoParaEscribir || !!ocupado} onClick={() => guardar(false)}>
            <Save /> {ocupado === "guardar" ? "Guardando…" : idGuardado ? "Guardar cambios" : "Guardar guion"}
          </Button>
          {idGuardado && (
            <Button variant="outline" disabled={!guion.trim() || !listoParaEscribir || !!ocupado} onClick={() => guardar(true)}>
              <CopyPlus /> Guardar como nuevo
            </Button>
          )}
          {prospecto && props.puedeUsarEnProspecto && (
            <Button variant="outline" disabled={!guion.trim() || !!ocupado} onClick={usarEnProspecto}>
              <Send /> {ocupado === "prospecto" ? "Copiando…" : "Usar en el prospecto"}
            </Button>
          )}
          {prospecto && !props.puedeUsarEnProspecto && (
            <span className="text-xs text-muted-foreground">
              Solo el equipo comercial puede reemplazar el guion de la ficha del prospecto.
            </span>
          )}
        </CardContent>
      </Card>

      {/* ----------------------------------------- 06 generar video */}
      <Card>
        <CardHeader>
          <CardTitle>
            <Paso n="06">Generar video</Paso>
          </CardTitle>
          <CardDescription>
            Se activa al conectar un modelo de video. Mientras tanto, aquí están los prompts por escena del formato, con
            tus datos, para generarlos a mano.
          </CardDescription>
          <CardAction>
            <Button disabled={!props.videoActivo} title="Se activa al conectar un modelo de video">
              <Lock /> Generar video
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {!formato && <p className="text-sm text-muted-foreground">Elige un formato para ver sus prompts por escena.</p>}
          {formato?.prompts.map((p) => {
            const texto = rellenar(p.prompt, datos);
            return (
              <details key={p.escena} className="rounded-xl border border-border bg-muted/30">
                <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                  {p.escena}
                </summary>
                <div className="flex flex-col gap-2 border-t border-border p-3">
                  <pre className="font-mono text-[12.5px] leading-relaxed break-words whitespace-pre-wrap">{texto}</pre>
                  <Button variant="ghost" size="sm" className="self-end" onClick={() => copiar(texto, "Prompt copiado")}>
                    <Copy /> Copiar prompt
                  </Button>
                </div>
              </details>
            );
          })}
        </CardContent>
      </Card>

      {/* ------------------------------------------- guiones guardados */}
      <Card>
        <CardHeader>
          <CardTitle>Guiones guardados</CardTitle>
          <CardDescription>Los más recientes del equipo. Ábrelos para seguir editando o duplícalos para otro producto.</CardDescription>
        </CardHeader>
        <CardContent>
          {props.errorLista && <Aviso>{props.errorLista}</Aviso>}
          {guiones.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay guiones guardados.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {guiones.map((g) => (
                    <TableRow key={g.id} data-state={g.id === idGuardado ? "selected" : undefined}>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {fecha(g.actualizadoAt || g.creadoAt)}
                      </TableCell>
                      <TableCell>{g.formatoNombre || g.formato}</TableCell>
                      <TableCell className="max-w-56 truncate font-medium">{g.producto}</TableCell>
                      <TableCell className="max-w-40 truncate">{g.cliente || "—"}</TableCell>
                      <TableCell className="max-w-40 truncate text-muted-foreground">{g.autorNombre || "—"}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => abrir(g, false)}>
                            <FolderOpen /> Abrir
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => abrir(g, true)}>
                            <CopyPlus /> Duplicar
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Lista({ titulo, items }: { titulo: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className={ETIQUETA}>{titulo}</span>
      <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed">
        {items.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-700 dark:text-amber-300"
    >
      {children}
    </p>
  );
}
