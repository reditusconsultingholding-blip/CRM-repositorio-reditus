"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Play, RefreshCw, ShieldAlert } from "lucide-react";
import { pausaGeneralAccion } from "@/app/(protected)/prospectos/campanas-actions";
import { conectarHojaAccion, guardarAutoAccion, resolverColaAccion, sincronizarHojaAccion } from "@/app/(protected)/prospectos/control-actions";
import { CALENTAMIENTO, DIAS_SEGUIMIENTO, HORARIO, pieLegal, type ConfigCorreo, type UsoCuenta } from "@/lib/prospeccion-correo";
import { DIAS_SEGUIMIENTO_FRIO, EMBUDO_LABELS, PAISES_AUTO, PAIS_AUTO, URL_PUBLICA_CRM, costoDeAnuncios, type ConfigAuto, type PaisAuto, type PanelAuto, type PasoEmbudo, type RespuestaEnCola } from "@/lib/prospeccion-auto";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA } from "./piezas";

type Accion = () => Promise<{ error?: string; aviso?: string }>;

function useCorrer() {
  const [pending, startTransition] = useTransition();
  function correr(fn: Accion, exito: string, despues?: () => void) {
    startTransition(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error, { duration: 9000 });
      else {
        toast.success(r.aviso ? `${exito}. ${r.aviso}` : exito, { duration: 7000 });
        despues?.();
      }
    });
  }
  return { pending, correr };
}

const fecha = (iso: string | null) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }) : "—");

function Interruptor({ titulo, detalle, activo, disabled, onChange }: { titulo: string; detalle: string; activo: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className={cn("flex items-start justify-between gap-3 rounded-xl border p-3", activo ? "border-emerald-500/40 bg-emerald-500/5" : "border-border bg-card")}>
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">{detalle}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={activo}
        aria-label={titulo}
        disabled={disabled}
        onClick={() => onChange(!activo)}
        className={cn("relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50", activo ? "bg-emerald-600" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute top-0.5 left-0.5 size-5 rounded-full bg-white shadow transition-transform", activo && "translate-x-5")} />
      </button>
    </div>
  );
}

function Numero({ id, etiqueta, valor, onChange, paso = 1, ayuda, disabled }: { id: string; etiqueta: string; valor: number; onChange: (n: number) => void; paso?: number; ayuda?: string; disabled: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} type="number" step={paso} min={0} value={Number.isFinite(valor) ? valor : 0} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="w-32 font-mono tabular-nums" />
      {ayuda && <p className="max-w-56 text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function ItemCola({ item, sinConfirmar, puedeAprobar }: { item: RespuestaEnCola; sinConfirmar: boolean; puedeAprobar: boolean }) {
  const { pending, correr } = useCorrer();
  const [texto, setTexto] = useState(item.borrador);
  const esLead = item.destino.tipo === "lead";
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{item.tienda}</span>
        <Chip tono={sinConfirmar ? "rojo" : item.motivo === "pregunta" ? "azul" : "ambar"}>{sinConfirmar ? "Sin confirmar si salió" : item.motivo === "pregunta" ? "Pregunta" : "Por revisar"}</Chip>
        <span className="text-xs text-muted-foreground">
          {item.de} · {fecha(item.recibido)}
        </span>
        {item.destino.tipo === "prospecto" && (
          <Link href={`/prospectos/${item.destino.prospectoId}`} className="text-xs font-medium text-primary hover:underline">
            Abrir prospecto
          </Link>
        )}
      </div>
      <p className="rounded-lg bg-muted/40 p-2 text-sm break-words whitespace-pre-wrap">{item.texto}</p>
      {sinConfirmar ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-muted-foreground">{item.nota} Mira «Enviados» en Gmail antes de decidir.</p>
          <Button size="sm" variant="outline" disabled={pending || !puedeAprobar} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "dar_por_enviada" }), "Marcada como enviada")}>
            Sí salió
          </Button>
          <Button size="sm" variant="outline" disabled={pending || !puedeAprobar} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "devolver" }), "Vuelve a la cola de envío")}>
            No salió: reenviar
          </Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <span className={ETIQUETA}>
              Respuesta que saldría {item.motivo === "pregunta" ? (item.borradorCon === "ia" ? "(borrador de la IA)" : "(borrador base: complétalo)") : "(escríbela si quieres responder)"}
            </span>
            <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={6} className="text-sm" aria-label={`Respuesta para ${item.tienda}`} />
            <p className="text-xs text-muted-foreground">Al aprobar sale en el mismo hilo, con el pie legal, en el siguiente horario laboral de la tienda. Nada se responde sin este paso.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={pending || !puedeAprobar || texto.trim().length < 20} title={puedeAprobar ? undefined : "Solo el CEO o el gerente comercial aprueban respuestas"} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "aprobar", texto }), "Respuesta aprobada")}>
              Aprobar y enviar
            </Button>
            {esLead && (
              <Button size="sm" variant="outline" disabled={pending || !puedeAprobar} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "es_si" }), "Pasó a candidato a video")}>
                Es un sí: hacerle video
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "no_interesado" }), "Marcado como no interesado")}>
              No le interesa
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => correr(() => resolverColaAccion(item.id, { tipo: "descartar" }), "Descartada sin responder")}>
              Descartar
            </Button>
          </div>
        </>
      )}
    </li>
  );
}

/** Panel de control de la prospección automática. */
export function PanelControl({ panel, config, uso, esCeo, puedeAprobar }: { panel: PanelAuto; config: ConfigCorreo; uso: UsoCuenta[]; esCeo: boolean; puedeAprobar: boolean }) {
  const { pending, correr } = useCorrer();
  const [auto, setAuto] = useState<ConfigAuto>(config.auto);
  const [palabras, setPalabras] = useState<Record<PaisAuto, string>>({ ES: config.auto.busqueda.palabras.ES.join("\n"), MX: config.auto.busqueda.palabras.MX.join("\n") });
  const [enlaceHoja, setEnlaceHoja] = useState(config.auto.hoja.id ? `https://docs.google.com/spreadsheets/d/${config.auto.hoja.id}/edit` : "");
  const video = uso.find((u) => u.linea === "video");
  const bloqueado = pending || !esCeo;
  const b = auto.busqueda;
  const poner = <K extends keyof ConfigAuto>(clave: K, cambio: Partial<ConfigAuto[K]>) => setAuto((a) => ({ ...a, [clave]: { ...a[clave], ...cambio } }));
  const interruptor = (cambio: Parameters<typeof guardarAutoAccion>[0], exito: string) => correr(() => guardarAutoAccion(cambio), exito);
  const sucio = JSON.stringify({ ...auto, hoja: null }) !== JSON.stringify({ ...config.auto, hoja: null }) || palabras.ES !== config.auto.busqueda.palabras.ES.join("\n") || palabras.MX !== config.auto.busqueda.palabras.MX.join("\n");
  const costoCorrida = Math.min(b.usdPorCorrida, costoDeAnuncios(b.anunciosPorCorrida, b.usdPorMilAnuncios));
  const corridasDia = Math.floor(24 / Math.max(1, b.cadaHoras));
  const diaObjetivo = (CALENTAMIENTO.findIndex((t) => t >= auto.envio.nuevosPorDia) < 0 ? CALENTAMIENTO.length - 1 : CALENTAMIENTO.findIndex((t) => t >= auto.envio.nuevosPorDia)) * 7 + 1;

  const tarjetas: { paso: PasoEmbudo | "videos"; valor: string; nota?: string }[] = [
    { paso: "encontrados", valor: String(panel.embudo.hoy.encontrados), nota: `${panel.enCola} en cola por escribir` },
    { paso: "enviados", valor: video ? `${video.nuevos} / ${video.topeNuevos}` : String(panel.embudo.hoy.enviados), nota: video ? `cuenta: ${video.usados} / ${video.tope} hoy (semana ${video.semana})` : undefined },
    { paso: "respuestas", valor: String(panel.embudo.hoy.respuestas), nota: `${panel.embudo.hoy.preguntas} preguntas · ${panel.embudo.hoy.noInteresados} no` },
    { paso: "aceptados", valor: String(panel.embudo.hoy.aceptados) },
    { paso: "videos", valor: String(panel.videos.enCurso), nota: `${panel.videos.porDecidir} esperan decisión · tope ${panel.videos.topePorDia}/día` },
    { paso: "entregados", valor: String(panel.embudo.hoy.entregados) },
    { paso: "llamadas", valor: String(panel.embudo.hoy.llamadas) },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Estado y pausa total */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3", config.pausaGeneral ? "border-destructive/40 bg-destructive/10" : "border-border bg-card/60")}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tono={panel.servidorVivo ? "verde" : "rojo"}>{panel.servidorVivo ? "Servidor en línea" : "Servidor sin señal"}</Chip>
          {panel.latido && <Chip tono={panel.latido.modo === "real" ? "azul" : "ambar"}>{panel.latido.modo === "real" ? "Correo real" : "Correo en simulación"}</Chip>}
          {panel.latido && <Chip tono={panel.latido.busqueda === "real" ? "azul" : "ambar"}>{panel.latido.busqueda === "real" ? "Búsqueda real" : "Búsqueda en simulación"}</Chip>}
          <span className="text-xs text-muted-foreground">
            Última señal: {fecha(panel.latido?.fecha ?? null)}
            {panel.latido?.reportesPendientes ? ` · ${panel.latido.reportesPendientes} reportes por entregar` : ""}
          </span>
        </div>
        {config.pausaGeneral ? (
          <Button disabled={pending || !puedeAprobar} title={puedeAprobar ? undefined : "Solo el CEO o el gerente comercial quitan la pausa"} onClick={() => correr(() => pausaGeneralAccion(false), "Todo reanudado")}>
            <Play /> Quitar la pausa total
          </Button>
        ) : (
          <Button variant="destructive" disabled={pending} onClick={() => correr(() => pausaGeneralAccion(true), "Pausa total activada")}>
            <Ban /> Pausa total de emergencia
          </Button>
        )}
      </div>
      {config.pausaGeneral && (
        <p className="text-sm font-medium text-destructive">
          Pausa total activa{config.pausaInfo ? ` (${config.pausaInfo.por}, ${fecha(config.pausaInfo.fecha)})` : ""}: no sale ningún correo, no se busca y no se prepara ninguna entrega. La bandeja se sigue leyendo para registrar bajas y respuestas.
        </p>
      )}
      {panel.avisos.length > 0 && (
        <ul className="flex flex-col gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          {panel.avisos.map((a) => (
            <li key={a} className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 size-4 shrink-0" /> {a}
            </li>
          ))}
        </ul>
      )}

      {/* Embudo del día */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {tarjetas.map((t) => (
          <div key={t.paso} className="rounded-xl border border-border bg-card p-3">
            <span className={ETIQUETA}>{t.paso === "videos" ? "Videos en curso" : EMBUDO_LABELS[t.paso]}</span>
            <p className="font-mono text-2xl font-semibold tabular-nums">{t.valor}</p>
            <p className="text-xs text-muted-foreground">
              {t.paso !== "videos" && `ayer ${panel.embudo.ayer[t.paso]} · 7 días ${panel.embudo.semana[t.paso]}`}
              {t.nota && <span className="block">{t.nota}</span>}
            </p>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Hoy = {panel.hoy} (día de Colombia). Además: {panel.embudo.hoy.seguimientos} recordatorios, {panel.embudo.hoy.rebotes} rebotes y {panel.embudo.hoy.bajas} bajas por enlace.
      </p>

      {/* Interruptores */}
      <Card>
        <CardHeader>
          <CardTitle>Interruptores</CardTitle>
          <CardDescription>{esCeo ? "Cada uno se guarda al tocarlo." : "Solo el CEO los cambia."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Interruptor titulo="Búsqueda de tiendas" detalle={`Cada ${config.auto.busqueda.cadaHoras} h busca tiendas que anuncian en Meta (${config.auto.busqueda.paises.map((p) => PAIS_AUTO[p].nombre).join(", ")}), las califica y las pone en cola.`} activo={config.auto.busqueda.activa} disabled={bloqueado} onChange={(v) => interruptor({ busqueda: { activa: v } }, v ? "Búsqueda encendida" : "Búsqueda apagada")} />
          <Interruptor titulo="Envío de correos nuevos" detalle={`Hasta ${config.auto.envio.nuevosPorDia} primeros correos al día, de lunes a viernes de ${HORARIO.desde}:00 a ${HORARIO.hasta}:00 de la tienda. Encenderlo es tu autorización.`} activo={config.auto.envio.activo} disabled={bloqueado} onChange={(v) => interruptor({ envio: { activo: v } }, v ? "Envío encendido" : "Envío apagado")} />
          <Interruptor titulo="Entrega automática del video" detalle={`Cuando una persona aprueba el video en Creativos, se redacta y se envía en el mismo hilo con el análisis y el enlace de agenda. Luego, seguimientos a los ${DIAS_SEGUIMIENTO.join(", ")} días si no agenda.`} activo={config.auto.entrega.automatica} disabled={bloqueado} onChange={(v) => interruptor({ entrega: { automatica: v } }, v ? "Entrega automática encendida" : "Entrega automática apagada")} />
          <Interruptor titulo="Borradores de respuesta con IA" detalle="A quien pregunta algo se le prepara un borrador. Siempre lo aprueba una persona; nunca se responde solo." activo={config.auto.respuestas.borradorIA} disabled={bloqueado} onChange={(v) => interruptor({ respuestas: { borradorIA: v } }, v ? "Borradores con IA" : "Borradores con plantilla")} />
        </CardContent>
      </Card>

      {/* Cola de respuestas */}
      <Card>
        <CardHeader>
          <CardTitle>Respuestas que te esperan ({panel.cola.length})</CardTitle>
          <CardDescription>
            Quien acepta el video pasa solo a candidato a video. Aquí queda lo que necesita a una persona: preguntas (con borrador) y respuestas que no se pudieron clasificar. «No interesado», fuera de oficina y rebotes se resuelven solos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {panel.cola.length === 0 ? <p className="text-sm text-muted-foreground">No hay nada por revisar.</p> : <ul className="flex flex-col gap-2">{panel.cola.map((i) => <ItemCola key={i.id} item={i} sinConfirmar={panel.sinConfirmar.includes(i.id)} puedeAprobar={puedeAprobar} />)}</ul>}
        </CardContent>
      </Card>

      {/* Topes */}
      <Card>
        <CardHeader>
          <CardTitle>Topes</CardTitle>
          <CardDescription>
            El calentamiento de la cuenta ({CALENTAMIENTO.join(" → ")} correos al día, sube cada semana) es el piso de seguridad y no se puede saltar: con {auto.envio.nuevosPorDia} correos nuevos al día se llega a ese ritmo el día {diaObjetivo} desde el primer envío real{diaObjetivo > 1 ? ` (antes, ${CALENTAMIENTO[0]} al día)` : ""}. Las entregas, los seguimientos y las respuestas también cuentan en el tope de la cuenta.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <Numero id="t-nuevos" etiqueta="Correos nuevos por día" valor={auto.envio.nuevosPorDia} onChange={(n) => poner("envio", { nuevosPorDia: n })} ayuda="Entre 1 y 65. Recomendado: 20 a 25." disabled={bloqueado} />
            <Numero id="t-frio" etiqueta="Recordatorios si no responde" valor={auto.envio.seguimientosFrio} onChange={(n) => poner("envio", { seguimientosFrio: n })} ayuda={`0, 1 o 2. Salen a los ${DIAS_SEGUIMIENTO_FRIO.join(" y ")} días, en el mismo hilo.`} disabled={bloqueado} />
            <Numero id="t-horas" etiqueta="Buscar cada (horas)" valor={b.cadaHoras} onChange={(n) => poner("busqueda", { cadaHoras: n })} disabled={bloqueado} />
            <Numero id="t-puntaje" etiqueta="Puntaje mínimo" valor={b.puntajeMinimo} onChange={(n) => poner("busqueda", { puntajeMinimo: n })} ayuda="De 0 a 100. Por debajo, la tienda no entra." disabled={bloqueado} />
          </div>
          <div className="flex flex-wrap gap-4">
            <Numero id="t-anuncios" etiqueta="Anuncios por búsqueda" valor={b.anunciosPorCorrida} onChange={(n) => poner("busqueda", { anunciosPorCorrida: n })} ayuda="Es lo que cobra el proveedor." disabled={bloqueado} />
            <Numero id="t-corrida" etiqueta="Tope por búsqueda (USD)" valor={b.usdPorCorrida} paso={0.05} onChange={(n) => poner("busqueda", { usdPorCorrida: n })} disabled={bloqueado} />
            <Numero id="t-dia" etiqueta="Tope por día (USD)" valor={b.usdPorDia} paso={0.05} onChange={(n) => poner("busqueda", { usdPorDia: n })} disabled={bloqueado} />
            <Numero id="t-mil" etiqueta="Precio por 1.000 anuncios (USD)" valor={b.usdPorMilAnuncios} paso={0.5} onChange={(n) => poner("busqueda", { usdPorMilAnuncios: n })} ayuda="Referencia para estimar. Si el proveedor informa el costo real, se usa ese." disabled={bloqueado} />
          </div>
          <p className="text-sm">
            Costo estimado: hasta <span className="font-mono">{costoCorrida.toFixed(2)} USD</span> por búsqueda, máximo <span className="font-mono">{Math.min(b.usdPorDia, costoCorrida * corridasDia).toFixed(2)} USD</span> al día y unos{" "}
            <span className="font-mono">{(Math.min(b.usdPorDia, costoCorrida * corridasDia) * 30).toFixed(0)} USD</span> al mes. Hoy van <span className="font-mono">{panel.busquedas.usd.toFixed(2)} USD</span> en {panel.busquedas.corridas.length}{" "}
            {panel.busquedas.corridas.length === 1 ? "búsqueda" : "búsquedas"}.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">Países:</span>
            {PAISES_AUTO.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4 accent-primary" disabled={bloqueado} checked={b.paises.includes(p)} onChange={(e) => poner("busqueda", { paises: e.target.checked ? [...new Set([...b.paises, p])] : b.paises.filter((x) => x !== p) })} />
                {PAIS_AUTO[p].nombre}
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-primary" disabled={bloqueado} checked={b.soloShopify} onChange={(e) => poner("busqueda", { soloShopify: e.target.checked })} />
              Solo tiendas Shopify
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {PAISES_AUTO.map((p) => (
              <div key={p} className="flex flex-col gap-1">
                <Label htmlFor={`pal-${p}`}>Frases de búsqueda · {PAIS_AUTO[p].nombre}</Label>
                <Textarea id={`pal-${p}`} rows={5} disabled={bloqueado} value={palabras[p]} onChange={(e) => setPalabras((x) => ({ ...x, [p]: e.target.value }))} className="font-mono text-xs" />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className={ETIQUETA}>Remitente (va al pie de cada correo)</span>
            <div className="grid gap-2 md:grid-cols-2">
              <Input aria-label="Nombre" disabled={bloqueado} value={auto.remitente.nombre} onChange={(e) => poner("remitente", { nombre: e.target.value })} placeholder="Nombre" />
              <Input aria-label="Empresa" disabled={bloqueado} value={auto.remitente.empresa} onChange={(e) => poner("remitente", { empresa: e.target.value })} placeholder="Empresa" />
              <Input aria-label="Dirección postal" disabled={bloqueado} value={auto.remitente.direccion} onChange={(e) => poner("remitente", { direccion: e.target.value })} placeholder="Dirección postal (calle, ciudad, país)" />
              <Input aria-label="Sitio web" disabled={bloqueado} value={auto.remitente.web} onChange={(e) => poner("remitente", { web: e.target.value })} placeholder="Sitio web" />
            </div>
            <Input aria-label="Por qué le llega el correo" disabled={bloqueado} value={auto.remitente.motivo} onChange={(e) => poner("remitente", { motivo: e.target.value })} />
            <p className="rounded-lg bg-muted/40 p-2 text-xs break-words whitespace-pre-wrap">{pieLegal({ ...auto.remitente, enlaceBaja: `${URL_PUBLICA_CRM}/baja/…` })}</p>
          </div>

          {esCeo && (
            <Button
              className="w-fit"
              disabled={pending || !sucio}
              onClick={() => correr(() => guardarAutoAccion({ busqueda: { ...b, activa: config.auto.busqueda.activa, palabras: { ES: palabras.ES.split("\n"), MX: palabras.MX.split("\n") } }, envio: { nuevosPorDia: auto.envio.nuevosPorDia, seguimientosFrio: auto.envio.seguimientosFrio }, remitente: auto.remitente }), "Topes guardados")}
            >
              Guardar topes y remitente
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Hoja */}
      <Card>
        <CardHeader>
          <CardTitle>Hoja de prospectos</CardTitle>
          <CardDescription>
            El CRM manda en el estado: la columna «Estado» de la hoja se actualiza sola, y las tiendas que encuentra la búsqueda se agregan al final con su #ID. Lo que ya se trabajó a mano («Enviado», «Rebotado»…) entra como historia: no se les repite el primer correo.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ol className="list-decimal pl-5 text-sm">
            <li>
              Abre la hoja con la cuenta dueña, pulsa «Compartir» y agrega como <strong>Editor</strong> a <span className="font-mono text-xs break-all">{panel.cuentaDeServicio || "(el CRM no tiene cuenta de servicio configurada)"}</span>.
            </li>
            <li>
              Una sola vez: enciende la «Google Sheets API» en{" "}
              <a className="text-primary hover:underline" href="https://console.developers.google.com/apis/api/sheets.googleapis.com/overview?project=714359214707" target="_blank" rel="noreferrer">
                este enlace
              </a>{" "}
              (botón «Habilitar», con la cuenta reditusconsultingholding).
            </li>
            <li>Pega aquí el enlace de la hoja y pulsa «Conectar».</li>
          </ol>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-64 flex-1 flex-col gap-1">
              <Label htmlFor="hoja-enlace">Enlace de la hoja</Label>
              <Input id="hoja-enlace" disabled={bloqueado} value={enlaceHoja} onChange={(e) => setEnlaceHoja(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
            </div>
            {esCeo && (
              <Button disabled={pending} onClick={() => correr(() => conectarHojaAccion(enlaceHoja), enlaceHoja.trim() ? "Hoja conectada" : "Hoja desconectada")}>
                Conectar
              </Button>
            )}
            <Button variant="outline" disabled={pending || !config.auto.hoja.id} onClick={() => correr(() => sincronizarHojaAccion(), "Sincronizada")}>
              <RefreshCw /> Sincronizar ahora
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Pestañas: «{config.auto.hoja.pestanas.ES}» y «{config.auto.hoja.pestanas.MX}». Columnas que usa (fila 1): #ID, Tienda, Link tienda, producto, correo(s), Estado, Fecha y, si existen, Puntaje, Nivel, ¿Escribir?, Falencia, Evidencia, Plataforma, precio, teléfono, IG, Notas.
          </p>
          <p className="text-sm">
            Última sincronización: {fecha(panel.hoja.ultima)}
            {panel.hoja.ultima && !panel.hoja.error && ` · ${panel.hoja.leidas} filas · ${panel.hoja.importadas} entraron al CRM · ${panel.hoja.actualizadas} estados escritos · ${panel.hoja.agregadas} tiendas agregadas · ${panel.hoja.sinCorreo} sin correo`}
            {panel.hoja.error && <span className="block text-destructive">{panel.hoja.error}</span>}
          </p>
        </CardContent>
      </Card>

      {/* Búsquedas */}
      <Card>
        <CardHeader>
          <CardTitle>Últimas búsquedas</CardTitle>
          <CardDescription>{panel.proximaBusqueda ? `Próxima: ${fecha(panel.proximaBusqueda)} (si queda presupuesto del día).` : "La próxima sale cuando el trabajador pregunte y la búsqueda esté encendida."}</CardDescription>
        </CardHeader>
        <CardContent>
          {panel.busquedas.corridas.length === 0 && !panel.ultimaCorrida ? (
            <p className="text-sm text-muted-foreground">Todavía no hay búsquedas.</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {(panel.busquedas.corridas.length ? panel.busquedas.corridas : panel.ultimaCorrida ? [panel.ultimaCorrida] : []).map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-3 rounded-lg border border-border px-3 py-1.5">
                  <span className="font-mono text-xs">{fecha(c.inicio)}</span>
                  <span>{PAIS_AUTO[c.pais].nombre}</span>
                  <span className="text-muted-foreground">
                    {c.fin ? `${c.anuncios} anuncios · ${c.agregados} tiendas a la cola · ${c.descartados} descartadas · ${c.usd.toFixed(2)} USD · ${c.fuente || "—"}` : c.nota}
                  </span>
                  <span className="text-xs text-muted-foreground">«{c.palabras.join("», «")}»</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
