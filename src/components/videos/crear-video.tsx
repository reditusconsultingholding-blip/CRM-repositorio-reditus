"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  CopyPlus,
  ExternalLink,
  FileText,
  FolderOpen,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { analizarProducto, consultarFuentesVideo, escribirGuion, guionesAlDia, regenerarCierre, guardarGuionVideo, misVideos, resumirMercado } from "@/app/(protected)/videos/actions";
import { analizarFotos, crearProyecto, type EstadoConfig } from "@/app/(protected)/videos/proyecto-actions";
import { FICHA_VACIA, fichaConDatos, hayTrabajoEnCurso } from "@/lib/proyecto-video";
import { guardarGuion as guardarGuionProspecto } from "@/app/(protected)/prospectos/prospeccion-actions";
import type { FormatoTarjeta } from "@/lib/video-formatos";
import {
  ESTADO_GUION_LABELS,
  MAX_ANUNCIO_CLON,
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
  rotuloInvestigacion,
  porqueDeFormato,
  faltaEnElCierre,
  versionVigente,
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
import { CorreccionesCliente, TONO_ESTADO } from "./correcciones";
import { GenerarVideo } from "./generar-video";
import { MisVideos } from "./mis-videos";
import type { EstadoFuente } from "@/lib/investigacion-video/tipos";
import { corchetes, trabajoActivo, type TrabajoVista } from "@/lib/trabajos-video";
import { FotosProducto, enlacesDeFotos } from "./fotos-producto";
import { FichaProductoBloque } from "./ficha-producto";
import { ConvertirEnProyecto } from "./proyecto-video";
import { ClonarAnuncio } from "./clonar-anuncio";
import { CAMBIOS_VACIOS } from "@/lib/clonacion-video";
import { EstudioVideo } from "./estudio-video";
import { ListaProyectos } from "./proyectos-lista";
import { AprendizajesVideos } from "./aprendizajes";
import { MusicaVideos } from "./musica-videos";
import { VISTAS_CREATIVOS, esVistaCreativos, type VistaCreativos } from "@/lib/videos-vistas";
import { enProduccion } from "@/lib/progreso-video";
import { ChevronDown, ChevronUp, BellRing } from "lucide-react";
import { resumenProyecto } from "@/lib/proyecto-video";
import { Clapperboard, ScanSearch } from "lucide-react";
import { BandejaAtencion, pendientesDe } from "./bandeja-atencion";
import { ConfigVideosTarjeta } from "./config-videos";
import { LotesVideos, type ProspectoLote } from "./lotes-videos";

export type ProspectoOrigen = { id: string; nombre: string };

type Props = {
  formatos: FormatoTarjeta[];
  guiones: GuionGuardado[];
  errorLista: string | null;
  inicial: Partial<DatosVideo>;
  prospecto: ProspectoOrigen | null;
  prospectoNoEncontrado: boolean;
  puedeUsarEnProspecto: boolean;
  /** Hay servidor de videos conectado (existe SERVIDOR_SECRET en el entorno). */
  videoActivo: boolean;
  /** Puede dar el sí a un video generado (equipo comercial). */
  puedeAprobarVideo: boolean;
  /** El CEO puede reabrir los intentos de una escena que llegó al tope. */
  esCeo: boolean;
  /** Topes y automatización vigentes, con lo usado hoy. */
  config: EstadoConfig | null;
  /** Prospectos del embudo que se pueden meter a un lote (solo equipo comercial). */
  prospectosLote: ProspectoLote[];
  /** Guion que se abre al entrar (`/videos?guion=<id>`, el enlace de los avisos). */
  abrirGuionId: string | null;
  /** Lo que va debajo de «Guiones guardados» (la cola de videos del CEO). */
  children?: React.ReactNode;
  /** Quien está viendo la pantalla: «Mis videos» muestra lo que pidió. */
  userId: string;
  /** Último trabajo de video de cada guion suyo, por id de guion. */
  misTrabajos: Record<string, TrabajoVista>;
};

const ETIQUETA_FUENTE: Record<EstadoFuente, string> = {
  ok: "Consultada",
  vacia: "Sin resultados",
  sin_clave: "Sin conectar",
  fallo: "Falló",
  sin_tiempo: "Sin tiempo",
  no_consultada: "No consultada",
};
const TONO_FUENTE: Record<EstadoFuente, "neutro" | "azul" | "ambar" | "verde" | "rojo"> = {
  ok: "verde",
  vacia: "neutro",
  sin_clave: "ambar",
  fallo: "rojo",
  sin_tiempo: "ambar",
  no_consultada: "neutro",
};

const VACIO: DatosVideo = {
  formato: "",
  producto: "",
  pais: "CO",
  cliente: "",
  enlace: "",
  oferta: "",
  llamado: "",
  valores: "",
  paisBusqueda: "CO",
  palabraClave: "",
  referencias: [{ ...REFERENCIA_VACIA }],
  resumenMercado: "",
  anuncioClon: "",
  anuncioClonEnlace: "",
  analisisProducto: "",
  analisisLeyoPagina: false,
  formatosRecomendados: [],
  anunciosHallados: [],
  fuentesInvestigacion: [],
  investigacionCache: "",
  fotosProducto: [],
  fichaProducto: FICHA_VACIA,
  referenciaTomas: [],
  clonCambios: CAMBIOS_VACIOS,
};

/** Los campos del formulario tal como quedaron en un guion guardado. */
function datosDe(g: GuionGuardado): DatosVideo {
  return {
    formato: g.formato,
    producto: g.producto,
    pais: g.pais,
    cliente: g.cliente,
    enlace: g.enlace,
    oferta: g.oferta,
    llamado: g.llamado,
    valores: g.valores,
    paisBusqueda: g.paisBusqueda,
    palabraClave: g.palabraClave,
    referencias: g.referencias.length ? g.referencias : [{ ...REFERENCIA_VACIA }],
    resumenMercado: g.resumenMercado,
    anuncioClon: g.anuncioClon,
    anuncioClonEnlace: g.anuncioClonEnlace,
    analisisProducto: g.analisisProducto,
    analisisLeyoPagina: g.analisisLeyoPagina,
    formatosRecomendados: g.formatosRecomendados,
    anunciosHallados: g.anunciosHallados,
    fuentesInvestigacion: g.fuentesInvestigacion,
    investigacionCache: g.investigacionCache,
    fotosProducto: g.fotosProducto,
    fichaProducto: g.fichaProducto,
    referenciaTomas: g.referenciaTomas,
    clonCambios: g.clonCambios,
  };
}

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
  // Llegada desde un aviso («tu video está listo», `/videos?guion=<id>`): la
  // pantalla arranca con ese guion ya abierto.
  const [deEnlace] = useState(() => (props.abrirGuionId ? (props.guiones.find((x) => x.id === props.abrirGuionId) ?? null) : null));
  const [datos, setDatos] = useState<DatosVideo>(deEnlace ? datosDe(deEnlace) : { ...VACIO, ...props.inicial });
  const [guion, setGuion] = useState(deEnlace?.guion ?? "");
  const [origen, setOrigen] = useState<OrigenGuion>(deEnlace?.origen ?? "manual");
  const [idGuardado, setIdGuardado] = useState<string | null>(deEnlace?.id ?? null);
  const [guardadoTexto, setGuardadoTexto] = useState<string | null>(deEnlace?.guion ?? null);
  const [prospectoId, setProspectoId] = useState<string | null>(deEnlace ? deEnlace.prospectoId : (prospecto?.id ?? null));
  const [indicacion, setIndicacion] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoMercado, setAvisoMercado] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"mercado" | "guion" | "guardar" | "prospecto" | "todo" | null>(null);
  const [guiones, setGuiones] = useState(props.guiones);
  // Fotos reales del producto (enlaces https, uno por línea). Se guardan con el guion (`fotosProducto`).
  const [fotos, setFotos] = useState(deEnlace ? deEnlace.fotosProducto.join("\n") : "");
  const fotosRef = useRef(fotos);
  useEffect(() => {
    fotosRef.current = fotos;
  });
  const listaFotos = useMemo(() => enlacesDeFotos(fotos), [fotos]);
  // Las dos entradas: «Crear video» (del producto al plan) y «Clonar anuncio» (de una referencia al plan).
  const [modoEstado, setModo] = useState<"crear" | "clonar">(deEnlace?.referenciaTomas.length ? "clonar" : "crear");
  // La sección a la vista sale de la dirección (`/videos?vista=…`): así cada una tiene su enlace y su entrada en el menú.
  const parametros = useSearchParams();
  const vistaPedida = parametros.get("vista");
  const vista: VistaCreativos = esVistaCreativos(vistaPedida) ? vistaPedida : deEnlace && versionVigente(deEnlace)?.proyecto ? "estudio" : modoEstado;
  const modo: "crear" | "clonar" = vista === "clonar" ? "clonar" : vista === "crear" ? "crear" : modoEstado;
  const enCrear = vista === "crear" || vista === "clonar";
  // En «Estudio de video»: se está eligiendo otro video aunque haya uno abierto.
  const [eligiendo, setEligiendo] = useState(false);
  // El paso a paso manual va plegado: lo normal es «Generar todo».
  const [pasosAbiertos, setPasosAbiertos] = useState(false);
  function irA(v: VistaCreativos) {
    const q = new URLSearchParams({ vista: v });
    if (prospecto) q.set("prospecto", prospecto.id);
    window.history.pushState(null, "", `/videos?${q.toString()}`);
    if (v === "crear" || v === "clonar") setModo(v);
    setEligiendo(false);
  }
  const setEstudio = (v: boolean) => irA(v ? "estudio" : modoEstado);
  /** Los datos tal como se guardan y viajan al servidor: con las fotos puestas (y la referencia solo si se está clonando). */
  const datosCompletos = useMemo<DatosVideo>(
    () => ({ ...datos, fotosProducto: listaFotos, referenciaTomas: modo === "clonar" ? datos.referenciaTomas : [] }),
    [datos, listaFotos, modo],
  );
  const arriba = useRef<HTMLDivElement>(null);

  const formato = useMemo(() => formatos.find((f) => f.slug === datos.formato) ?? null, [formatos, datos.formato]);
  const refsUtiles = referenciasUtiles(datos.referencias);
  const palabra = (datos.palabraClave || datos.producto).trim();
  const listoParaEscribir = !!formato && !!datos.producto.trim();
  const sinGuardar = !!guion.trim() && guion !== guardadoTexto;
  const actual = useMemo(() => guiones.find((g) => g.id === idGuardado) ?? null, [guiones, idGuardado]);
  // Qué pasos de la estructura están rotulados en el guion que hay en el editor.
  const pasosRotulados = useMemo(() => [1, 2, 3, 4, 5].filter((n) => new RegExp(`^\\s*PASO ${n}\\b`, "mi").test(guion)), [guion]);

  // ---- flujo de un solo OK: investigar → guion → datos que faltan → guardar → cola de video
  const [fase, setFase] = useState<string | null>(null);
  const [avisoRapido, setAvisoRapido] = useState<string | null>(null);
  const [faltantes, setFaltantes] = useState<{ texto: string; origen: OrigenGuion; campos: string[]; valores: Record<string, string> } | null>(null);
  const [misTrabajos, setMisTrabajos] = useState(props.misTrabajos);
  const investigado = useRef<string>("");
  const misGuiones = useMemo(() => guiones.filter((g) => g.autorId === props.userId).slice(0, 6), [guiones, props.userId]);
  // El cierre del guion que hay en el editor: qué le falta para traer oferta + llamado a la acción.
  const cierreFalta = useMemo(() => (guion.trim() ? faltaEnElCierre(guion, datos) : []), [guion, datos]);
  const hayVideoEnMarcha =
    Object.values(misTrabajos).some((t) => trabajoActivo(t.estado)) ||
    misGuiones.some((g) => g.id !== idGuardado && g.versiones.some((v) => v.proyecto && hayTrabajoEnCurso(v.proyecto)));
  const vigenteActual = actual ? versionVigente(actual) : null;
  const estudioAbierto = vista === "estudio" && !!actual && !!vigenteActual?.proyecto && !eligiendo;
  const porAtender = useMemo(() => pendientesDe(guiones).length, [guiones]);
  // Las listas avanzan solas mientras algún video se esté produciendo (sin recargar la página).
  const hayAvance = useMemo(
    () =>
      guiones.some((g) => {
        const p = versionVigente(g)?.proyecto;
        return !!p && enProduccion(p) && (hayTrabajoEnCurso(p) || (p.auto.activo && !p.auto.parada));
      }),
    [guiones],
  );
  const listaALaVista = vista === "mis-videos" || (vista === "estudio" && !estudioAbierto);
  const refrescarLista = useRef<() => void>(() => {});
  useEffect(() => {
    refrescarLista.current = () => void refrescarGuiones(true);
  });
  useEffect(() => {
    if (!hayAvance || !listaALaVista) return;
    const reloj = window.setInterval(() => {
      if (!document.hidden) refrescarLista.current();
    }, 8000);
    return () => window.clearInterval(reloj);
  }, [hayAvance, listaALaVista]);

  // Mientras haya un video en proceso, «Mis videos» se pone al día solo.
  useEffect(() => {
    if (!hayVideoEnMarcha) return;
    const reloj = window.setInterval(async () => {
      if (document.hidden) return;
      const r = await misVideos();
      if ("error" in r) return;
      setMisTrabajos(r.trabajos);
      // Los proyectos por escenas de los guiones que no están abiertos también avanzan.
      setGuiones((lista) => lista.map((g) => (g.id === idGuardado ? g : (r.guiones.find((x) => x.id === g.id) ?? g))));
    }, 15000);
    return () => window.clearInterval(reloj);
  }, [hayVideoEnMarcha, idGuardado]);

  /** Análisis del producto. Devuelve los datos ya actualizados (el estado tarda un render). */
  async function investigar(base: DatosVideo, forzar = false): Promise<DatosVideo | null> {
    if (!base.producto.trim()) {
      toast.error("Escribe el producto para poder investigarlo.");
      return null;
    }
    investigado.current = base.producto.trim();
    setAvisoRapido(null);
    // Paso 1: las fuentes (anuncios activos y página del producto). Sin IA.
    setFase("Consultando fuentes");
    const f = await consultarFuentesVideo(base, forzar);
    if ("error" in f) {
      setFase(null);
      toast.error(f.error, { duration: 9000 });
      return null;
    }
    const conFuentes: DatosVideo = {
      ...base,
      anunciosHallados: f.anuncios,
      fuentesInvestigacion: f.fuentes,
      investigacionCache: f.deCache ?? "",
      analisisLeyoPagina: f.leyoPagina,
    };
    setDatos((d) => ({ ...d, anunciosHallados: f.anuncios, fuentesInvestigacion: f.fuentes, investigacionCache: f.deCache ?? "", analisisLeyoPagina: f.leyoPagina }));
    // Las imágenes públicas de la página se proponen como fotos del producto, si no hay ninguna.
    if (f.imagenes.length && !fotosRef.current.trim()) {
      fotosRef.current = f.imagenes.join("\n");
      setFotos(fotosRef.current);
    }
    // Paso 2: el análisis, que cita cada anuncio.
    setFase("Investigando");
    const r = await analizarProducto(conFuentes);
    setFase(null);
    if ("error" in r) {
      toast.error(r.error, { duration: 9000 });
      return conFuentes;
    }
    const cambio = { analisisProducto: r.texto, formatosRecomendados: r.formatos };
    setDatos((d) => ({ ...d, ...cambio }));
    setAvisoRapido(r.aviso ?? null);
    return { ...conFuentes, ...cambio };
  }

  /**
   * Tras el guion: lo guarda, propone el plan de escenas y, si hay servidor,
   * manda a la cola SOLO las imágenes base. De ahí en adelante decide una
   * persona: aprobar imágenes, pedir clips, aprobar clips, armar.
   */
  async function terminarTodo(d: DatosVideo, texto: string, origenTexto: OrigenGuion) {
    const lista = enlacesDeFotos(fotosRef.current);
    setFase("Guardando el guion");
    const g = await guardarGuionVideo({ id: idGuardado, datos: { ...d, fotosProducto: lista, referenciaTomas: modo === "clonar" ? d.referenciaTomas : [] }, guion: texto, origen: origenTexto, prospectoId });
    if ("error" in g) {
      setFase(null);
      return void toast.error(g.error, { duration: 9000 });
    }
    alGuardar(g.guardado, true);
    setDatos((x) => ({ ...x, fichaProducto: g.guardado.fichaProducto }));
    const alProyecto = () => window.setTimeout(() => document.getElementById("generar-video")?.scrollIntoView({ behavior: "smooth", block: "start" }), 150);
    if (!lista.length) {
      setFase(null);
      setAvisoRapido("Investigación y guion listos y guardados. Para el video por escenas falta al menos una foto real del producto: súbela aquí arriba y pulsa «Convertir en proyecto por escenas» en el paso 07.");
      return void toast.success("Guion listo y guardado");
    }
    if (versionVigente(g.guardado)?.proyecto) {
      setFase(null);
      setAvisoRapido("El guion no cambió y ya tiene su proyecto por escenas: continúa en el paso 07.");
      return void alProyecto();
    }
    setFase("Proponiendo el plan y arrancando el modo directo");
    const p = await crearProyecto(g.guardado.id, { fotos: lista, ficha: g.guardado.fichaProducto, directo: true });
    if ("error" in p) {
      setFase(null);
      setAvisoRapido(`El guion quedó guardado, pero el plan de escenas no se pudo armar: ${p.error}`);
      return;
    }
    alGuardar(p.guardado, false);
    setEstudio(true);
    setFase(null);
    // De aquí en adelante el proyecto sigue solo (modo directo). Si se detuvo, se dice exactamente por qué.
    const proyecto = versionVigente(p.guardado)?.proyecto;
    const parada = proyecto?.auto.parada;
    if (parada) setAvisoRapido(`Guion y plan listos. El modo directo se detuvo: ${parada.texto} En el paso 07 está el botón para seguir.`);
    else if (proyecto?.auto.activo) {
      setAvisoRapido("Guion y plan listos. El proyecto sigue solo: imágenes (las revisa la IA), clips y armado. Solo te pedirá algo si una imagen queda dudosa o se alcanza un tope; al final te avisa para que apruebes el video.");
      toast.success("En marcha: te avisamos cuando el video esté por aprobar.");
    } else setAvisoRapido("Guion y plan de escenas listos y guardados. Revisa el plan en el paso 07.");
    alProyecto();
  }

  /** El único OK: encadena todo lo que falte. */
  async function generarTodo() {
    if (!formato) return void toast.error("Elige un formato.");
    if (modo === "clonar" && !datos.referenciaTomas.length && !datos.anuncioClon.trim()) {
      setAvisoRapido("Para clonar hace falta la referencia: describe sus tomas (o pega su transcripción) en «Anuncio de referencia».");
      return void document.getElementById("clonar-anuncio")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (!datos.oferta.trim() || !datos.llamado.trim()) {
      setAvisoRapido("Antes de generar, escribe la oferta y el llamado a la acción: todo video cierra con los dos y no se inventan.");
      return;
    }
    // La ficha del producto se confirma antes de seguir: lo que diga es lo que saldrá en pantalla.
    const lista = enlacesDeFotos(fotosRef.current);
    if (lista.length && !datos.fichaProducto.confirmado) {
      const irALaFicha = () => document.getElementById("ficha-producto")?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (!fichaConDatos(datos.fichaProducto)) {
        setOcupado("todo");
        setFase("Mirando las fotos del producto");
        const r = await analizarFotos({ ...datos, fotosProducto: lista });
        setFase(null);
        setOcupado(null);
        if (!("error" in r)) set("fichaProducto", r.ficha);
        setAvisoRapido(
          `${"error" in r ? r.error : (r.aviso ?? "La IA miró las fotos y propuso la ficha del producto.")} Revísala, corrige lo que no sea cierto, llena lo que hay que preguntar y pulsa «Confirmar». Después vuelve a pulsar «Generar todo».`,
        );
      } else setAvisoRapido("Antes de generar, confirma la ficha del producto (o corrígela): lo que diga es lo que el video muestra y dice.");
      return void irALaFicha();
    }
    if (guion.trim() && sinGuardar && !window.confirm("Hay un guion sin guardar en el editor. «Generar todo» escribe uno nuevo. ¿Continuar?")) return;
    setOcupado("todo");
    setFaltantes(null);
    let d: DatosVideo | null = datos;
    if (!d.analisisProducto.trim()) d = await investigar(d);
    if (!d) return void setOcupado(null);
    setFase("Escribiendo el guion");
    const r = await escribirGuion({ ...d, referenciaTomas: modo === "clonar" ? d.referenciaTomas : [] }, "");
    if ("error" in r) {
      setFase(null);
      setOcupado(null);
      return void toast.error(r.error, { duration: 9000 });
    }
    setGuion(r.texto);
    setOrigen(r.origen);
    setAviso(r.aviso ?? null);
    if (r.origen !== "ia") {
      // Sin IA solo hay plantilla: no tiene sentido mandarla a video. Se deja en el editor.
      setFase(null);
      setOcupado(null);
      setAvisoRapido(`${r.aviso ?? "La IA no escribió el guion."} «Generar todo» se detuvo aquí: completa el guion en el paso 04 y sigue a mano.`);
      return;
    }
    let texto = r.texto;
    // El cierre no se negocia: si el paso 5 no trae la oferta y el llamado, se reescribe solo ese bloque.
    if (faltaEnElCierre(texto, d).length) {
      setFase("Ajustando el cierre");
      const c = await regenerarCierre(d, texto);
      if (!("error" in c)) {
        texto = c.texto;
        setGuion(texto);
        setAviso(null);
      }
    }
    const campos = corchetes(texto).slice(0, 14);
    if (campos.length) {
      setFase(null);
      setOcupado(null);
      setFaltantes({ texto, origen: r.origen, campos, valores: {} });
      return;
    }
    await terminarTodo(d, texto, r.origen);
    setOcupado(null);
  }

  /** Formulario corto de datos que faltan: reemplaza cada [campo] por lo que se escribió. */
  async function completarFaltantes() {
    if (!faltantes) return;
    let texto = faltantes.texto;
    for (const c of faltantes.campos) {
      const v = (faltantes.valores[c] ?? "").trim();
      if (v) texto = texto.split(c).join(v);
    }
    const quedan = corchetes(texto).length;
    if (quedan && !window.confirm(`Quedan ${quedan} datos sin completar; van a salir entre corchetes en el guion y el video puede leerlos mal. ¿Seguir así?`)) return;
    setGuion(texto);
    setFaltantes(null);
    setOcupado("todo");
    await terminarTodo(datos, texto, faltantes.origen);
    setOcupado(null);
  }


  /** Un guion cambió (o es nuevo) sin que sea el que está abierto: solo se pone al día en la lista. */
  function actualizarEnLista(gs: GuionGuardado[]) {
    setGuiones((lista) => [...gs.filter((g) => !lista.some((x) => x.id === g.id)), ...lista.map((x) => gs.find((g) => g.id === x.id) ?? x)]);
  }

  /** `solo`: es el refresco automático de una lista (sin avisos, y también pone al día el video abierto, que ahí no tiene su panel montado). */
  async function refrescarGuiones(solo = false) {
    const r = await guionesAlDia();
    if ("error" in r) return solo ? undefined : void toast.error(r.error, { duration: 9000 });
    setGuiones((lista) => {
      const abierto = lista.find((x) => x.id === idGuardado);
      // El abierto lo mantiene al día su propio panel: no se pisa con una lectura más vieja.
      return r.guiones.map((g) => (g.id === idGuardado && abierto && !solo ? abierto : g));
    });
  }

  /** Una acción del servidor devolvió el guion guardado (corrección, estado, restaurar…). */
  function alGuardar(g: GuionGuardado, cargar: boolean) {
    setGuiones((lista) => [g, ...lista.filter((x) => x.id !== g.id)]);
    setIdGuardado(g.id);
    setGuardadoTexto(g.guion);
    if (cargar) {
      setGuion(g.guion);
      setOrigen(g.origen);
      setAviso(null);
    }
  }

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
    setGuion(`${lineaMercado(datos)}\n\n${rellenar(formato.plantilla, datos)}`);
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
    const r = await guardarGuionVideo({ id: comoNuevo ? null : idGuardado, datos: datosCompletos, guion, origen, prospectoId });
    setOcupado(null);
    if ("error" in r) return void toast.error(r.error, { duration: 9000 });
    const g = r.guardado;
    setDatos((x) => ({ ...x, fichaProducto: g.fichaProducto }));
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
    setDatos(datosDe(g));
    setFotos(g.fotosProducto.join("\n"));
    setGuion(g.guion);
    setOrigen(g.origen);
    // Un guion que ya es proyecto se abre directo en el Estudio; si no, en su formulario con el paso a paso a la vista.
    const conProyecto = !duplicar && !!versionVigente(g)?.proyecto;
    irA(conProyecto ? "estudio" : g.referenciaTomas.length ? "clonar" : "crear");
    if (!conProyecto) setPasosAbiertos(true);
    setIdGuardado(duplicar ? null : g.id);
    setGuardadoTexto(duplicar ? null : g.guion);
    // Una copia no hereda el prospecto, salvo que sea el de esta visita.
    setProspectoId(duplicar ? (prospecto?.id ?? null) : g.prospectoId);
    setAviso(null);
    setAvisoMercado(null);
    arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    toast.success(duplicar ? "Copia lista: cambia lo que necesites y guárdala" : "Guion abierto");
  }

  // Quien llega desde un aviso viene a ver el video: se le lleva a ese paso.
  useEffect(() => {
    if (deEnlace) document.getElementById("generar-video")?.scrollIntoView({ block: "start" });
  }, [deEnlace]);

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
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-2xl font-semibold tracking-tight">Creativos</h1>
          <button
            type="button"
            id="contador-atencion"
            onClick={() => irA("mis-videos")}
            className={cn(
              "ml-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
              porAtender ? "border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200" : "border-border text-muted-foreground hover:bg-accent",
            )}
          >
            <BellRing className="size-4" />
            {porAtender ? `Necesitan tu atención: ${porAtender}` : "Nada espera por ti"}
          </button>
        </div>
        <nav aria-label="Secciones de Creativos" className="mt-3 flex gap-1 overflow-x-auto rounded-xl border border-border bg-muted/40 p-1" id="secciones-creativos">
          {VISTAS_CREATIVOS.map((x) => (
            <button
              key={x.clave}
              type="button"
              aria-current={vista === x.clave ? "page" : undefined}
              onClick={() => irA(x.clave)}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                vista === x.clave ? "bg-primary text-primary-foreground" : "text-foreground/75 hover:bg-card",
              )}
            >
              {x.nombre}
            </button>
          ))}
        </nav>
        {enCrear && <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">Elige cómo empezar. Las dos formas terminan en el Estudio de video, donde revisas y apruebas.</p>}
        <div role="radiogroup" aria-label="Cómo empezar" className={cn("mt-3 grid gap-3 sm:grid-cols-2", !enCrear && "hidden")} id="entradas-estudio">
          {(
            [
              { m: "crear", titulo: "Crear video", texto: "Con el producto, el país, la oferta y dos fotos: investigación del país, formato, guion y video por escenas.", Icono: Clapperboard },
              { m: "clonar", titulo: "Clonar video", texto: "De un video que ya funciona: se sube o se enlaza, marcas qué cambia (persona, idioma, producto, oferta) y se genera uno NUEVO con la misma estructura. Nunca se reutiliza su material.", Icono: ScanSearch },
            ] as const
          ).map(({ m, titulo, texto, Icono }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => {
                irA(m);
                // Clonar necesita un formato para los rótulos de la estructura: UGC es el más cercano a un anuncio real.
                if (m === "clonar" && !datos.formato && formatos.some((f) => f.slug === "ugc")) set("formato", "ugc");
              }}
              className={cn(
                "flex items-start gap-3 rounded-2xl border p-4 text-left outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                modo === m ? "border-primary bg-primary/10" : "border-border bg-card hover:border-ring/60",
              )}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", modo === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Icono className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block font-heading text-lg font-semibold">{titulo}</span>
                <span className="block text-sm leading-relaxed text-muted-foreground">{texto}</span>
              </span>
            </button>
          ))}
        </div>
        <div className={cn("mt-2 flex flex-wrap items-center gap-1.5", !enCrear && "hidden")}>
          {prospecto && <Chip tono="azul">Viene del prospecto: {prospecto.nombre}</Chip>}
          {idGuardado && <Chip tono={sinGuardar ? "ambar" : "verde"}>{sinGuardar ? "Cambios sin guardar" : "Guardado"}</Chip>}
          {actual && (
            <Chip tono={TONO_ESTADO[actual.estado]}>
              {ESTADO_GUION_LABELS[actual.estado]} · v{versionVigente(actual)?.n ?? 1}
            </Chip>
          )}
        </div>
        {props.prospectoNoEncontrado && (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
            No se encontró ese prospecto o no lo tienes asignado. Puedes crear el guion igual, llenando los datos a mano.
          </p>
        )}
      </div>

      {/* ------------------------------------------- todo en un solo OK */}
      <Card
        className={cn(!enCrear && "hidden")}
        onBlur={(e) => {
          // Al salir de la tarjeta con el producto escrito, la investigación corre sola (una vez por producto).
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          const p = datos.producto.trim();
          if (p && !datos.analisisProducto.trim() && investigado.current !== p && !ocupado && !fase) void investigar(datos);
        }}
      >
        <CardHeader>
          <CardTitle>{modo === "clonar" ? "Clonar video · lo mínimo" : "Crear video · lo mínimo"}</CardTitle>
          <CardDescription>
            Pon el producto, revisa la investigación, elige el formato y pulsa «Generar todo». Lo demás (guion, guardado
            y envío del video) se hace solo. Los pasos de abajo siguen ahí si quieres editar algo a mano.
          </CardDescription>
          <CardAction>
            <Chip tono={datos.analisisProducto.trim() ? "azul" : "neutro"}>{rotuloInvestigacion(datos)}</Chip>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {modo === "clonar" && (
            <ClonarAnuncio
              enlace={datos.anuncioClonEnlace}
              transcripcion={datos.anuncioClon}
              tomas={datos.referenciaTomas}
              anuncios={datos.anunciosHallados}
              bloqueado={!!ocupado}
              onEnlace={(v) => set("anuncioClonEnlace", v)}
              onTranscripcion={(v) => set("anuncioClon", v)}
              onTomas={(t) => set("referenciaTomas", t)}
              cambios={datos.clonCambios}
              onCambios={(c) => set("clonCambios", c)}
              servidorActivo={props.videoActivo}
              producto={datos.producto}
            />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <Campo etiqueta={modo === "clonar" ? "Producto del cliente" : "Producto"}>
              <Input
                value={datos.producto}
                onChange={(e) => set("producto", e.target.value)}
                maxLength={240}
                placeholder="Nombre y qué es, en pocas palabras"
                aria-label="Producto (flujo rápido)"
              />
            </Campo>
            <Campo etiqueta="Enlace de la tienda o del producto" ayuda="Si la página se deja leer, se usa su título, descripción, precio e imágenes.">
              <Input
                value={datos.enlace}
                onChange={(e) => set("enlace", e.target.value)}
                maxLength={500}
                inputMode="url"
                placeholder="https://…"
                aria-label="Enlace (flujo rápido)"
              />
            </Campo>
            <Campo etiqueta="Oferta (cierra el video)" ayuda="Precio o promoción, qué incluye y condición. Solo lo que dio el cliente.">
              <Input
                value={datos.oferta}
                onChange={(e) => set("oferta", e.target.value)}
                maxLength={400}
                placeholder="Ej.: 2 unidades por $89.900 con envío gratis y pago contra entrega"
                aria-label="Oferta (flujo rápido)"
              />
            </Campo>
            <Campo etiqueta="Llamado a la acción" ayuda="Qué debe hacer la persona y dónde.">
              <Input
                value={datos.llamado}
                onChange={(e) => set("llamado", e.target.value)}
                maxLength={200}
                placeholder="Ej.: pide el tuyo en el botón de abajo"
                aria-label="Llamado a la acción (flujo rápido)"
              />
            </Campo>
            <Campo etiqueta="País del video (acento y oferta)">
              <Select
                items={ITEMS_PAIS}
                value={datos.pais}
                onValueChange={(v) => {
                  if (!v) return;
                  setDatos((d) => ({ ...d, pais: v as string, paisBusqueda: d.paisBusqueda === d.pais ? (v as string) : d.paisBusqueda }));
                }}
              >
                <SelectTrigger className="w-full" aria-label="País del video (flujo rápido)">
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
            <Campo etiqueta="Lo que dio el cliente">
              <Textarea
                value={datos.valores}
                onChange={(e) => set("valores", e.target.value)}
                maxLength={4000}
                rows={1}
                className="min-h-8"
                aria-label="Lo que dio el cliente (flujo rápido)"
              />
            </Campo>
            <div className="md:col-span-2">
              <FotosProducto fotos={fotos} onChange={setFotos} />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Sube dos fotos buenas (frente y otra vista). Con ellas se hacen, sin generar nada, las escenas del producto y el cierre: el producto sale idéntico y esas escenas no cuestan.
              </p>
            </div>
            <div id="ficha-producto" className="scroll-mt-24 md:col-span-2">
              <FichaProductoBloque datos={datosCompletos} ficha={datos.fichaProducto} onChange={(f) => set("fichaProducto", f)} bloqueado={!!ocupado} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" disabled={!datos.producto.trim() || !!ocupado || !!fase} onClick={() => void investigar(datos)}>
              <Search className={cn(fase === "Investigando" && "animate-pulse")} />
              {fase === "Investigando" ? "Investigando…" : datos.analisisProducto.trim() ? "Volver a investigar" : "Investigar"}
            </Button>
            <span className="text-xs text-muted-foreground">
              Consulta anuncios activos de Meta y la página del producto, y la IA resume lo que se repite citando cada
              anuncio. Lo que no se pueda consultar se dice aquí mismo. Las referencias que pegues en el paso 03 se suman.
            </span>
          </div>

          {avisoRapido && <Aviso>{avisoRapido}</Aviso>}
          {datos.fuentesInvestigacion.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className={ETIQUETA}>Fuentes consultadas</span>
              <ul className="flex flex-col gap-1.5">
                {datos.fuentesInvestigacion.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs leading-relaxed">
                    <Chip tono={TONO_FUENTE[f.estado]}>{ETIQUETA_FUENTE[f.estado]}</Chip>
                    <span className="min-w-0 flex-1 basis-56">
                      <strong className="font-medium">{f.nombre}.</strong> {f.detalle}
                      {f.faltan.length > 0 && (
                        <span className="mt-1 block font-mono text-[11px] text-muted-foreground">Falta en Vercel: {f.faltan.join(" o ")}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              {datos.investigacionCache && (
                <p className="text-xs text-muted-foreground">
                  Los anuncios salen de una consulta guardada el {fecha(datos.investigacionCache)} (se guardan 7 días para no
                  volver a pagar la misma búsqueda).
                </p>
              )}
            </div>
          )}
          {datos.anunciosHallados.length > 0 && (
            <details className="rounded-xl border border-border bg-muted/30">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Anuncios activos encontrados ({datos.anunciosHallados.length}) · ordenados por días activos
              </summary>
              <ul className="flex flex-col gap-1.5 border-t border-border p-3">
                {datos.anunciosHallados.map((a) => (
                  <li key={a.ref} className="rounded-lg border border-border bg-card px-3 py-2 text-xs leading-relaxed">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-semibold text-primary">{a.ref}</span>
                      <strong className="font-medium">{a.anunciante || "Anunciante sin nombre"}</strong>
                      <Chip>{a.dias !== null ? `${a.dias} días activo` : "días activo: sin dato"}</Chip>
                      {a.duplicados !== null && <Chip>{a.duplicados} con el mismo creativo</Chip>}
                      {a.formato !== "desconocido" && <Chip>{a.formato}</Chip>}
                      {a.pais && <Chip>{nombrePais(a.pais)}</Chip>}
                      {a.enlace && (
                        <a href={a.enlace} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                          <ExternalLink className="size-3" /> Ver en la biblioteca
                        </a>
                      )}
                    </span>
                    <span className="mt-1 block break-words text-muted-foreground">{[a.titular, a.texto].filter(Boolean).join(" — ").slice(0, 260)}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {datos.analisisProducto.trim() && (
            <Campo etiqueta={rotuloInvestigacion(datos)} ayuda="Puedes corregirlo: el guion usa este texto.">
              <Textarea
                value={datos.analisisProducto}
                onChange={(e) => set("analisisProducto", e.target.value)}
                maxLength={6000}
                rows={8}
                className="max-h-80"
                aria-label="Análisis del producto"
              />
            </Campo>
          )}

          <div className="flex flex-col gap-2">
            <span className={ETIQUETA}>
              {datos.formatosRecomendados.length ? "Formatos recomendados para este producto" : "Formato"}
            </span>
            <div className="flex flex-wrap gap-2">
              {(datos.formatosRecomendados.length ? datos.formatosRecomendados : formato ? [formato.slug] : [])
                .map((slug) => formatos.find((f) => f.slug === slug))
                .filter((f): f is FormatoTarjeta => !!f)
                .map((f) => (
                  <Button key={f.slug} variant={f.slug === datos.formato ? "default" : "outline"} onClick={() => set("formato", f.slug)}>
                    {f.nombre}
                  </Button>
                ))}
              {!formato && !datos.formatosRecomendados.length && (
                <span className="text-xs text-muted-foreground">Investiga para ver recomendaciones, o elige cualquiera en el paso 01.</span>
              )}
              {formato && !datos.formatosRecomendados.includes(formato.slug) && datos.formatosRecomendados.length > 0 && (
                <Chip>Elegido a mano: {formato.nombre}</Chip>
              )}
            </div>
            {formato && porqueDeFormato(datos.analisisProducto, formato.slug) && (
              <p className="text-xs leading-relaxed text-muted-foreground" data-porque-formato>
                <strong className="font-medium text-foreground">Por qué {formato.nombre}:</strong> {porqueDeFormato(datos.analisisProducto, formato.slug)}
              </p>
            )}
          </div>

          {faltantes && (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="text-sm font-medium">Faltan estos datos para terminar el guion</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                La IA no inventa precios, cifras ni testimonios: los dejó entre corchetes. Escribe lo que confirmó el
                cliente; lo que dejes vacío queda entre corchetes.
              </p>
              <div className="grid gap-2 md:grid-cols-2">
                {faltantes.campos.map((c) => (
                  <Campo key={c} etiqueta={c.slice(1, -1)}>
                    <Input
                      value={faltantes.valores[c] ?? ""}
                      onChange={(e) => setFaltantes((f) => (f ? { ...f, valores: { ...f.valores, [c]: e.target.value } } : f))}
                      maxLength={200}
                    />
                  </Campo>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={!!ocupado} onClick={() => void completarFaltantes()}>
                  <Send /> Continuar
                </Button>
                <Button variant="ghost" disabled={!!ocupado} onClick={() => setFaltantes(null)}>
                  Editar el guion a mano
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
            <Button size="lg" disabled={!datos.producto.trim() || !formato || !!ocupado || !!fase || !!faltantes} onClick={() => void generarTodo()}>
              <Sparkles className={cn(ocupado === "todo" && "animate-pulse")} />
              {ocupado === "todo" ? (fase ?? "Trabajando…") : "Generar todo"}
            </Button>
            <span className="text-xs text-muted-foreground">
              {props.videoActivo
                ? "Modo directo: escribe el guion, propone el plan y sigue solo (imágenes revisadas por IA, clips y armado) hasta «Video por aprobar». Se detiene únicamente si hace falta una persona."
                : "Genera la investigación, el guion y el plan de escenas. Las imágenes y clips se podrán pedir cuando el servidor de videos esté conectado."}
            </span>
          </div>
        </CardContent>
      </Card>

      {vista === "mis-videos" && (
        <Seccion titulo="Mis videos" para="Lo que espera por ti y en qué va cada video. Abre uno para seguirlo en el Estudio.">
          <BandejaAtencion
            guiones={guiones}
            puedeAprobar={props.puedeAprobarVideo}
            onActualizado={(g) => (g.id === idGuardado ? alGuardar(g, false) : actualizarEnLista([g]))}
            onAbrir={(g) => abrir(g, false)}
            onRefrescar={() => refrescarGuiones()}
          />
          <MisVideos guiones={misGuiones} trabajos={misTrabajos} enCurso={fase ? { producto: datos.producto, etiqueta: fase } : null} abiertoId={estudioAbierto ? idGuardado : null} onAbrir={(g) => abrir(g, false)} />
        </Seccion>
      )}

      {vista === "lotes" && (
        <Seccion titulo="Lotes" para="Varios videos de una vez, a partir de una lista de productos o de prospectos.">
          <LotesVideos formatos={formatos.map((f) => ({ slug: f.slug, nombre: f.nombre }))} prospectos={props.prospectosLote} guiones={guiones} onGuion={(g) => actualizarEnLista([g])} onAbrir={(g) => abrir(g, false)} />
        </Seccion>
      )}

      {vista === "ajustes" && (
        <>
          <Seccion titulo="Topes y automatización" para="Cuánto se puede gastar por día y cuánto avanza solo. Los cambia el CEO.">
            <ConfigVideosTarjeta esCeo={props.esCeo} inicial={props.config} />
          </Seccion>
          <Seccion titulo="Música" para="Las pistas que suenan por debajo de la voz. Al armar un video se elige sola una del tono del video, rotando para no repetir.">
            <MusicaVideos />
          </Seccion>
          {props.children && (
            <Seccion titulo="Cola del servidor de videos" para="Los trabajos que el servidor tiene pendientes, en curso y terminados.">
              {props.children}
            </Seccion>
          )}
        </>
      )}

      {vista === "aprendizajes" && (
        <Seccion titulo="Aprendizajes" para="Lo que el equipo ha ido corrigiendo. Los próximos guiones, planes y revisiones lo tienen en cuenta.">
          <AprendizajesVideos formatos={formatos.map((f) => ({ slug: f.slug, nombre: f.nombre }))} />
        </Seccion>
      )}

      {vista === "estudio" &&
        (estudioAbierto && actual && vigenteActual?.proyecto ? (
          <EstudioVideo
            key={`${actual.id}:${vigenteActual.n}`}
            modo={actual.referenciaTomas.length ? "clonar" : "crear"}
            onCambiar={() => setEligiendo(true)}
            guardado={actual}
            activo={props.videoActivo}
            puedeAprobar={props.puedeAprobarVideo}
            esCeo={props.esCeo}
            puedeUsarEnProspecto={props.puedeUsarEnProspecto}
            fotos={listaFotos}
            ficha={datos.fichaProducto}
            bloqueado={!!ocupado}
            onGuardado={alGuardar}
            onOtros={actualizarEnLista}
          />
        ) : (
          <Seccion titulo="Estudio de video" para="Aquí se trabaja cada video por escenas: plan, fotos, imágenes, video y entrega.">
            <ListaProyectos guiones={guiones} abiertoId={idGuardado} onAbrir={(g) => (g.id === idGuardado ? setEligiendo(false) : abrir(g, false))} onCrear={() => irA("crear")} onClonar={() => irA("clonar")} />
          </Seccion>
        ))}

      <div className={cn("flex flex-col gap-4", !enCrear && "hidden")} id="paso-a-paso">
      <button
        type="button"
        aria-expanded={pasosAbiertos}
        onClick={() => setPasosAbiertos((x) => !x)}
        className="mt-2 flex items-center gap-3 rounded-2xl border border-border bg-muted/40 px-4 py-3 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {pasosAbiertos ? <ChevronUp className="size-5 shrink-0" /> : <ChevronDown className="size-5 shrink-0" />}
        <span className="min-w-0">
          <span className="block font-heading text-lg font-semibold tracking-tight">Paso a paso (para editar a mano)</span>
          <span className="block text-sm text-muted-foreground">Formato, datos del producto, investigación, guion, correcciones y video: los siete pasos por separado. No hace falta si usas «Generar todo».</span>
        </span>
      </button>
      <div className={cn("flex flex-col gap-4", !pasosAbiertos && "hidden")}>

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
              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>Cómo se produce</span>
                <dl className="grid gap-x-4 gap-y-1 text-xs leading-relaxed sm:grid-cols-[auto_minmax(0,1fr)]">
                  {(
                    [
                      ["Imagen", formato.modelos_sugeridos.imagen],
                      ["Video", formato.modelos_sugeridos.video],
                      ["Voz", formato.modelos_sugeridos.voz],
                      ["Música", formato.modelos_sugeridos.musica],
                      ["Clip", [formato.duracion_clip, formato.audio_del_clip].filter(Boolean).join(" · ")],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="contents">
                        <dt className="font-medium text-muted-foreground">{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
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
                        <TableHead>Paso</TableHead>
                        <TableHead>Qué pasa</TableHead>
                        <TableHead>De dónde sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formato.estructura.map((e) => (
                        <TableRow key={e.tiempo + e.escena}>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{e.tiempo}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            Paso {e.paso} · {e.escena}
                          </TableCell>
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
              ayuda="Obligatoria: todo video cierra con ella, dicha y escrita. Precio o promoción, qué incluye y su condición (envío, pago contra entrega, garantía), tal como la dio el cliente. No se inventa."
            >
              <Input
                value={datos.oferta}
                onChange={(e) => set("oferta", e.target.value)}
                maxLength={400}
                placeholder="Ej.: 2 unidades por $89.900 con envío gratis y pago contra entrega"
              />
            </Campo>
          </div>
          <div className="md:col-span-2">
            <Campo
              etiqueta="Llamado a la acción"
              ayuda="Obligatorio: qué debe hacer la persona y dónde, según donde corra el anuncio."
            >
              <Input
                value={datos.llamado}
                onChange={(e) => set("llamado", e.target.value)}
                maxLength={200}
                placeholder="Ej.: pide el tuyo en el botón de abajo · escríbenos por WhatsApp"
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
          <p className="text-xs text-muted-foreground md:col-span-2">
            Las fotos reales del producto y su ficha están arriba, en «Todo en un solo OK» ({listaFotos.length} {listaFotos.length === 1 ? "foto" : "fotos"}
            {datos.fichaProducto.confirmado ? ", ficha confirmada" : ", ficha sin confirmar"}).
          </p>
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
          <details open={!!datos.anuncioClon.trim()} className="rounded-xl border border-border bg-muted/30">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Clonar un anuncio ganador
              {datos.anuncioClon.trim() ? <Chip tono="azul">Activo</Chip> : <Chip>Opcional</Chip>}
            </summary>
            <div className="flex flex-col gap-3 border-t border-border p-3">
              <p className="text-xs leading-relaxed text-muted-foreground">
                Si ya hay un anuncio que está escalando, pega aquí lo que dice y lo que se ve, en orden (o su
                transcripción). El guion seguirá su estructura bloque a bloque para tu producto, sin copiar su texto ni
                su marca, y con personajes nuevos. La IA no ve el video: trabaja solo con lo que pegues.
              </p>
              <Campo etiqueta="Enlace del anuncio de referencia (opcional)">
                <Input
                  value={datos.anuncioClonEnlace}
                  onChange={(e) => set("anuncioClonEnlace", e.target.value)}
                  maxLength={500}
                  inputMode="url"
                  placeholder="https://…"
                />
              </Campo>
              <Campo
                etiqueta="Transcripción o descripción del anuncio"
                ayuda="Sirve así: «0–3 s: mujer en la cocina dice…; 3–8 s: muestra…; cierre: oferta de…». El análisis automático del video llegará con el servidor."
              >
                <Textarea
                  value={datos.anuncioClon}
                  onChange={(e) => set("anuncioClon", e.target.value)}
                  maxLength={MAX_ANUNCIO_CLON}
                  rows={5}
                />
              </Campo>
            </div>
          </details>
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
            {datos.anuncioClon.trim() && <Chip tono="azul">Sigue la estructura del anuncio de referencia</Chip>}
            {guion.trim() && <Chip>{ORIGEN_LABELS[origen]}</Chip>}
            <Button variant="ghost" size="sm" disabled={!guion.trim()} onClick={() => copiar(guion, "Guion copiado")}>
              <Copy /> Copiar
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {formato && (
            <details open className="rounded-xl border border-border bg-muted/30">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Estructura que se está aplicando · {formato.nombre}
              </summary>
              <div className="flex flex-col gap-3 border-t border-border p-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  La «montaña rusa» de Antonio, paso a paso. Cada bloque del guion lleva el rótulo de su paso; a la derecha
                  ves si ya está en el guion.
                </p>
                <ol className="flex flex-col gap-1.5">
                  {formato.estructura.map((e) => {
                    const rotulado = pasosRotulados.includes(e.paso);
                    return (
                      <li
                        key={e.paso}
                        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2 md:grid-cols-[auto_minmax(0,1fr)_auto]"
                      >
                        <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 font-mono text-xs font-semibold text-primary">
                          {e.paso}
                        </span>
                        <span className="min-w-0 text-sm">
                          <strong className="font-medium">{e.escena === "CTA" ? "Llamado a la acción" : e.escena}</strong>
                          <span className="ml-2 font-mono text-xs text-muted-foreground">{e.tiempo}</span>
                          <span className="block text-xs leading-relaxed text-muted-foreground">{e.que_pasa}</span>
                        </span>
                        {guion.trim() && (
                          <Chip tono={rotulado ? "verde" : "ambar"} className="col-start-2 md:col-start-3">
                            {rotulado ? "En el guion" : "Falta su rótulo"}
                          </Chip>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs leading-relaxed">
                  <strong className="font-medium">Producto real en pantalla.</strong> {formato.producto_en_pantalla}
                </p>
              </div>
            </details>
          )}
          {aviso && <Aviso>{aviso}</Aviso>}
          {guion.trim() && cierreFalta.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs leading-relaxed">
              <Chip tono="rojo">Cierre incompleto</Chip>
              <span className="min-w-0 flex-1 basis-56">
                Todo video cierra con la oferta y el llamado a la acción. Falta {cierreFalta.join(" y ")}.
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!datos.oferta.trim() || !datos.llamado.trim() || !formato || !!ocupado}
                onClick={async () => {
                  setOcupado("guion");
                  const c = await regenerarCierre(datos, guion);
                  setOcupado(null);
                  if ("error" in c) return void toast.error(c.error, { duration: 9000 });
                  setGuion(c.texto);
                  toast.success(c.conIA ? "Cierre regenerado" : "Cierre puesto con las palabras del cliente (la IA no está activa)");
                }}
              >
                <RefreshCw /> Regenerar solo el cierre
              </Button>
            </div>
          )}
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

      {/* ------------------------------- 06 correcciones y versiones */}
      <CorreccionesCliente
        key={idGuardado ?? "nuevo"}
        guardado={actual}
        guionActual={guion}
        datos={datosCompletos}
        prospectoId={prospectoId}
        sinGuardar={sinGuardar}
        bloqueado={!!ocupado}
        videoActivo={props.videoActivo}
        onGuardado={alGuardar}
      />

      {/* ----------------------------------------- 07 generar video */}
      <Card id="generar-video" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>
            <Paso n="07">Estudio de video</Paso>
          </CardTitle>
          <CardDescription>
            El guion se produce por etapas y tú apruebas antes de cada gasto: imágenes base, clips solo de lo aprobado y armado sin costo. Una corrección rehace solo la escena afectada.
            {props.videoActivo ? " Puedes cerrar la página y volver: el servidor sigue trabajando." : " El servidor de videos todavía no está conectado: el plan se puede preparar desde ya."}
          </CardDescription>
          {actual && (
            <CardAction>
              <Chip tono="azul">Versión vigente: v{versionVigente(actual)?.n ?? 1}</Chip>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {actual && vigenteActual?.proyecto ? (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3" id="abrir-estudio">
              <Chip tono={resumenProyecto(vigenteActual.proyecto).tono}>{resumenProyecto(vigenteActual.proyecto).etiqueta}</Chip>
              <span className="min-w-0 flex-1 basis-48 text-xs text-muted-foreground">
                {resumenProyecto(vigenteActual.proyecto).detalle || "El proyecto por escenas de este guion se trabaja en el Estudio de video."}
              </span>
              <Button onClick={() => setEstudio(true)}>
                <Clapperboard /> Abrir el Estudio de video
              </Button>
            </div>
          ) : (
            <ConvertirEnProyecto
              guardado={actual}
              sinGuardar={sinGuardar}
              activo={props.videoActivo}
              fotos={listaFotos}
              ficha={datos.fichaProducto}
              bloqueado={!!ocupado}
              onGuardado={(g, cargar) => {
                alGuardar(g, cargar);
                setDatos((x) => ({ ...x, fichaProducto: g.fichaProducto }));
                if (versionVigente(g)?.proyecto) setEstudio(true);
              }}
            />
          )}
          <details open={!vigenteActual?.proyecto && !!actual?.versiones.some((v) => v.videoUrl && !v.proyecto)} className="rounded-xl border border-border bg-muted/30">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              Modo anterior: el video completo de una vez (sin revisión por escena; cuesta más)
            </summary>
            <div className="border-t border-border p-3">
              <GenerarVideo
                activo={props.videoActivo}
                fotos={fotos}
                onFotos={setFotos}
                guardado={actual}
                sinGuardar={sinGuardar}
                bloqueado={!!ocupado}
                puedeAprobar={props.puedeAprobarVideo}
                puedeUsarEnProspecto={props.puedeUsarEnProspecto}
                onGuardado={alGuardar}
              />
            </div>
          </details>
          {formato && <span className={ETIQUETA}>Prompts por escena del formato (para generar a mano)</span>}
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

      </div>
      </div>

      {/* ------------------------------------------- guiones guardados */}
      <Card className={cn(vista !== "mis-videos" && "hidden")}>
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
                    <TableHead>Estado</TableHead>
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
                      <TableCell>
                        <span className="flex items-center gap-1.5">
                          <Chip tono={TONO_ESTADO[g.estado]}>{ESTADO_GUION_LABELS[g.estado]}</Chip>
                          <span className="font-mono text-xs text-muted-foreground">v{versionVigente(g)?.n ?? 1}</span>
                        </span>
                      </TableCell>
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

/** Una sección de Creativos: título grande, para qué sirve y su contenido, bien separada del resto. */
function Seccion({ titulo, para, children }: { titulo: string; para: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4 md:p-5" aria-label={titulo}>
      <header className="border-b border-border pb-3">
        <h2 className="font-heading text-xl font-semibold tracking-tight">{titulo}</h2>
        <p className="text-[15px] leading-relaxed text-muted-foreground">{para}</p>
      </header>
      {children}
    </section>
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
