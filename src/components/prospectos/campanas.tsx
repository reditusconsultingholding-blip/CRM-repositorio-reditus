"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Ban, Pause, Play, Plus, ShieldAlert, Upload } from "lucide-react";
import {
  crearCampanaAccion,
  devolverSinConfirmarAccion,
  editarCampanaAccion,
  estadoCampanaAccion,
  guardarExclusionesAccion,
  pausaGeneralAccion,
  prospectoDesdeLeadAccion,
} from "@/app/(protected)/prospectos/campanas-actions";
import { SERVICIOS, SERVICIO_LABELS, type Servicio } from "@/lib/prospeccion";
import {
  CALENTAMIENTO,
  CLASIFICACION_LABELS,
  ESTADOS_LEAD,
  ESTADO_CAMPANA_LABELS,
  ESTADO_LEAD_LABELS,
  HORARIO,
  PLANTILLA_INICIAL,
  VARIABLES_PLANTILLA,
  aplicarPlantilla,
  asegurarPie,
  problemasPlantilla,
  separarAsunto,
  type ConfigCorreo,
  type Lead,
  type ResumenCampana,
  type UsoCuenta,
} from "@/lib/prospeccion-correo";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Chip, ETIQUETA, Segmento } from "./piezas";

type Accion = () => Promise<{ error?: string; aviso?: string; id?: string }>;

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

const LEAD_DE_EJEMPLO = { tienda: "Tienda Ejemplo", producto: "Producto estrella", falencia: "", pais: "Colombia", url: "" };
const AYUDA_LEADS = "tienda,url,correo,producto,falencia,pais,linea";

function fecha(iso: string) {
  return new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });
}

function CampoLeads({ value, onChange, id }: { value: string; onChange: (v: string) => void; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label htmlFor={id}>Leads (pega la lista o sube un CSV)</Label>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <Upload className="size-3.5" /> Subir CSV
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={async (e) => {
              const archivo = e.target.files?.[0];
              if (archivo) onChange(await archivo.text());
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <Textarea
        id={id}
        name="leads"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder={`${AYUDA_LEADS}\nMi Tienda,https://mitienda.co,hola@mitienda.co,Faja reductora,Sus anuncios son solo fotos,Colombia,video`}
        className="font-mono text-xs"
      />
      <p className="text-xs text-muted-foreground">
        Columnas: {AYUDA_LEADS.replace(/,/g, ", ")}. Con fila de encabezados pueden ir en cualquier orden. Se descartan solos los
        correos de plantilla, inválidos, repetidos o excluidos.
      </p>
    </div>
  );
}

function VistaPrevia({ plantilla, lead }: { plantilla: string; lead: Pick<Lead, "tienda" | "producto" | "falencia" | "pais" | "url"> }) {
  const r = separarAsunto(aplicarPlantilla(plantilla, lead));
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs">
      <span className={ETIQUETA}>Así sale para {lead.tienda}</span>
      <p className="mt-1.5 font-medium">{r.asunto}</p>
      <p className="mt-1 leading-relaxed break-words whitespace-pre-wrap">{asegurarPie(r.cuerpo)}</p>
    </div>
  );
}

function NuevaCampana({ alCrear }: { alCrear: () => void }) {
  const { pending, correr } = useCorrer();
  const [linea, setLinea] = useState<Servicio>("video");
  const [plantilla, setPlantilla] = useState(PLANTILLA_INICIAL.video);
  const [leads, setLeads] = useState("");
  const problemas = problemasPlantilla(plantilla);

  return (
    <form
      action={(fd) => correr(() => crearCampanaAccion(fd), "Campaña creada sin activar", alCrear)}
      className="flex flex-col gap-3"
    >
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-nombre">Nombre de la campaña</Label>
          <Input id="c-nombre" name="nombre" required maxLength={120} placeholder="Colombia · moda · octubre" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Línea (define la cuenta de Gmail)</Label>
          <Segmento
            name="linea"
            value={linea}
            onChange={(l) => {
              if (plantilla === PLANTILLA_INICIAL[linea]) setPlantilla(PLANTILLA_INICIAL[l]);
              setLinea(l);
            }}
            opciones={SERVICIOS}
            etiquetas={SERVICIO_LABELS}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-plantilla">Correo inicial</Label>
        <Textarea id="c-plantilla" name="plantilla" value={plantilla} onChange={(e) => setPlantilla(e.target.value)} rows={12} maxLength={4000} className="text-sm leading-relaxed" />
        <p className="text-xs text-muted-foreground">
          Primera línea «Asunto: …». Variables: {VARIABLES_PLANTILLA.map((v) => `{{${v}}}`).join(" ")}. Sin precios, cifras ni
          testimonios. La firma y la línea para darse de baja se agregan solas si faltan.
        </p>
        {problemas.map((p) => (
          <p key={p} className="text-xs text-destructive">
            {p}
          </p>
        ))}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="usarIA" defaultChecked className="mt-0.5 size-4 accent-primary" />
        <span>
          Que la IA adapte cada correo a la tienda a partir de esta plantilla
          <span className="block text-xs text-muted-foreground">Si la IA no está disponible o se sale de las reglas, sale la plantilla tal cual.</span>
        </span>
      </label>
      <CampoLeads id="c-leads" value={leads} onChange={setLeads} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || problemas.length > 0}>
          {pending ? "Creando…" : "Crear campaña (queda sin activar)"}
        </Button>
      </div>
    </form>
  );
}

function TarjetaCampana({ r, uso, puedeAutorizar }: { r: ResumenCampana; uso: UsoCuenta | undefined; puedeAutorizar: boolean }) {
  const { campana: c, cuentas } = r;
  const { pending, correr } = useCorrer();
  const [plantilla, setPlantilla] = useState(c.plantilla);
  const [usarIA, setUsarIA] = useState(c.usarIA);
  const [leads, setLeads] = useState("");
  const total = ESTADOS_LEAD.reduce((s, e) => s + cuentas[e], 0);
  const salieron = total - cuentas.pendientes - cuentas["en-envio"] - cuentas.fallidos;
  const sucia = plantilla !== c.plantilla || usarIA !== c.usarIA;
  const problemas = problemasPlantilla(plantilla);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          {c.nombre}
          <Chip tono="azul">{SERVICIO_LABELS[c.linea]}</Chip>
          <Chip tono={c.estado === "activa" ? "verde" : c.estado === "pausada" ? "ambar" : "neutro"}>{ESTADO_CAMPANA_LABELS[c.estado]}</Chip>
        </CardTitle>
        <CardDescription>
          Creada por {c.creadaPor} el {fecha(c.creada)}
          {c.activada ? ` · activada por ${c.activada.por} el ${fecha(c.activada.fecha)}` : " · nadie la ha activado: no sale ningún correo"}
        </CardDescription>
        <CardAction>
          {c.estado === "activa" ? (
            <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => estadoCampanaAccion(c.id, "pausada"), "Campaña en pausa")}>
              <Pause /> Pausar
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={pending || !puedeAutorizar || (cuentas.pendientes === 0 && c.estado === "borrador")}
              title={puedeAutorizar ? undefined : "Solo el CEO o el gerente comercial pueden activar una campaña"}
              onClick={() => {
                if (window.confirm(`Vas a autorizar el envío de correos a ${cuentas.pendientes} leads de «${c.nombre}». ¿Activar?`)) {
                  correr(() => estadoCampanaAccion(c.id, "activa"), "Campaña activada");
                }
              }}
            >
              <Play /> {c.estado === "pausada" ? "Reanudar" : "Activar"}
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-2.5">
            <span className={ETIQUETA}>Enviados hoy</span>
            <p className="font-mono text-lg tabular-nums">
              {r.enviadosHoy}
              {uso && <span className="text-xs text-muted-foreground"> / {uso.tope}</span>}
            </p>
          </div>
          {(["pendientes", "enviados", "respondidos", "rebotados", "bajas", "fallidos"] as const).map((e) => (
            <div key={e} className="rounded-xl border border-border bg-muted/30 p-2.5">
              <span className={ETIQUETA}>{ESTADO_LEAD_LABELS[e]}</span>
              <p className="font-mono text-lg tabular-nums">{e === "enviados" ? salieron : cuentas[e]}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {total} leads en total. «Enviados» cuenta también a los que ya respondieron, rebotaron o pidieron no recibir.
          {cuentas["en-envio"] > 0 && ` ${cuentas["en-envio"]} saliendo ahora.`}
        </p>

        {r.sinConfirmar > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
            <span>
              {r.sinConfirmar} envíos quedaron sin confirmar (el servidor se cayó a mitad). Revisa «Enviados» en Gmail antes de
              devolverlos a la cola: podrían duplicarse.
            </span>
            {puedeAutorizar && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => devolverSinConfirmarAccion(c.id), "Listo")}>
                Devolver a la cola
              </Button>
            )}
          </div>
        )}

        {r.respuestas.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className={ETIQUETA}>Respuestas</span>
            <ul className="flex flex-col gap-2">
              {r.respuestas.map((l) => (
                <li key={l.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{l.tienda}</span>
                    <Chip tono={l.respuesta!.clasificacion === "interesado" ? "verde" : l.respuesta!.clasificacion === "no_interesado" ? "rojo" : "ambar"}>
                      {CLASIFICACION_LABELS[l.respuesta!.clasificacion]}
                    </Chip>
                    <span className="text-xs text-muted-foreground">
                      {l.respuesta!.de} · {fecha(l.respuesta!.fecha)}
                    </span>
                    <span className="ml-auto">
                      {l.prospectoId ? (
                        <Link href={`/prospectos/${l.prospectoId}`} className="text-xs font-medium text-primary hover:underline">
                          Abrir prospecto
                        </Link>
                      ) : (
                        l.respuesta!.clasificacion !== "no_interesado" && (
                          <Button variant="outline" size="sm" disabled={pending} onClick={() => correr(() => prospectoDesdeLeadAccion(c.id, l.id), "Prospecto creado")}>
                            Pasar a prospecto
                          </Button>
                        )
                      )}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-muted-foreground">«{l.respuesta!.texto}»</p>
                  {l.nota && <p className="mt-1 text-xs text-muted-foreground">{l.nota}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className="rounded-xl border border-border">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Plantilla, leads y descartes</summary>
          <div className="flex flex-col gap-3 border-t border-border p-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`p-${c.id}`}>Correo inicial</Label>
                <Textarea id={`p-${c.id}`} value={plantilla} onChange={(e) => setPlantilla(e.target.value)} rows={12} maxLength={4000} className="text-sm leading-relaxed" />
                {problemas.map((p) => (
                  <p key={p} className="text-xs text-destructive">
                    {p}
                  </p>
                ))}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={usarIA} onChange={(e) => setUsarIA(e.target.checked)} className="size-4 accent-primary" />
                  Que la IA adapte cada correo a la tienda
                </label>
                {sucia && (
                  <Button className="w-fit" disabled={pending || problemas.length > 0} onClick={() => correr(() => editarCampanaAccion(c.id, { plantilla, usarIA }), "Plantilla guardada")}>
                    Guardar plantilla
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">Los cambios aplican a los correos que aún no se han redactado.</p>
              </div>
              <VistaPrevia plantilla={plantilla} lead={r.muestra ?? LEAD_DE_EJEMPLO} />
            </div>

            <CampoLeads id={`l-${c.id}`} value={leads} onChange={setLeads} />
            <Button
              variant="outline"
              className="w-fit"
              disabled={pending || !leads.trim()}
              onClick={() => correr(() => editarCampanaAccion(c.id, { leads }), "Lista procesada", () => setLeads(""))}
            >
              <Plus /> Agregar leads
            </Button>

            {c.descartes.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className={ETIQUETA}>No entraron ({c.descartes.length})</span>
                <ul className="max-h-48 overflow-y-auto rounded-xl border border-border bg-muted/30 p-2 text-xs">
                  {c.descartes.map((d, i) => (
                    <li key={`${d.correo}-${i}`} className="flex flex-wrap gap-x-2 py-0.5">
                      <span className="font-mono">{d.correo || "(sin correo)"}</span>
                      <span className="text-muted-foreground">
                        {d.tienda} · {d.motivo}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}

/** Pantalla de campañas de correo en frío. */
export function Campanas({
  config,
  uso,
  campanas,
  puedeAutorizar,
  servidorActivo,
}: {
  config: ConfigCorreo;
  uso: UsoCuenta[];
  campanas: ResumenCampana[];
  puedeAutorizar: boolean;
  servidorActivo: boolean;
}) {
  const { pending, correr } = useCorrer();
  const [creando, setCreando] = useState(campanas.length === 0);
  const [exclusiones, setExclusiones] = useState(config.exclusiones.join("\n"));

  return (
    <div className="flex flex-col gap-4">
      {!servidorActivo && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          El servidor de envíos todavía no está conectado (falta SERVIDOR_SECRET). Puedes preparar campañas; no saldrá nada.
        </p>
      )}

      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-3",
          config.pausaGeneral ? "border-destructive/40 bg-destructive/10" : "border-border bg-card/60",
        )}
      >
        <div className="flex flex-wrap gap-2">
          {uso.map((u) => (
            <div key={u.linea} className="rounded-xl border border-border bg-card px-3 py-2">
              <span className={ETIQUETA}>Cuenta {SERVICIO_LABELS[u.linea]}</span>
              <p className="font-mono text-sm tabular-nums">
                {u.usados} / {u.tope} hoy
                <span className="text-xs text-muted-foreground"> · semana {u.semana}{config.inicio[u.linea] ? "" : " (aún no envía)"}</span>
              </p>
            </div>
          ))}
          <p className="max-w-md self-center text-xs text-muted-foreground">
            Tope diario por cuenta: {CALENTAMIENTO.join(" → ")} (sube cada semana). Lunes a viernes de {HORARIO.desde}:00 a{" "}
            {HORARIO.hasta}:00 del país del lead, con 2,5 a 5 minutos entre correos.
          </p>
        </div>
        {config.pausaGeneral ? (
          <Button
            disabled={pending || !puedeAutorizar}
            title={puedeAutorizar ? undefined : "Solo el CEO o el gerente comercial pueden quitar la pausa"}
            onClick={() => correr(() => pausaGeneralAccion(false), "Envíos reanudados")}
          >
            <Play /> Quitar pausa general
          </Button>
        ) : (
          <Button variant="destructive" disabled={pending} onClick={() => correr(() => pausaGeneralAccion(true), "Todos los envíos en pausa")}>
            <Ban /> Pausa general
          </Button>
        )}
      </div>
      {config.pausaGeneral && (
        <p className="text-sm font-medium text-destructive">Pausa general activa: no sale ningún correo (ni campañas, ni entregas, ni seguimientos).</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nueva campaña</CardTitle>
          <CardAction>
            <Button variant="ghost" size="sm" onClick={() => setCreando((v) => !v)}>
              {creando ? "Cerrar" : "Abrir"}
            </Button>
          </CardAction>
        </CardHeader>
        {creando && (
          <CardContent>
            <NuevaCampana alCrear={() => setCreando(false)} />
          </CardContent>
        )}
      </Card>

      {campanas.map((r) => (
        <TarjetaCampana key={`${r.campana.id}-${r.campana.plantilla.length}-${r.campana.usarIA}`} r={r} uso={uso.find((u) => u.linea === r.campana.linea)} puedeAutorizar={puedeAutorizar} />
      ))}
      {campanas.length === 0 && <p className="text-center text-sm text-muted-foreground">Todavía no hay campañas.</p>}

      <Card>
        <CardHeader>
          <CardTitle>Lista de exclusión</CardTitle>
          <CardDescription>
            Correos o dominios a los que nunca se les escribe (clientes actuales, competencia, quien lo pidió por otro medio). Uno
            por línea. Quien responde «no» o rebota queda excluido solo, aunque no aparezca aquí.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Textarea value={exclusiones} onChange={(e) => setExclusiones(e.target.value)} rows={5} placeholder={"tiendaamiga.com\ngerencia@otratienda.co"} className="font-mono text-xs" aria-label="Lista de exclusión" />
          <Button
            variant="outline"
            className="w-fit"
            disabled={pending || exclusiones === config.exclusiones.join("\n")}
            onClick={() => correr(() => guardarExclusionesAccion(exclusiones), "Lista guardada")}
          >
            Guardar lista
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
